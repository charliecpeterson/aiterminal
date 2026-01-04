import { describe, expect, it } from "vitest";
import {
  computeEndLineForMarkers,
  computeOutputInfo,
  computeRangesForMarkers,
} from "../src/utils/markerRanges";

describe("computeEndLineForMarkers", () => {
  it("uses next marker line when available", () => {
    const end = computeEndLineForMarkers({
      startLine: 10,
      bufferLength: 100,
      markers: [2, 20, 40],
    });
    expect(end).toBe(19);
  });

  it("ignores markers before start line", () => {
    const end = computeEndLineForMarkers({
      startLine: 10,
      bufferLength: 100,
      markers: [2, 9],
    });
    expect(end).toBe(99);
  });

  it("uses doneLine for REPL markers", () => {
    const end = computeEndLineForMarkers({
      startLine: 10,
      bufferLength: 100,
      markers: [30],
      doneLine: 18,
      isPythonREPL: true,
    });
    expect(end).toBe(17);
  });
});

describe("computeOutputInfo", () => {
  it("clamps outputStartLine to start+1", () => {
    const info = computeOutputInfo(10, 20, 10);
    expect(info.hasOutput).toBe(true);
    expect(info.safeOutputStart).toBe(11);
  });

  it("returns no output when outputStartLine is out of range", () => {
    const info = computeOutputInfo(10, 20, 30);
    expect(info.hasOutput).toBe(false);
  });
});

describe("computeRangesForMarkers", () => {
  it("computes command/output ranges", () => {
    const ranges = computeRangesForMarkers({
      startLine: 10,
      endLine: 15,
      outputStartLine: 12,
      isBootstrap: false,
    });
    expect(ranges.commandRange).toEqual([10, 11]);
    expect(ranges.outputRange).toEqual([12, 15]);
    expect(ranges.outputDisabled).toBe(false);
  });

  it("disables output for bootstrap markers", () => {
    const ranges = computeRangesForMarkers({
      startLine: 10,
      endLine: 15,
      outputStartLine: 12,
      isBootstrap: true,
    });
    expect(ranges.disabled).toBe(true);
    expect(ranges.outputDisabled).toBe(true);
  });
});
