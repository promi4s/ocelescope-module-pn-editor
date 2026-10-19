import { ReactFlowProvider } from "@xyflow/react";
import { Editor, type PetriNetNode } from "@r4pm/components/petri";
import {
  Box,
  Button,
  Stack,
  Text,
  Divider,
  NumberInput,
  TextInput,
  Splitter,
  ScrollArea,
  Group,
  Select,
  Card,
  MultiSelect,
  SegmentedControl,
  Tooltip,
  ActionIcon,
} from "@mantine/core";
import {
  DownloadIcon,
  PlayIcon,
  Upload,
  DatabaseArrowUp,
  DatabaseArrowDown,
} from "lucide-react";
import { useRef, useState } from "react";
import type { UseSplitterReturnValue } from "@mantine/hooks";
import { wasmLayout } from "@r4pm/components/rust-layout/wasm";
import {
  useExportPetriNetPnml,
  useImportPetriNetPnml,
  useSaveToSessionClassicPetriNetExportSessionPost,
} from "../../api/ocpnEditor";
import { buildPetriNet, downloadFile } from "../../util/Petri Net/export_pnml";
import {
  buildArcSourceOptions,
  buildArcTargetOptions,
} from "../../util/Petri Net/add_arcs";
import {
  EditorFunction,
  type SelectedNode,
  type EditorActions,
} from "../../util/Petri Net/PnEditor_function";
import { loadPnml } from "../../util/Petri Net/import_pn";
import { EditorMode } from "../main";
import { ViewerExportFrame } from "@r4pm/components";
import { notifications } from "@mantine/notifications";
import { SaveClassicSession } from "../../util/Petri Net/save_session";

