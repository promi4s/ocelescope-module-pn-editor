import "@r4pm/components/styles.css";
import type { ObjectCentricPetriNet } from "@r4pm/components";
import {
  Box,
  Button,
  Stack,
  Text,
  Splitter,
  ScrollArea,
  Group,
  Card,
  TextInput,
  NumberInput,
  SegmentedControl,
  Select,
  Autocomplete,
  ActionIcon,
  Tooltip,
  Divider,
} from "@mantine/core";
import {
  DownloadIcon,
  PlayIcon,
  Upload,
  DatabaseArrowUp,
  DatabaseArrowDown,
} from "lucide-react";
import { lazy, useEffect, useState } from "react";
import type { UseSplitterReturnValue } from "@mantine/hooks";
import {
  addPlace,
  addTransition,
  addArc,
} from "../../util/OCPN/editor_functions";
import { SaveOCPNSession } from "../../util/OCPN/save_session";
import { useRef, useCallback } from "react";
import { EditorMode } from "../main";
import {
  useExportOCPN,
  useImportOCPN,
  useLoadSession,
  useSaveSession,
} from "../../api/ocpnEditor";
import { downloadFile } from "../../util/Petri Net/export_pnml";
import { notifications } from "@mantine/notifications";
import { LoadOCPNSession } from "../../util/OCPN/load_session";

const OcpnEditorPanel = lazy(() => import("./OcpnEditorPanel"));

const emptyNet: ObjectCentricPetriNet = {
  petri_net: {
    places: [],
    transitions: [],
    arcs: [],
    initial_marking: null,
    final_marking: null,
  },
  place_object_type: {},
  place_in_out_mult: {},
};

