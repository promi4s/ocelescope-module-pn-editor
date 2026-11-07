import { Card, SimpleGrid, Stack, Text } from "@mantine/core";
import type { ReactNode } from "react";
import type { SimulationResult } from "../../api/ocpnEditor";

const formatSpan = (ms: number) => {
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

const Stat = ({ label, value }: { label: string; value: ReactNode }) => (
  <Stack gap={0}>
    <Text size="xs" c="dimmed">
      {label}
    </Text>
    <Text fw={600} size="sm">
      {value}
    </Text>
  </Stack>
);

export const SimulationSummary = ({
  result,
  startTime,
}: {
  result: SimulationResult;
  startTime: string;
}) => {
  const visibleEvents = result.events.filter((event) => !event.silent).length;
  const objectsByType = new Map<string, Set<string>>();
  for (const event of result.events) {
    for (const [type, ids] of Object.entries(event.objects)) {
      const set = objectsByType.get(type) ?? new Set<string>();
      for (const id of ids) set.add(id);
      objectsByType.set(type, set);
    }
  }
  const span =
    new Date(result.end_time).getTime() - new Date(startTime).getTime();

  return (
    <Card withBorder radius="sm" padding="sm">
      <Text fw={600} size="sm" mb="xs">
        Summary
      </Text>
      <SimpleGrid cols={2} spacing="xs" verticalSpacing="xs">
        <Stat label="Events" value={visibleEvents} />
        <Stat label="Simulated time" value={formatSpan(span)} />
        {Array.from(objectsByType, ([type, ids]) => (
          <Stat key={type} label={`Objects: ${type}`} value={ids.size} />
        ))}
      </SimpleGrid>
    </Card>
  );
};
