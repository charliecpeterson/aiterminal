/**
 * Load and cache Fig autocomplete specs
 * Dynamically imports specs on-demand
 */

import type { Suggestion } from './types';

interface FigSpec {
  name: string;
  description?: string;
  subcommands?: FigSubcommand[];
  options?: FigOption[];
  args?: FigArg[];
}

interface FigSubcommand {
  name: string | string[];
  description?: string;
  options?: FigOption[];
  args?: FigArg[];
}

interface FigOption {
  name: string | string[];
  description?: string;
  args?: FigArg[];
}

interface FigArg {
  name?: string;
  description?: string;
  suggestions?: string[];
}

// Cache for loaded specs
const specCache = new Map<string, FigSpec>();

/**
 * Load a Fig spec for a given command
 */
export async function loadSpec(command: string): Promise<FigSpec | null> {
  // Check cache first
  if (specCache.has(command)) {
    return specCache.get(command) || null;
  }

  try {
    // Try to dynamically import the spec
    // @withfig/autocomplete exports specs as CommonJS from build/ folder
    const specModule = await import(`@withfig/autocomplete/build/${command}.js`);
    
    // Handle both ESM default export and CommonJS module.exports
    const figSpec = (specModule.default || specModule) as FigSpec;
    
    // Validate we got a spec object
    if (!figSpec || typeof figSpec !== 'object') {
      return null;
    }
    
    // Cache it
    specCache.set(command, figSpec);
    return figSpec;
  } catch (error) {
    // Spec doesn't exist for this command (silently ignore)
    return null;
  }
}

/**
 * Get suggestions from a spec based on current context
 */
export function getSuggestionsFromSpec(
  spec: FigSpec,
  tokens: string[],
  currentToken: string,
  tokenType: 'subcommand' | 'option' | 'argument'
): Suggestion[] {
  const suggestions: Suggestion[] = [];

  if (tokenType === 'subcommand' && tokens.length === 1) {
    // First level subcommands
    if (spec.subcommands) {
      for (const sub of spec.subcommands) {
        const names = Array.isArray(sub.name) ? sub.name : [sub.name];
        for (const name of names) {
          if (name.toLowerCase().startsWith(currentToken.toLowerCase())) {
            suggestions.push({
              name,
              description: sub.description,
              type: 'subcommand',
            });
          }
        }
      }
    }
  } else if (tokenType === 'option') {
    // Options/flags (start with -)
    const currentSubcommand = findCurrentSubcommand(spec, tokens);
    const options = currentSubcommand?.options || spec.options || [];
    
    for (const opt of options) {
      const names = Array.isArray(opt.name) ? opt.name : [opt.name];
      for (const name of names) {
        if (name.toLowerCase().startsWith(currentToken.toLowerCase())) {
          suggestions.push({
            name,
            description: opt.description,
            type: 'option',
          });
        }
      }
    }
  }

  return suggestions;
}

/**
 * Find the current subcommand in the spec tree
 */
function findCurrentSubcommand(spec: FigSpec, tokens: string[]): FigSubcommand | null {
  if (!spec.subcommands || tokens.length < 2) return null;
  
  const subcommandName = tokens[1];
  return spec.subcommands.find(sub => {
    const names = Array.isArray(sub.name) ? sub.name : [sub.name];
    return names.includes(subcommandName);
  }) || null;
}
