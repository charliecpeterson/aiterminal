export type QuickActionType = 'explain' | 'explainError' | 'suggestFix' | 'whatsNext';

export interface QuickActionConfig {
  type: QuickActionType;
  label: string;
  icon: string;
  systemPrompt: string;
  userPromptTemplate: (command: string, output?: string) => string;
  showCondition?: (exitCode?: number, hasOutput?: boolean) => boolean;
}

// Tailored system prompts for each action type
export const QUICK_ACTIONS: Record<QuickActionType, QuickActionConfig> = {
  explain: {
    type: 'explain',
    label: 'Explain This',
    icon: '',
    systemPrompt: `You are a helpful terminal assistant. When given a command and its output:
- Explain what the command does in clear, concise language
- Describe what the output shows or means
- Point out any notable patterns, warnings, or important details
- Keep the explanation practical and focused on what the user needs to know
- Use examples when helpful
Keep your response brief and actionable.`,
    userPromptTemplate: (command: string, output?: string) => {
      if (output) {
        return `Explain this command and its output:\n\nCommand:\n${command}\n\nOutput:\n${output}`;
      }
      return `Explain what this command does:\n${command}`;
    },
    showCondition: () => true, // Always available
  },

  explainError: {
    type: 'explainError',
    label: 'Explain Error',
    icon: '',
    systemPrompt: `You are an expert debugging assistant. When given a failed command and its error output:
- Identify the specific error that occurred
- Explain why it happened (root cause)
- Describe what the error message means in plain terms
- Point out any relevant context from the command or output
- Keep the explanation focused on understanding the problem
Be clear, empathetic, and educational. Don't suggest fixes yet - focus on understanding.`,
    userPromptTemplate: (command: string, output?: string) => {
      return `This command failed. Help me understand what went wrong:\n\nCommand:\n${command}\n\nError output:\n${output || '(no output)'}`;
    },
    showCondition: (exitCode) => exitCode !== undefined && exitCode !== 0,
  },

  suggestFix: {
    type: 'suggestFix',
    label: 'Suggest Fix',
    icon: '',
    systemPrompt: `You are a solution-focused terminal assistant. When given a failed command:
- Provide specific, actionable fixes for the error
- List multiple solutions if applicable (ordered by likelihood of success)
- Include the exact commands to run when possible
- Explain why each fix should work
- Warn about potential side effects or considerations
Format fixes as clear steps or code blocks. Be practical and direct.`,
    userPromptTemplate: (command: string, output?: string) => {
      return `This command failed. Suggest how to fix it:\n\nCommand:\n${command}\n\nError output:\n${output || '(no output)'}\n\nProvide specific fixes I can try.`;
    },
    showCondition: (exitCode) => exitCode !== undefined && exitCode !== 0,
  },

  whatsNext: {
    type: 'whatsNext',
    label: "What's Next?",
    icon: '➡️',
    systemPrompt: `You are a workflow assistant helping users accomplish their goals. When given a successful command and output:
- Infer what the user is trying to accomplish
- Suggest logical next steps in that workflow
- Provide specific commands when applicable
- Explain why each suggestion makes sense
- Keep suggestions relevant to the current context
Be concise and focus on the 2-3 most likely next actions. Format commands as code blocks.`,
    userPromptTemplate: (command: string, output?: string) => {
      return `This command succeeded. What are logical next steps?\n\nCommand:\n${command}\n\nOutput:\n${output || '(no output)'}`;
    },
    showCondition: (exitCode) => exitCode === undefined || exitCode === 0,
  },
};

export interface ExecuteQuickActionParams {
  actionType: QuickActionType;
  command: string;
  output?: string;
  exitCode?: number;
  cwd?: string;
}

/**
 * Format the user's query with rich context for quick actions
 */
export function buildQuickActionPrompt(params: ExecuteQuickActionParams): {
  systemPrompt: string;
  userPrompt: string;
} {
  const action = QUICK_ACTIONS[params.actionType];
  
  const userPrompt = action.userPromptTemplate(params.command, params.output);
  
  // Add optional context
  const contextParts: string[] = [userPrompt];
  
  if (params.cwd) {
    contextParts.push(`\nCurrent directory: ${params.cwd}`);
  }
  
  if (params.exitCode !== undefined) {
    contextParts.push(`Exit code: ${params.exitCode}`);
  }
  
  return {
    systemPrompt: action.systemPrompt,
    userPrompt: contextParts.join('\n'),
  };
}

/**
 * Check if a quick action should be shown based on the command state
 */
export function shouldShowAction(
  actionType: QuickActionType,
  exitCode?: number,
  hasOutput?: boolean
): boolean {
  const action = QUICK_ACTIONS[actionType];
  if (!action.showCondition) return true;
  return action.showCondition(exitCode, hasOutput);
}
