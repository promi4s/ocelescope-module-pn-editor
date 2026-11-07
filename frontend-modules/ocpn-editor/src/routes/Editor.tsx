import {
  Box,
  Center,
  Loader,
  ScrollArea,
  SegmentedControl,
  Splitter,
  Stack,
} from "@mantine/core";
import type { UseSplitterReturnValue } from "@mantine/hooks";
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import type { OcpnImportResponse as ObjectCentricPetriNet } from "../api/ocpnEditor";
import { EditorToolbar } from "../components/editor/EditorToolbar";
import { EditSidebar } from "../components/editor/EditSidebar";
import { SimulationPanel } from "../components/simulation/SimulationPanel";

const OcpnEditorPanel = lazy(
  () => import("../components/editor/OcpnEditorPanel"),
);

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

const Editor = () => {
  const [mounted, setMounted] = useState(false);
  // `net` follows every change made in the canvas; `seedNet` is what the canvas is (re)built from,
  // and bumping `remountKey` rebuilds it, e.g. after a node was added from the sidebar
  const [net, setNet] = useState<ObjectCentricPetriNet>(emptyNet);
  const [seedNet, setSeedNet] = useState<ObjectCentricPetriNet>(emptyNet);
  const [remountKey, setRemountKey] = useState(0);
  const [selectedNodeIds, setSelectedNodeIds] = useState<string[]>([]);
  const [simulationMode, setSimulationMode] = useState(false);

  const netUpdateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const splitterRef = useRef<UseSplitterReturnValue>(null);

  /** Rebuild the canvas from `updated`; the canvas reports it back through onNetChange. */
  const reseed = useCallback((updated: ObjectCentricPetriNet) => {
    setSeedNet(updated);
    setRemountKey((k) => k + 1);
  }, []);

  /** Replace the net entirely, e.g. after loading one. */
  const replaceNet = useCallback(
    (loaded: ObjectCentricPetriNet) => {
      setNet(loaded);
      reseed(loaded);
    },
    [reseed],
  );

  const handleNetChange = useCallback((updatedNet: ObjectCentricPetriNet) => {
    if (netUpdateTimer.current) clearTimeout(netUpdateTimer.current);
    netUpdateTimer.current = setTimeout(() => setNet(updatedNet), 200);
  }, []);

  useEffect(() => setMounted(true), []);
  if (!mounted) return null;

  return (
    <Splitter
      splitterRef={splitterRef}
      lineSize={2}
      handleColor="var(--mantine-color-default-border)"
      h="100%"
    >
      <Splitter.Pane defaultSize={75} min="10%" collapsible>
        <Stack gap={5} pt="xs" h="100%">
          <EditorToolbar
            net={net}
            onLoad={replaceNet}
            onRunLayout={() => reseed(net)}
          />
          <Box
            pos="relative"
            style={{ flex: 1, minHeight: 0, overflow: "hidden" }}
          >
            <Suspense
              fallback={
                <Center h="100%">
                  <Loader />
                </Center>
              }
            >
              <OcpnEditorPanel
                key={remountKey}
                data={seedNet}
                onNetChange={handleNetChange}
                onSelectionChange={setSelectedNodeIds}
              />
            </Suspense>
          </Box>
        </Stack>
      </Splitter.Pane>

      <Splitter.Pane defaultSize={25} min="10%" collapsible>
        <ScrollArea h="100%" type="auto">
          <Box px="md" pt="md">
            <SegmentedControl
              fullWidth
              value={simulationMode ? "simulate" : "edit"}
              onChange={(v) => setSimulationMode(v === "simulate")}
              data={[
                { label: "Edit", value: "edit" },
                { label: "Simulate", value: "simulate" },
              ]}
            />
          </Box>
          {/* both stay mounted, so switching modes keeps form inputs, results and a running simulation */}
          <Box display={simulationMode ? "none" : undefined}>
            <EditSidebar net={net} onEdit={reseed} />
          </Box>
          <Box display={simulationMode ? undefined : "none"}>
            <SimulationPanel net={net} selectedNodeIds={selectedNodeIds} />
          </Box>
        </ScrollArea>
      </Splitter.Pane>
    </Splitter>
  );
};

export default Editor;
