import { describe, expect, it } from "vitest";
import {
  classifyAndRoute,
  calculateComplexityScore,
  detectQueryType,
  scoreToTier,
  isAutoRoutingEnabled,
  getAutoRoutingSettings,
} from "../src/ai/queryRouter";
import type { ContextItem } from "../src/context/AIContext";
import type { AiSettings } from "../src/context/SettingsContext";

// Helper to create minimal AiSettings
function createSettings(overrides: Partial<AiSettings> = {}): AiSettings {
  return {
    provider: "openai",
    model: "gpt-4.1",
    api_key: "test-key",
    mode: "agent",
    ...overrides,
  };
}

// Helper to create context items
function createContextItem(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: "test-1",
    type: "terminal",
    label: "Test Output",
    content: "sample content",
    timestamp: Date.now(),
    includeMode: "smart",
    ...overrides,
  };
}

describe("detectQueryType", () => {
  it("detects simple/factual queries", () => {
    expect(detectQueryType("what is TypeScript?", [])).toBe("factual");
    expect(detectQueryType("what does npm install do?", [])).toBe("factual");
    expect(detectQueryType("list all files", [])).toBe("factual");
    expect(detectQueryType("show me the config", [])).toBe("factual");
  });

  it("detects code queries", () => {
    expect(detectQueryType("write a function to sort an array", [])).toBe("code");
    expect(detectQueryType("create a React component for a button", [])).toBe("code");
    expect(detectQueryType("implement a binary search class", [])).toBe("code");
    expect(detectQueryType("refactor this code to use hooks", [])).toBe("code");
  });

  it("detects debug queries", () => {
    expect(detectQueryType("fix this error", [])).toBe("debug");
    expect(detectQueryType("debug the failing test", [])).toBe("debug");
    expect(detectQueryType("why is this not working?", [])).toBe("debug");
    expect(detectQueryType("my code is broken", [])).toBe("debug");
  });

  it("detects debug when context has errors", () => {
    const contextWithError = [
      createContextItem({
        metadata: { exitCode: 1 },
      }),
    ];
    // Even a simple-looking query becomes debug if context has errors
    expect(detectQueryType("help me", contextWithError)).toBe("debug");
  });

  it("detects creative queries", () => {
    expect(detectQueryType("design a database schema", [])).toBe("creative");
    expect(detectQueryType("brainstorm some ideas", [])).toBe("creative");
    expect(detectQueryType("what is the best approach?", [])).toBe("creative");
    expect(detectQueryType("suggest some alternatives", [])).toBe("creative");
  });

  it("detects complex queries", () => {
    expect(detectQueryType("analyze the performance of this", [])).toBe("complex");
    expect(detectQueryType("compare these two architectures", [])).toBe("complex");
    expect(detectQueryType("evaluate the security implications", [])).toBe("complex");
    expect(detectQueryType("explain why this happens in detail", [])).toBe("complex");
  });

  it("defaults to explanation for medium queries", () => {
    expect(detectQueryType("tell me about React hooks and their uses", [])).toBe("explanation");
  });
});

