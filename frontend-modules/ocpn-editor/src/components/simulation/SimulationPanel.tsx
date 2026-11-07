import { Button, Card, Group, Modal, Stack, Text } from "@mantine/core";
import {
  DownloadIcon,
  PlayIcon,
  SlidersHorizontal,
  SquareIcon,
} from "lucide-react";
import { useState } from "react";
import type {
  OcpnImportResponse as ObjectCentricPetriNet,
  SimulationConfig,
} from "../../api/ocpnEditor";
import { downloadFile } from "../../lib/download";
import { EventsTable } from "./EventsTable";
import { SimulationProgressCard } from "./SimulationProgressCard";
import {
  defaultSimulationConfig,
  describeSettings,
  SimulationSettings,
} from "./SimulationSettings";
import { SimulationSummary } from "./SimulationSummary";
import { useSimulation } from "./useSimulation";

/** Sidebar of the Simulate mode: settings, run/cancel, progress and the resulting event log. */
export const SimulationPanel = ({
  net,
  selectedNodeIds,
}: {
  net: ObjectCentricPetriNet;
  /** nodes selected in the editor; a selected transition opens its settings */
  selectedNodeIds: string[];
}) => {
  const [config, setConfig] = useState<SimulationConfig>(
    defaultSimulationConfig,
  );
  const [settingsOpened, setSettingsOpened] = useState(false);
  const { result, progress, running, run, cancel } = useSimulation();

  const handleRun = () => run({ ocpn: net, config });

  const handleDownloadLog = () => {
    if (!result) return;
    downloadFile(
      "simulated_log.json",
      JSON.stringify(result.ocel, null, 2),
      "application/json",
    );
  };

  const selectedTransition =
    selectedNodeIds.find((id) =>
      net.petri_net.transitions.some((t) => t.id === id),
    ) ?? null;

  return (
    <>
      <Stack gap="xs" p="md">
        <Card withBorder radius="sm" padding="sm">
          <Text fw={600} size="sm">
            Simulation
          </Text>
          <Text size="xs" c="dimmed" mb="xs">
            Simulates the current net from its initial marking.
          </Text>
          <Button
            fullWidth
            variant="default"
            leftSection={<SlidersHorizontal size={16} />}
            onClick={() => setSettingsOpened(true)}
            disabled={running}
          >
            Settings
          </Button>
          <Text size="xs" c="dimmed" mt={4} mb="xs">
            {describeSettings(config, net)}
          </Text>
          <Group grow gap="xs">
            {running ? (
              <Button
                color="red"
                variant="light"
                leftSection={<SquareIcon size={14} />}
                onClick={cancel}
              >
                Cancel
              </Button>
            ) : (
              <Button onClick={handleRun}>Run</Button>
            )}
            <Button
              variant="default"
              leftSection={<DownloadIcon size={16} />}
              disabled={!result}
              onClick={handleDownloadLog}
            >
              Export
            </Button>
          </Group>
        </Card>

        {result && (
          <SimulationSummary
            result={result}
            startTime={config.start_time ?? ""}
          />
        )}

        {running && (
          <SimulationProgressCard
            progress={progress}
            timeUnit={config.time_unit ?? "minutes"}
          />
        )}

        {result && <EventsTable events={result.events} />}
      </Stack>

      <Modal
        opened={settingsOpened}
        onClose={() => setSettingsOpened(false)}
        title={<Text fw={600}>Simulation settings</Text>}
        size="lg"
      >
        <SimulationSettings
          net={net}
          config={config}
          onChange={setConfig}
          selectedTransition={selectedTransition}
          disabled={running}
        />
        <Group justify="flex-end" mt="md">
          <Button variant="default" onClick={() => setSettingsOpened(false)}>
            Done
          </Button>
          <Button
            leftSection={<PlayIcon size={16} />}
            disabled={running}
            onClick={() => {
              setSettingsOpened(false);
              handleRun();
            }}
          >
            Run
          </Button>
        </Group>
      </Modal>
    </>
  );
};