const PetriNetEditor = ({
  mode,
  onModeChange,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
}) => {
  const [selected, setSelected] = useState<SelectedNode>(null);
  const [arcSource, setArcSource] = useState<string | null>(null);
  const [arcTarget, setArcTarget] = useState<string[]>([]);
  const [arcWeight, setArcWeight] = useState(1);
  const [nodes, setNodesForToolbox] = useState<PetriNetNode[]>([]);
  const [newPlaceTokens, setNewPlaceTokens] = useState(0);
  const [newPlaceFinalTokens, setNewPlaceFinalTokens] = useState(0);
  const [newTransitionLabel, setNewTransitionLabel] = useState("");

  const [saveOpened, setSaveOpened] = useState(false);

  const actionsRef = useRef<EditorActions | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitterRef = useRef<UseSplitterReturnValue>(null);

  const { mutateAsync: exportPnml } = useExportPetriNetPnml();
  const { mutateAsync: saveSessionClassic } =
    useSaveToSessionClassicPetriNetExportSessionPost();

  const handleDownload = async () => {
    const graph = actionsRef.current?.getGraph();
    if (!graph) return;
    const net = buildPetriNet(graph.nodes, graph.edges);
    const pnml = await exportPnml({ data: net });
    downloadFile("petri-net.pnml", pnml as string, "application/xml");
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleSaveSession = async (name: string) => {
    const graph = actionsRef.current?.getGraph();
    if (!graph) return;
    const net = buildPetriNet(graph.nodes, graph.edges);
    await saveSessionClassic({ data: net, params: { name } });
    notifications.show({
      title: "Saved to session",
      message: `"${name}" was saved.`,
    });
  };

  const { mutateAsync: importPnml } = useImportPetriNetPnml();
  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const importedPN = await importPnml({ data: { file } });
    const [nodes, edges] = loadPnml(
      importedPN.places,
      importedPN.transitions,
      importedPN.arcs,
    );
    actionsRef.current?.loadNet(nodes, edges);
  };

  const sourceOptions = buildArcSourceOptions(nodes);
  const targetOptions = buildArcTargetOptions(nodes, arcSource);
  const canAddArc = !!arcSource && arcTarget.length > 0;

  const handleAddArc = () => {
    if (!arcSource || arcTarget.length === 0) return;
    arcTarget.forEach((target) => {
      actionsRef.current?.addArc(arcSource, target, arcWeight);
    });
    setArcSource(null);
    setArcTarget([]);
    setArcWeight(1);
  };

  return (
    <>
      <Splitter
        splitterRef={splitterRef}
        lineSize={2}
        handleColor="var(--mantine-color-default-border)"
        h={"100%"}
      >
        <Splitter.Pane defaultSize={75} min={"10%"} collapsible>
          <Stack gap={5} pt="xs" h="100%">
            <Group
              pb={"xs"}
              pl={"xs"}
              pr={"xs"}
              wrap="nowrap"
              justify="space-between"
              style={{
                borderBottom: "2px solid var(--mantine-color-default-border)",
              }}
            >
              <Text fw={600} size="md">
                Petri-Net Editor
              </Text>
              <Group
                gap={4}
                p={4}
                style={{
                  border: "1px solid var(--mantine-color-default-border)",
                  borderRadius: "var(--mantine-radius-md)",
                }}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".ocelescope"
                  style={{ display: "none" }}
                  onChange={handleFileSelected}
                />
                {/* <Tooltip label="Load from session" withArrow>
                  <ActionIcon variant="subtle" color="gray" size="md" aria-label="load from session">
                    <DatabaseArrowUp size={16} />
                  </ActionIcon>
                </Tooltip>

                <Divider orientation="vertical" /> */}

                <Tooltip label="Save to session" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="md"
                    aria-label="save to session"
                    onClick={() => setSaveOpened(true)}
                  >
                    <DatabaseArrowDown size={16} />
                  </ActionIcon>
                </Tooltip>

                <Divider orientation="vertical" />

                <Tooltip label="Upload OCPN" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="md"
                    aria-label="Upload OCPN"
                    onClick={handleImportClick}
                  >
                    <Upload size={16} />
                  </ActionIcon>
                </Tooltip>

                <Divider orientation="vertical" />

                <Tooltip label="Download OCPN" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="md"
                    aria-label="Download OCPN"
                    onClick={handleDownload}
                  >
                    <DownloadIcon size={16} />
                  </ActionIcon>
                </Tooltip>

                <Divider orientation="vertical" />

                <Tooltip label="Run Layout" withArrow>
                  <ActionIcon
                    variant="filled"
                    color="blue"
                    size="md"
                    radius="md"
                    aria-label="Run Layout"
                    onClick={() => actionsRef.current?.runLayout()}
                  >
                    <PlayIcon size={16} />
                  </ActionIcon>
                </Tooltip>
              </Group>
            </Group>

            <Box
              pos="relative"
              style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
            >
              <ReactFlowProvider>
                <ViewerExportFrame
                  filename="petri-net"
                  style={{ height: "100%" }}
                >
                  <Editor
                    editable
                    showExportControls={false}
                    relayoutOnDrag={false}
                    initialNodes={[]}
                    initialEdges={[]}
                    layoutOverride={wasmLayout.petri}
                  >
                    <EditorFunction
                      onReady={(actions) => (actionsRef.current = actions)}
                      onSelectionChange={setSelected}
                      onNodesChange={setNodesForToolbox}
                    />
                  </Editor>
                </ViewerExportFrame>
              </ReactFlowProvider>
            </Box>
          </Stack>
        </Splitter.Pane>

        <Splitter.Pane defaultSize={25} min={"10%"} collapsible>
          <ScrollArea h="100%" type="auto">
            <Stack gap={"xs"} p="md">
              <Text fw={600} size="sm">
                Editor Type
              </Text>
              <SegmentedControl
                size="xs"
                value={mode}
                onChange={(v) => onModeChange(v as EditorMode)}
                data={[
                  { label: "Object-Centric", value: "ocpn" },
                  { label: "Classic", value: "classic" },
                ]}
              />
              <Stack gap={0} pt={"xs"}>
                <Card withBorder radius="sm" padding="sm">
                  <Text fw={600} size="sm">
                    New Place
                  </Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Select the number of initial and final tokens.
                  </Text>

                  <NumberInput
                    label="Initial Tokens"
                    min={0}
                    mb="xs"
                    value={newPlaceTokens}
                    onChange={(v) => setNewPlaceTokens(Number(v) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        actionsRef.current?.addPlace(
                          newPlaceTokens,
                          newPlaceFinalTokens,
                        );
                      }
                    }}
                  />
                  <NumberInput
                    label="Final Tokens"
                    min={0}
                    mb="xs"
                    value={newPlaceFinalTokens}
                    onChange={(v) => setNewPlaceFinalTokens(Number(v) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        actionsRef.current?.addPlace(
                          newPlaceTokens,
                          newPlaceFinalTokens,
                        );
                      }
                    }}
                  />

                  <Button
                    variant="default"
                    onClick={() => {
                      actionsRef.current?.addPlace(
                        newPlaceTokens,
                        newPlaceFinalTokens,
                      );
                    }}
                  >
                    Add place
                  </Button>
                </Card>

                <Card withBorder radius="sm" padding="sm">
                  <Text fw={600} size="sm">
                    New Transition
                  </Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Set the transition label.
                  </Text>
                  <TextInput
                    label="Label"
                    mb="xs"
                    value={newTransitionLabel}
                    onChange={(e) =>
                      setNewTransitionLabel(e.currentTarget.value)
                    }
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        actionsRef.current?.addTransition(newTransitionLabel);
                      }
                    }}
                  />
                  <Button
                    variant="default"
                    onClick={() => {
                      actionsRef.current?.addTransition(newTransitionLabel);
                    }}
                  >
                    Add transition
                  </Button>
                </Card>

                <Card withBorder radius="sm" padding="sm">
                  <Text fw={600} size="sm">
                    New Arc
                  </Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Set the source and target nodes.
                  </Text>
                  <Select
                    label="From"
                    placeholder="Select source"
                    data={sourceOptions}
                    value={arcSource}
                    onChange={(value) => {
                      setArcSource(value);
                      setArcTarget([]);
                    }}
                    clearable
                    searchable
                  />
                  <MultiSelect
                    label="To"
                    placeholder="Select target"
                    data={targetOptions}
                    value={arcTarget}
                    onChange={setArcTarget}
                    disabled={!arcSource}
                    clearable
                    searchable
                  />
                  <NumberInput
                    label="Weight"
                    min={1}
                    mb="xs"
                    value={arcWeight}
                    onChange={(v) => setArcWeight(Number(v) || 1)}
                  />
                  <Button
                    variant="default"
                    disabled={!canAddArc}
                    onClick={handleAddArc}
                  >
                    Add arc
                  </Button>
                </Card>

                <Divider />

                <Text fw={500} size="md">
                  Selected Element
                </Text>
                {selected === null && (
                  <Text size="sm" c="dimmed">
                    Click a place, transition, or arc to edit it here.
                  </Text>
                )}

                {selected?.type === "place" && (
                  <>
                    <NumberInput
                      label="Tokens"
                      min={0}
                      value={selected.tokens}
                      onChange={(newTokens) => {
                        const tokens = Number(newTokens);
                        setSelected({ ...selected, tokens });
                        actionsRef.current?.updatePlaceTokens(tokens);
                      }}
                    />
                    <NumberInput
                      label="Final Tokens"
                      min={0}
                      value={selected.finalTokens}
                      onChange={(newFinalTokens) => {
                        const finalTokens = Number(newFinalTokens);
                        setSelected({ ...selected, finalTokens });
                        actionsRef.current?.updatePlaceFinalTokens(finalTokens);
                      }}
                    />
                  </>
                )}
                {selected?.type === "transition" && (
                  <TextInput
                    label="Label"
                    value={selected.label}
                    onChange={(newLabel) => {
                      const label = newLabel.currentTarget.value;
                      setSelected({ ...selected, label });
                      actionsRef.current?.updateTransitionLabel(label);
                    }}
                  />
                )}
                {selected !== null && (
                  <>
                    <Divider />
                    <Button
                      color="red"
                      variant="light"
                      onClick={() => {
                        actionsRef.current?.deleteSelected();
                        setSelected(null);
                      }}
                    >
                      Delete Element
                    </Button>
                  </>
                )}
              </Stack>
            </Stack>
          </ScrollArea>
        </Splitter.Pane>
      </Splitter>
      <SaveClassicSession
        opened={saveOpened}
        onClose={() => setSaveOpened(false)}
        onSave={handleSaveSession}
      />
    </>
  );
};

export default PetriNetEditor;
