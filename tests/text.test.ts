import { describe, expect, it } from "vitest";
import { normalizeQuotes } from "../src/utils/text";

describe("normalizeQuotes", () => {
  it("replaces curly quotes with ASCII quotes", () => {
    const input = "“double” and ‘single’";
    expect(normalizeQuotes(input)).toBe("\"double\" and 'single'");
  });

  it("leaves ASCII quotes untouched", () => {
    const input = "\"double\" and 'single'";
    expect(normalizeQuotes(input)).toBe(input);
  });
});
