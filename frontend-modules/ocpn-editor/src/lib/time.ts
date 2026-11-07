import type { SimulationConfigTimeUnit } from "../api/ocpnEditor";

/** Milliseconds per simulation time unit. */
export const TIME_UNIT_MS: Record<SimulationConfigTimeUnit, number> = {
  seconds: 1000,
  minutes: 60_000,
  hours: 3_600_000,
  days: 86_400_000,
};

/** A duration as its two largest units, e.g. "3 d 4 h". */
export const formatSpan = (ms: number) => {
  const units: [string, number][] = [
    ["d", 86_400_000],
    ["h", 3_600_000],
    ["min", 60_000],
    ["s", 1000],
  ];
  const parts: string[] = [];
  let rest = Math.max(0, ms);
  for (const [unit, size] of units) {
    const amount = Math.floor(rest / size);
    if (amount > 0) parts.push(`${amount} ${unit}`);
    rest -= amount * size;
    if (parts.length === 2) break;
  }
  return parts.length ? parts.join(" ") : "0 s";
};
