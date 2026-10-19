import { type ArcData, type PetriNetNode } from "@r4pm/components/petri";
import { type Edge } from "@xyflow/react";

export const loadPnml = (
  places: { id: string; tokens?: number; final_tokens?: number }[],
  transitions: { id: string; label?: string | null }[],
  arcs: { source: string; target: string; weight?: number }[],
): [PetriNetNode[], Edge<ArcData>[]] => {
  const newNodes: PetriNetNode[] = [
    ...places.map((p, i) => ({
      id: p.id,
      type: "place" as const,
      data: { tokens: p.tokens ?? 0, finalTokens: p.final_tokens ?? 0 },
      position: { x: 0, y: i * 100 },
    })),
    ...transitions.map((t, i) => ({
      id: t.id,
      type: "transition" as const,
      data: { label: t.label ?? "" },
      position: { x: 300, y: i * 100 },
    })),
  ];

  const newEdges: Edge<ArcData>[] = arcs.map((a) => ({
    id: `${a.source}-${a.target}`,
    source: a.source,
    target: a.target,
    type: "custom",
    data: { weight: a.weight ?? 1 },
  }));

  return [newNodes, newEdges];
};
