import { Card, Group, Progress, Text } from "@mantine/core";
import type { SimulationConfigTimeUnit } from "../../api/ocpnEditor";
import type { SimulationProgress } from "../../lib/simulationStream";
import { formatSpan, TIME_UNIT_MS } from "../../lib/time";

export const SimulationProgressCard = ({
  progress,
  timeUnit,
}: {
  /** null until the first progress message arrives */
  progress: SimulationProgress | null;
  timeUnit: SimulationConfigTimeUnit;
}) => {
  const unitMs = TIME_UNIT_MS[timeUnit];
  const percent = progress?.duration
    ? Math.min(100, (progress.clock / progress.duration) * 100)
    : 0;

  return (
    <Card withBorder radius="sm" padding="sm">
      <Group justify="space-between" mb={6}>
        <Text fw={600} size="sm">
          Simulating…
        </Text>
        <Text size="xs" c="dimmed">
          {(progress?.event_count ?? 0).toLocaleString()} events
        </Text>
      </Group>
      <Progress
        value={progress ? percent : 100}
        size="sm"
        striped
        animated
        transitionDuration={200}
      />
      <Text size="xs" c="dimmed" mt={6}>
        {progress
          ? `${formatSpan(progress.clock * unitMs)} of ${formatSpan(progress.duration * unitMs)} simulated`
          : "Starting…"}
      </Text>
    </Card>
  );
};
