export function computeOutputInfo(
  startLine: number,
  endLine: number,
  outputStartLine: number | null
): { hasOutput: boolean; safeOutputStart: number } {
  if (outputStartLine === null) {
    return { hasOutput: false, safeOutputStart: startLine + 1 };
  }
  if (outputStartLine < startLine || outputStartLine > endLine) {
    return { hasOutput: false, safeOutputStart: startLine + 1 };
  }

  const safeOutputStart = Math.max(outputStartLine, startLine + 1);
  const hasOutput = safeOutputStart <= endLine;
  return { hasOutput, safeOutputStart };
}

export function computeEndLineForMarkers(params: {
  startLine: number;
  bufferLength: number;
  markers: number[];
  doneLine?: number;
  isPythonREPL?: boolean;
  isRREPL?: boolean;
}): number {
  const { startLine, bufferLength, markers, doneLine, isPythonREPL, isRREPL } = params;
  let endLine = bufferLength - 1;

  if ((isPythonREPL || isRREPL) && doneLine != null && doneLine >= 0) {
    endLine = Math.min(endLine, Math.max(startLine, doneLine - 1));
    return endLine;
  }

  let nextLine: number | null = null;
  for (const line of markers) {
    if (line <= startLine) continue;
    if (line < 0) continue;
    if (nextLine === null || line < nextLine) {
      nextLine = line;
    }
  }

  if (nextLine !== null) {
    endLine = nextLine - 1;
  }

  return Math.max(startLine, endLine);
}

export function computeRangesForMarkers(params: {
  startLine: number;
  endLine: number;
  outputStartLine: number | null;
  isBootstrap: boolean;
}): {
  commandRange: [number, number];
  outputRange: [number, number] | null;
  disabled: boolean;
  outputDisabled: boolean;
} {
  const { startLine, endLine, outputStartLine, isBootstrap } = params;
  const { hasOutput, safeOutputStart } = computeOutputInfo(
    startLine,
    endLine,
    outputStartLine
  );
  const cmdEnd = Math.max(
    startLine,
    (hasOutput ? safeOutputStart : startLine + 1) - 1
  );

  return {
    commandRange: [startLine, cmdEnd],
    outputRange: hasOutput ? [safeOutputStart, endLine] : null,
    disabled: isBootstrap,
    outputDisabled: !hasOutput || isBootstrap,
  };
}