describe("calculateComplexityScore", () => {
  it("returns low score for simple queries", () => {
    const { score } = calculateComplexityScore("what is npm?", []);
    expect(score).toBeLessThanOrEqual(35);
  });

  it("returns high score for complex queries with errors", () => {
    const contextWithError = [
      createContextItem({
        metadata: { exitCode: 1 },
        content: "Error: Cannot find module 'foo'\n    at require...",
      }),
    ];
    const { score } = calculateComplexityScore("fix this error", contextWithError);
    expect(score).toBeGreaterThanOrEqual(70);
  });

  it("increases score for more context items", () => {
    const singleContext = [createContextItem()];
    const multipleContext = [
      createContextItem({ id: "1" }),
      createContextItem({ id: "2" }),
      createContextItem({ id: "3" }),
      createContextItem({ id: "4" }),
    ];

    const { score: single } = calculateComplexityScore("help", singleContext);
    const { score: multiple } = calculateComplexityScore("help", multipleContext);

    expect(multiple).toBeGreaterThan(single);
  });

  it("increases score for file context", () => {
    const terminalContext = [createContextItem({ type: "terminal" })];
    const fileContext = [createContextItem({ type: "file" })];

    const { score: terminal } = calculateComplexityScore("help", terminalContext);
    const { score: file } = calculateComplexityScore("help", fileContext);

    expect(file).toBeGreaterThan(terminal);
  });

  it("increases score for large context", () => {
    const smallContext = [createContextItem({ content: "small" })];
    const largeContext = [createContextItem({ content: "x".repeat(6000) })];

    const { score: small } = calculateComplexityScore("help", smallContext);
    const { score: large } = calculateComplexityScore("help", largeContext);

    expect(large).toBeGreaterThan(small);
  });

  it("returns scoring factors for transparency", () => {
    const { factors } = calculateComplexityScore("fix this error", []);
    
    expect(factors.length).toBe(4);
    expect(factors.map(f => f.name)).toContain("prompt_length");
    expect(factors.map(f => f.name)).toContain("context_complexity");
    expect(factors.map(f => f.name)).toContain("keyword_matching");
    expect(factors.map(f => f.name)).toContain("error_presence");
  });
});

describe("scoreToTier", () => {
  it("maps low scores to simple tier", () => {
    expect(scoreToTier(0)).toBe("simple");
    expect(scoreToTier(20)).toBe("simple");
    expect(scoreToTier(35)).toBe("simple");
  });

  it("maps medium scores to moderate tier", () => {
    expect(scoreToTier(36)).toBe("moderate");
    expect(scoreToTier(50)).toBe("moderate");
    expect(scoreToTier(69)).toBe("moderate");
  });

  it("maps high scores to complex tier", () => {
    expect(scoreToTier(70)).toBe("complex");
    expect(scoreToTier(85)).toBe("complex");
    expect(scoreToTier(100)).toBe("complex");
  });
});

