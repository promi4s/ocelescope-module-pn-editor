import {
  ActionIcon,
  Badge,
  Box,
  Button,
  Group,
  Loader,
  Stack,
  Tabs,
  Text,
  Tooltip,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import {
  DatabaseArrowDown,
  DownloadIcon,
  MousePointerClick,
  PlayIcon,
  SlidersHorizontal,
  SquareIcon,
  Table2,
} from "lucide-react";
import { useEffect, useState } from "react";
import type {
  OcpnImportResponse as ObjectCentricPetriNet,
  SimulationConfig,
} from "../../api/ocpnEditor";
import { useAddSimulatedOcel } from "../../api/ocpnEditor";
import { downloadFile } from "../../lib/download";
import { SaveSessionModal } from "../editor/SaveSessionModal";
import { ElementSettings } from "./ElementSettings";
import { EventsTable } from "./EventsTable";
import { SimulationProgressCard } from "./SimulationProgressCard";
import {
  defaultSimulationConfig,
  GeneralSettings,
} from "./SimulationSettings";
import { SimulationSummary } from "./SimulationSummary";
import { useSimulation } from "./useSimulation";

type Section = "general" | "node" | "results";

/** Sidebar of the Simulate mode: General, Node and Results tabs, with Run/Export pinned at the bottom. */
export const SimulationPanel = ({
  net,
  selectedNodeIds,
}: {
  net: ObjectCentricPetriNet;
  /** nodes selected in the editor; the first one is shown in the Node tab */
  selectedNodeIds: string[];
}) => {
  const [config, setConfig] = useState<SimulationConfig>(
    defaultSimulationConfig,
  );
  const [section, setSection] = useState<Section>("general");
  // follows the selection in the net, and can also be set from the overview in the Node tab
  const [focusedNode, setFocusedNode] = useState<string | null>(null);
  useEffect(() => {
    const id = selectedNodeIds[0] ?? null;
    setFocusedNode(id);
    if (id) setSection("node");
  }, [selectedNodeIds]);

  const { result, progress, running, run, cancel } = useSimulation();
  const [sessionModalOpened, setSessionModalOpened] = useState(false);
  const { mutateAsync: addSimulatedOcel, isPending: addingToSession } =
    useAddSimulatedOcel();

  const handleAddToSession = async (name: string) => {
    if (!result) return;
    try {
      await addSimulatedOcel({ data: result.ocel, params: { name } });
      notifications.show({
        title: "Added to session",
        message: `The simulated event log "${name}" is now an OCEL of the session.`,
      });
    } catch (error) {
      notifications.show({
        title: "Could not add to session",
        message: error instanceof Error ? error.message : "The event log could not be added.",
        color: "red",
      });
    }
  };

  const handleRun = () => {
    setSection("results");
    run({ ocpn: net, config });
  };

  const handleDownloadLog = () => {
    if (!result) return;
    downloadFile(
      "simulated_log.json",
      JSON.stringify(result.ocel, null, 2),
      "application/json",
    );
  };

  return (
    <Box
      style={{ display: "flex", flexDirection: "column", minHeight: "100%" }}
    >
      <Tabs
        value={section}
        onChange={(v) => v && setSection(v as Section)}
        px="md"
        pt="xs"
        style={{ flex: 1 }}
        // tabs shrink and truncate their labels, so the sidebar can get narrower than one row of labels
        styles={{
          list: { flexWrap: "nowrap" },
          tab: { minWidth: 0, paddingInline: 8 },
          tabLabel: {
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          },
        }}
      >
        <Tabs.List grow>
          <Tabs.Tab value="general" leftSection={<SlidersHorizontal size={14} />}>
            General
          </Tabs.Tab>
          <Tabs.Tab value="node" leftSection={<MousePointerClick size={14} />}>
            Node
          </Tabs.Tab>
          <Tabs.Tab
            value="results"
            leftSection={<Table2 size={14} />}
            rightSection={
              running ? (
                <Loader size={10} />
              ) : result ? (
                <Badge size="xs" variant="light">
                  {result.events.length}
                </Badge>
              ) : null
            }
          >
            Results
          </Tabs.Tab>
        </Tabs.List>

        <Tabs.Panel value="general" pt="sm" pb="md">
          <GeneralSettings
            net={net}
            config={config}
            onChange={setConfig}
            disabled={running}
          />
        </Tabs.Panel>

        <Tabs.Panel value="node" pt="sm" pb="md">
          <ElementSettings
            net={net}
            config={config}
            onChange={setConfig}
            elementId={focusedNode}
            onFocus={setFocusedNode}
            disabled={running}
          />
        </Tabs.Panel>

        <Tabs.Panel value="results" pt="sm" pb="md">
          <Stack gap="xs">
            {running && (
              <SimulationProgressCard
                progress={progress}
                timeUnit={config.time_unit ?? "minutes"}
              />
            )}
            {result && (
              <SimulationSummary
                result={result}
                startTime={config.start_time ?? ""}
              />
            )}
            {result && <EventsTable events={result.events} />}
            {!running && !result && (
              <Text size="xs" c="dimmed" ta="center" py="lg">
                No results yet. Press Run to simulate the net from its initial
                marking.
              </Text>
            )}
          </Stack>
        </Tabs.Panel>
      </Tabs>

      {/* stays visible at the bottom of the sidebar while scrolling */}
      <Box
        px="md"
        py="sm"
        style={{
          position: "sticky",
          bottom: 0,
          zIndex: 1,
          background: "var(--mantine-color-body)",
          borderTop: "1px solid var(--mantine-color-default-border)",
        }}
      >
        {running ? (
          <Button
            fullWidth
            color="red"
            variant="light"
            leftSection={<SquareIcon size={14} />}
            onClick={cancel}
          >
            Cancel
          </Button>
        ) : (
          <Button
            fullWidth
            leftSection={<PlayIcon size={16} />}
            onClick={handleRun}
          >
            Run simulation
          </Button>
        )}
        <Group justify="center" gap="xs" mt="xs" wrap="nowrap">
          <Tooltip label="Export log (OCEL 2.0 JSON)" withArrow>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Export log"
              disabled={!result}
              onClick={handleDownloadLog}
            >
              <DownloadIcon size={16} />
            </ActionIcon>
          </Tooltip>
          <Tooltip label="Add log to session" withArrow>
            <ActionIcon
              variant="default"
              size="lg"
              aria-label="Add log to session"
              disabled={!result || running}
              loading={addingToSession}
              onClick={() => setSessionModalOpened(true)}
            >
              <DatabaseArrowDown size={16} />
            </ActionIcon>
          </Tooltip>
        </Group>
        <SaveSessionModal
          opened={sessionModalOpened}
          onClose={() => setSessionModalOpened(false)}
          onSave={handleAddToSession}
          title="Add log to session"
          namePrefix="simulated_log"
        />
      </Box>
    </Box>
  );
};
