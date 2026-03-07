import { useEffect, useMemo, useState } from "react";
import type { TimelineEvent } from "@talon/core";

export function useTimelineSignals(timeline: TimelineEvent[]) {
  const [activeSignalFilter, setActiveSignalFilter] = useState<string | null>(null);

  const repeatedSignalCounts = useMemo(() => {
    const counts = new Map<string, number>();
    for (const item of timeline) {
      if (!item.stderrClass) continue;
      counts.set(item.stderrClass, (counts.get(item.stderrClass) ?? 0) + 1);
    }
    return counts;
  }, [timeline]);

  const repeatedSignals = useMemo(
    () =>
      Array.from(repeatedSignalCounts.entries())
        .filter(([, count]) => count >= 2)
        .sort((left, right) => right[1] - left[1]),
    [repeatedSignalCounts],
  );

  const signalSummary = useMemo(() => {
    if (!activeSignalFilter) return repeatedSignals;
    if (!repeatedSignalCounts.has(activeSignalFilter)) return repeatedSignals;
    if (repeatedSignals.some(([signal]) => signal === activeSignalFilter)) return repeatedSignals;
    return [[activeSignalFilter, repeatedSignalCounts.get(activeSignalFilter) ?? 1] as [string, number], ...repeatedSignals];
  }, [activeSignalFilter, repeatedSignalCounts, repeatedSignals]);

  const visibleTimeline = useMemo(
    () => (activeSignalFilter ? timeline.filter((item) => item.stderrClass === activeSignalFilter) : timeline),
    [activeSignalFilter, timeline],
  );

  useEffect(() => {
    if (!activeSignalFilter) return;
    if (timeline.some((item) => item.stderrClass === activeSignalFilter)) return;
    setActiveSignalFilter(null);
  }, [activeSignalFilter, timeline]);

  return {
    activeSignalFilter,
    setActiveSignalFilter,
    repeatedSignalCounts,
    signalSummary,
    visibleTimeline,
  };
}