describe("classifyAndRoute", () => {
  it("routes simple queries to simple tier", () => {
    const settings = createSettings({
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "gpt-4.1",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });

    const result = classifyAndRoute("what is npm?", [], settings, "chat");
    
    expect(result.tier).toBe("simple");
    expect(result.complexity).toBe(1);
    expect(result.model).toBe("gpt-4o-mini");
  });

  it("routes complex queries to complex tier", () => {
    const contextWithError = [
      createContextItem({
        metadata: { exitCode: 1 },
        content: "TypeError: Cannot read property 'map' of undefined\n    at...",
      }),
    ];
    
    const settings = createSettings({
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "claude-3-opus",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });

    const result = classifyAndRoute("fix this error", contextWithError, settings, "agent");
    
    expect(result.tier).toBe("complex");
    expect(result.complexity).toBe(3);
    expect(result.model).toBe("claude-3-opus");
  });

  it("uses main model when auto-routing is disabled", () => {
    const settings = createSettings({
      model: "gpt-4.1",
      auto_routing: {
        enabled: false,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "claude-3-opus",
        enable_prompt_enhancement: false,
        show_routing_info: false,
        export_routing_detail: "minimal",
      },
    });

    const result = classifyAndRoute("what is npm?", [], settings, "chat");
    
    // Still calculates tier but uses main model
    expect(result.model).toBe("gpt-4.1");
    expect(result.fallbackUsed).toBe(false);
  });

  it("falls back to main model when tier model is not configured", () => {
    const settings = createSettings({
      model: "gpt-4.1",
      auto_routing: {
        enabled: true,
        simple_model: "", // Not configured
        moderate_model: "",
        complex_model: "",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });

    const result = classifyAndRoute("what is npm?", [], settings, "chat");
    
    expect(result.model).toBe("gpt-4.1");
    expect(result.fallbackUsed).toBe(true);
  });

  it("includes reasoning in the decision", () => {
    const settings = createSettings();
    const result = classifyAndRoute("debug this error", [], settings, "agent");

    expect(result.reasoning).toBeDefined();
    expect(result.reasoning.queryType).toBe("debug");
    expect(result.reasoning.score).toBeGreaterThan(0);
    expect(result.reasoning.factors.length).toBeGreaterThan(0);
  });

  it("sets appropriate temperature based on query type", () => {
    const settings = createSettings();
    
    // Factual queries should have low temperature
    const factual = classifyAndRoute("what is npm?", [], settings, "chat");
    expect(factual.reasoning.queryType).toBe("factual");
    expect(factual.temperature).toBeLessThanOrEqual(0.3);
    
    // Creative queries should have higher temperature
    const creative = classifyAndRoute("brainstorm some ideas for the UI", [], settings, "chat");
    expect(creative.reasoning.queryType).toBe("creative");
    expect(creative.temperature).toBeGreaterThanOrEqual(0.7);
  });

  it("adjusts context budget by tier", () => {
    const settings = createSettings({
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "gpt-4.1",
        simple_budget: 4000,
        moderate_budget: 8000,
        complex_budget: 12000,
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });

    const simple = classifyAndRoute("what is npm?", [], settings, "chat");
    const complex = classifyAndRoute("fix this critical error", [
      createContextItem({ metadata: { exitCode: 1 } }),
    ], settings, "chat");

    expect(simple.contextBudget).toBeLessThan(complex.contextBudget);
  });
});

describe("isAutoRoutingEnabled", () => {
  it("returns true when explicitly enabled", () => {
    const settings = createSettings({
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "gpt-4.1",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });
    expect(isAutoRoutingEnabled(settings)).toBe(true);
  });

  it("returns false when explicitly disabled", () => {
    const settings = createSettings({
      auto_routing: {
        enabled: false,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "gpt-4.1",
        enable_prompt_enhancement: false,
        show_routing_info: false,
        export_routing_detail: "minimal",
      },
    });
    expect(isAutoRoutingEnabled(settings)).toBe(false);
  });

  it("returns true when auto_routing is undefined (default)", () => {
    const settings = createSettings();
    // When auto_routing is undefined, enabled defaults to true
    expect(isAutoRoutingEnabled(settings)).toBe(true);
  });
});

describe("getAutoRoutingSettings", () => {
  it("returns defaults with main model when auto_routing is undefined", () => {
    const settings = createSettings({ model: "gpt-4.1" });
    const autoSettings = getAutoRoutingSettings(settings);

    expect(autoSettings.enabled).toBe(true);
    expect(autoSettings.simple_model).toBe("gpt-4.1");
    expect(autoSettings.moderate_model).toBe("gpt-4.1");
    expect(autoSettings.complex_model).toBe("gpt-4.1");
  });

  it("merges user settings with defaults", () => {
    const settings = createSettings({
      model: "gpt-4.1",
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "", // Empty, should fall back to main model
        complex_model: "claude-3-opus",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
      },
    });

    const autoSettings = getAutoRoutingSettings(settings);

    expect(autoSettings.simple_model).toBe("gpt-4o-mini");
    expect(autoSettings.moderate_model).toBe("gpt-4.1"); // Fallback to main
    expect(autoSettings.complex_model).toBe("claude-3-opus");
  });

  it("uses default budgets when not specified", () => {
    const settings = createSettings({
      auto_routing: {
        enabled: true,
        simple_model: "gpt-4o-mini",
        moderate_model: "gpt-4.1",
        complex_model: "gpt-4.1",
        enable_prompt_enhancement: true,
        show_routing_info: true,
        export_routing_detail: "standard",
        // No budgets specified
      },
    });

    const autoSettings = getAutoRoutingSettings(settings);

    expect(autoSettings.simple_budget).toBe(4000);
    expect(autoSettings.moderate_budget).toBe(8000);
    expect(autoSettings.complex_budget).toBe(12000);
  });
});
