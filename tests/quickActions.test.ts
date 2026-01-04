import { describe, expect, it } from "vitest";
import { parseQuickActionCommands } from "../src/utils/quickActions";

describe("parseQuickActionCommands", () => {
  it("splits lines, trims, and removes empties", () => {
    const input = "  npm install  \n\nnpm run build\n  \n";
    expect(parseQuickActionCommands(input)).toEqual(["npm install", "npm run build"]);
  });

  it("normalizes curly quotes", () => {
    const input = "git commit -m “update”\n";
    expect(parseQuickActionCommands(input)).toEqual(["git commit -m \"update\""]);
  });
});
