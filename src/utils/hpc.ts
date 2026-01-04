export function parseSlurmCounts(raw: string): { running: number; queued: number } {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { running: 0, queued: 0 };
  }

  if (trimmed.includes("|")) {
    const counts = new Map<string, number>();
    for (const line of trimmed.split(/\r?\n/)) {
      if (!line.trim()) continue;
      const [state, countRaw] = line.split("|").map((part) => part.trim());
      const count = Number.parseInt(countRaw, 10);
      if (state && Number.isFinite(count)) {
        counts.set(state.toUpperCase(), count);
      }
    }
    return {
      running: counts.get("RUNNING") ?? counts.get("R") ?? 0,
      queued: counts.get("PENDING") ?? counts.get("PD") ?? counts.get("Q") ?? 0,
    };
  }

  const lines = trimmed.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const running = lines.filter((line) => {
    const state = line.toUpperCase();
    return state.startsWith("RUNNING") || state === "R";
  }).length;
  const queued = lines.filter((line) => {
    const state = line.toUpperCase();
    return state.startsWith("PENDING") || state === "PD" || state === "Q";
  }).length;

  return { running, queued };
}