const Editor = ({
  mode,
  onModeChange,
  objectTypes,
  eventActivities,
}: {
  mode: EditorMode;
  onModeChange: (mode: EditorMode) => void;
  objectTypes: string[];
  eventActivities: string[];
}) => {
  const [mounted, setMounted] = useState(false);
  const [net, setNet] = useState<ObjectCentricPetriNet>(emptyNet);
  const [seedNet, setSeedNet] = useState<ObjectCentricPetriNet>(emptyNet);
  const [remountKey, setRemountKey] = useState(0);

  const [newPlaceObjectType, setNewPlaceObjectType] = useState("");
  const [newPlaceTokens, setNewPlaceTokens] = useState(0);
  const [newPlaceFinalTokens, setNewPlaceFinalTokens] = useState(0);
  const [addedTypes, setAddedTypes] = useState<string[]>([]);
  const knownObjectTypes = Array.from(new Set([...objectTypes, ...addedTypes]));

  const [newTransitionLabel, setNewTransitionLabel] = useState("");

  const [variableArcButton, setVariableArcButton] = useState(false);
  const [arcSource, setArcSource] = useState<string | null>(null);
  const [arcTarget, setArcTarget] = useState<string | null>(null);

  const [saveModalOpened, setSaveModalOpened] = useState(false);
  const [loadModalOpened, setLoadModalOpened] = useState(false);

  const netUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const splitterRef = useRef<UseSplitterReturnValue>(null);

  const { mutateAsync: exportOcpn } = useExportOCPN();
  const { mutateAsync: importOcpn } = useImportOCPN();
  const { mutateAsync: saveSession } = useSaveSession();
  const { mutateAsync: loadSession } = useLoadSession();

  const handleDownload = async () => {
    const result = await exportOcpn({ data: net });
    const content = JSON.stringify(result, null, 2);
    downloadFile("ocpn.ocelescope", content, "application/json");
  };

  const handleImportClick = () => fileInputRef.current?.click();

  const handleFileSelected = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const importedOCPN = await importOcpn({ data: { file } });
    setSeedNet(importedOCPN as ObjectCentricPetriNet);
    setNet(importedOCPN as ObjectCentricPetriNet);
    setRemountKey((k) => k + 1);

    e.target.value = "";
  };

  const handleAddPlace = () => {
    if (!newPlaceObjectType) return;
    const updated = addPlace(
      net,
      newPlaceObjectType,
      newPlaceTokens,
      newPlaceFinalTokens,
    );
    setSeedNet(updated);
    setRemountKey((k) => k + 1);
    setAddedTypes((prev) =>
      prev.includes(newPlaceObjectType) ? prev : [...prev, newPlaceObjectType],
    );
    setNewPlaceTokens(0);
    setNewPlaceFinalTokens(0);
  };

  const handleAddTransition = () => {
    const updated = addTransition(net, newTransitionLabel);
    setSeedNet(updated);
    setRemountKey((k) => k + 1);
  };

  const handleAddArc = () => {
    if (!arcSource || !arcTarget) return;
    const updated = addArc(net, arcSource, arcTarget, variableArcButton);
    setSeedNet(updated);
    setRemountKey((k) => k + 1);
    setArcSource(null);
    setArcTarget(null);
  };

  const handleRunLayout = () => {
    setSeedNet(net);
    setRemountKey((k) => k + 1);
  };

  const handleNetChange = useCallback((updatedNet: ObjectCentricPetriNet) => {
    if (netUpdateTimer.current) clearTimeout(netUpdateTimer.current);
    netUpdateTimer.current = setTimeout(() => {
      setNet(updatedNet);
    }, 200);
  }, []);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  const placeOptions = net.petri_net.places.map((p) => ({
    value: p.id,
    label: p.id,
  }));
  const transitionOptions = net.petri_net.transitions.map((t) => ({
    value: t.id,
    label: t.label ?? t.id,
  }));
  const sourceOptions = [
    { group: "Places", items: placeOptions },
    { group: "Transitions", items: transitionOptions },
  ];
  const sourceIsPlace = net.petri_net.places.some((p) => p.id === arcSource);
  const targetOptions = arcSource
    ? sourceIsPlace
      ? transitionOptions
      : placeOptions
    : [];
  const canAddArc = !!arcSource && !!arcTarget;

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
                Object-Centric Petri-Net Editor
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
                <Tooltip label="Load from session" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="md"
                    aria-label="load from session"
                    onClick={() => setLoadModalOpened(true)}
                  >
                    <DatabaseArrowUp size={16} />
                  </ActionIcon>
                </Tooltip>

                <Divider orientation="vertical" />

                <Tooltip label="Save to session" withArrow>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="md"
                    aria-label="save to session"
                    onClick={() => setSaveModalOpened(true)}
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
                    onClick={handleRunLayout}
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
              <OcpnEditorPanel
                key={remountKey}
                data={seedNet}
                onNetChange={handleNetChange}
              />
            </Box>
          </Stack>
        </Splitter.Pane>

        <Splitter.Pane defaultSize={25} min={"10%"} collapsible>
          <ScrollArea h="100%" type="auto">
            <Stack gap="xs" p="md">
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
                    Set the object type, initial, and final marking.
                  </Text>
                  <Autocomplete
                    size="sm"
                    label="Object Type"
                    mb="xs"
                    value={newPlaceObjectType}
                    onChange={setNewPlaceObjectType}
                    data={knownObjectTypes}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPlace();
                      }
                    }}
                  />
                  <NumberInput
                    size="sm"
                    label="Initial Tokens"
                    mb="xs"
                    value={newPlaceTokens}
                    onChange={(v) => setNewPlaceTokens(Number(v) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPlace();
                      }
                    }}
                  />
                  <NumberInput
                    size="sm"
                    label="Final Tokens"
                    mb="xs"
                    value={newPlaceFinalTokens}
                    onChange={(v) => setNewPlaceFinalTokens(Number(v) || 0)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddPlace();
                      }
                    }}
                  />
                  <Button
                    variant="default"
                    disabled={!newPlaceObjectType}
                    onClick={handleAddPlace}
                  >
                    Add Place
                  </Button>
                </Card>
                <Card withBorder radius="sm" padding="sm">
                  <Text fw={600} size="sm">
                    New Transition
                  </Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Set the transition label.
                  </Text>
                  <Autocomplete
                    label="Transition Label"
                    mb="xs"
                    value={newTransitionLabel}
                    onChange={setNewTransitionLabel}
                    data={eventActivities}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAddTransition();
                      }
                    }}
                  />
                  <Button variant="default" onClick={handleAddTransition}>
                    Add Transition
                  </Button>
                </Card>
                <Card withBorder radius="sm" padding="sm">
                  <Text fw={600} size="sm">
                    New Arc
                  </Text>
                  <Text size="xs" c="dimmed" mb="xs">
                    Select the source and target nodes.
                  </Text>
                  <SegmentedControl
                    size="xs"
                    value={variableArcButton ? "variable" : "normal"}
                    onChange={(v) => setVariableArcButton(v === "variable")}
                    data={[
                      { label: "Normal", value: "normal" },
                      { label: "Variable", value: "variable" },
                    ]}
                  />
                  <Stack gap={"xs"} mb="xs">
                    <Select
                      label="From"
                      placeholder="Select source"
                      data={sourceOptions}
                      value={arcSource}
                      onChange={(value) => {
                        setArcSource(value);
                        setArcTarget(null);
                      }}
                      clearable
                      searchable
                    />
                    <Select
                      label="To"
                      placeholder="Select target"
                      data={targetOptions}
                      value={arcTarget}
                      onChange={setArcTarget}
                      disabled={!arcSource}
                      clearable
                      searchable
                    />
                  </Stack>
                  <Button
                    variant="default"
                    disabled={!canAddArc}
                    onClick={handleAddArc}
                  >
                    Add Arc
                  </Button>
                </Card>
              </Stack>
            </Stack>
          </ScrollArea>
        </Splitter.Pane>
      </Splitter>
      <SaveOCPNSession
        opened={saveModalOpened}
        onClose={() => setSaveModalOpened(false)}
        onSave={(name) => {
          saveSession({ data: seedNet, params: { name } });
          notifications.show({
            title: "Saved to session",
            message: "OCPN has been saved to session",
          });
        }}
      />
      <LoadOCPNSession
        opened={loadModalOpened}
        onClose={() => setLoadModalOpened(false)}
        onLoad={async (resourceId) => {
          const result = await loadSession({
            params: { resource_id: resourceId },
          });
          setSeedNet(result as ObjectCentricPetriNet);
          setNet(result as ObjectCentricPetriNet);
          setRemountKey((k) => k + 1);
        }}
      />
    </>
  );
};

export default Editor;
