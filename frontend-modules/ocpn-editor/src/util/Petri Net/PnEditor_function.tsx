import { useCallback, useEffect } from "react";
import { useReactFlow, useOnSelectionChange, type Edge } from "@xyflow/react";
import {
  type ArcData,
  layoutPetriElements,
  nodesToPetriNet,
  type PetriNetNode,
} from "@r4pm/components/petri";
import { wasmViz } from "@r4pm/components/viz/wasm";
import { HideToolbarButtons } from "./hide_buttons";

const nextPlaceId = (nodes: PetriNetNode[]) => {
  const usedNumbers = nodes
    .filter(
      (n): n is Extract<PetriNetNode, { type: "place" }> => n.type === "place",
    )
    .map((n) => parseInt(n.id.slice(1), 10))
    .filter((n) => !isNaN(n));
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 0;
  return `p${next}`;
};

const nextTransitionId = (nodes: PetriNetNode[]) => {
  const usedNumbers = nodes
    .filter(
      (n): n is Extract<PetriNetNode, { type: "transition" }> =>
        n.type === "transition",
    )
    .map((n) => parseInt(n.id.slice(1), 10))
    .filter((n) => !isNaN(n));
  const next = usedNumbers.length ? Math.max(...usedNumbers) + 1 : 0;
  return `t${next}`;
};

export type SelectedNode =
  | { type: "place"; id: string; tokens: number; finalTokens: number }
  | { type: "transition"; id: string; label: string }
  | { type: "arc"; id: string; weight: number }
  | null;

export type EditorActions = {
  addPlace: (tokens: number, finalTokens: number) => void;
  addTransition: (label: string) => void;
  updateTransitionLabel: (label: string) => void;
  updatePlaceTokens: (tokens: number) => void;
  updatePlaceFinalTokens: (finalTokens: number) => void;
  getGraph: () => { nodes: PetriNetNode[]; edges: Edge<ArcData>[] };
  runLayout: () => Promise<void>;
  addArc: (source: string, target: string, weight: number) => void;
  deleteSelected: () => void;
  loadNet: (nodes: PetriNetNode[], edges: Edge<ArcData>[]) => void;
};

export const EditorFunction = ({
  onReady,
  onSelectionChange,
  onNodesChange,
}: {
  onReady: (action: EditorActions) => void;
  onSelectionChange: (selectedAttributes: SelectedNode) => void;
  onNodesChange: (nodes: PetriNetNode[]) => void;
}) => {
  const {
    addNodes,
    addEdges,
    getNodes,
    getEdges,
    setNodes,
    setEdges,
    deleteElements,
  } = useReactFlow<PetriNetNode, Edge<ArcData>>();

  const handleSelectionChange = useCallback(
    ({
      nodes: selectedNodes,
      edges: selectedEdges,
    }: {
      nodes: PetriNetNode[];
      edges: Edge<ArcData>[];
    }) => {
      const node = selectedNodes[0] as PetriNetNode | undefined;
      const edge = selectedEdges[0] as Edge<ArcData> | undefined;

      if (node?.type === "transition") {
        onSelectionChange({
          type: "transition",
          id: node.id,
          label: node.data.label ?? "",
        });
      } else if (node?.type === "place") {
        onSelectionChange({
          type: "place",
          id: node.id,
          tokens: node.data.tokens ?? 0,
          finalTokens: node.data.finalTokens ?? 0,
        });
      } else if (edge) {
        onSelectionChange({
          type: "arc",
          id: edge.id,
          weight: edge.data?.weight ?? 1,
        });
      } else {
        onSelectionChange(null);
      }
    },
    [onSelectionChange],
  );

  useOnSelectionChange({ onChange: handleSelectionChange });

  const nextNodePosition = (nodeType: "place" | "transition") => {
    const positionX = nodeType === "place" ? 0 : 200;
    const nodesPerType = getNodes().filter((n) => n.type === nodeType);
    const maxPositionY = nodesPerType.reduce(
      (max, n) => Math.max(max, n.position.y),
      0,
    );
    return { x: positionX, y: maxPositionY + 100 };
  };

  const addPlace = (tokens: number, finalTokens: number) => {
    const position = nextNodePosition("place");
    const currentNodes = getNodes();
    const newNodes = [
      ...getNodes(),
      {
        id: nextPlaceId(currentNodes),
        type: "place" as const,
        data: { tokens, finalTokens },
        position,
      },
    ];
    addNodes([newNodes[newNodes.length - 1]]);
    onNodesChange(newNodes);
  };

  const addTransition = (label: string) => {
    const position = nextNodePosition("transition");
    const currentNodes = getNodes();
    const newNodes = [
      ...getNodes(),
      {
        id: nextTransitionId(currentNodes),
        type: "transition" as const,
        data: { label },
        position,
      },
    ];
    addNodes([newNodes[newNodes.length - 1]]);
    onNodesChange(newNodes);
  };

  const updateTransitionLabel = (label: string) => {
    setNodes((nodes) =>
      nodes.map((n) => (n.selected ? { ...n, data: { ...n.data, label } } : n)),
    );
  };

  const updatePlaceTokens = (tokens: number) => {
    setNodes((nodes) =>
      nodes.map((n) =>
        n.selected ? { ...n, data: { ...n.data, tokens } } : n,
      ),
    );
  };

  const updatePlaceFinalTokens = (finalTokens: number) => {
    setNodes((nodes) =>
      nodes.map((n) =>
        n.selected ? { ...n, data: { ...n.data, finalTokens } } : n,
      ),
    );
  };

  const getGraph = () => ({ nodes: getNodes(), edges: getEdges() });

  const runLayout = async () => {
    const nodes = getNodes();
    const edges = getEdges();
    const { nodes: layoutNodes, edges: layoutEdges } =
      await layoutPetriElements(wasmViz, nodesToPetriNet(nodes, edges), {
        nodes,
        edges,
      });
    setNodes(layoutNodes);
    setEdges(layoutEdges);
  };

  const addArc = (source: string, target: string, weight: number) => {
    const nodes = getNodes();
    const sourceNode = nodes.find((n) => n.id === source);
    const targetNode = nodes.find((n) => n.id === target);
    if (!sourceNode || !targetNode || sourceNode.type === targetNode.type)
      return;

    addEdges([
      {
        id: `${source}-${target}`,
        source,
        target,
        type: "custom",
        data: { weight },
      },
    ]);
  };

  const deleteSelected = () => {
    const selectedNodes = getNodes().filter((n) => n.selected);
    const selectedEdges = getEdges().filter((e) => e.selected);
    deleteElements({ nodes: selectedNodes, edges: selectedEdges });
  };

  const loadNet = async (
    newNodes: PetriNetNode[],
    newEdges: Edge<ArcData>[],
  ) => {
    setNodes(newNodes);
    setEdges(newEdges);
    onNodesChange(newNodes);
  };

  useEffect(() => {
    onReady({
      addPlace,
      addTransition,
      updateTransitionLabel,
      updatePlaceTokens,
      updatePlaceFinalTokens,
      getGraph,
      runLayout,
      addArc,
      deleteSelected,
      loadNet,
    });
  });
  return <HideToolbarButtons labels={["Place", "Transition", "Layout"]} />;
};
