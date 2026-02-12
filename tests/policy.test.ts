import { describe, expect, it } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");
const SRC_ROOT = path.join(ROOT, "src");

function walkFiles(dir: string, out: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(fullPath, out);
    } else if (entry.isFile()) {
      if (fullPath.endsWith(".ts") || fullPath.endsWith(".tsx")) {
        out.push(fullPath);
      }
    }
  }
  return out;
}

function findMatches(pattern: RegExp): string[] {
  const files = walkFiles(SRC_ROOT);
  const matches: string[] = [];
  for (const file of files) {
    const content = fs.readFileSync(file, "utf8");
    if (pattern.test(content)) {
      matches.push(path.relative(ROOT, file));
    }
  }
  return matches;
}

describe("AI policy guardrails", () => {
  it("does not use execute_tool_command in frontend code", () => {
    const matches = findMatches(/\bexecute_tool_command\b/);
    expect(matches).toEqual([]);
  });

  it("does not use read_file_tool in frontend code", () => {
    const matches = findMatches(/\bread_file_tool\b/);
    expect(matches).toEqual([]);
  });
});
