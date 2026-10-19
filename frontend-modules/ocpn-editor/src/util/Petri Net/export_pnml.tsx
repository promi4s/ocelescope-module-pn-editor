import { type ArcData, type PetriNetNode } from "@r4pm/components/petri";
import { type Edge } from "@xyflow/react";

export const buildPetriNet = (
  nodes: PetriNetNode[],
  edges: Edge<ArcData>[],
) => {
  const placeNodes = nodes.filter(
    (n): n is Extract<PetriNetNode, { type: "place" }> => n.type === "place",
  );
  const transitionNodes = nodes.filter(
    (n): n is Extract<PetriNetNode, { type: "transition" }> =>
      n.type === "transition",
  );

  const placeIds = new Map(placeNodes.map((p) => [p.id, crypto.randomUUID()]));
  const transitionIds = new Map(
    transitionNodes.map((t) => [t.id, crypto.randomUUID()]),
  );
  const nodeId = (editorId: string) =>
    placeIds.get(editorId) ?? transitionIds.get(editorId) ?? editorId;

  const places = Object.fromEntries(
    placeNodes.map((p) => {
      const uuid = placeIds.get(p.id)!;
      return [uuid, { id: uuid }];
    }),
  );

  const transitions = Object.fromEntries(
    transitionNodes.map((t) => {
      const uuid = transitionIds.get(t.id)!;
      return [uuid, { id: uuid, label: t.data.label ?? null }];
    }),
  );

  const arcs = edges.map((e) => ({
    from_to: {
      type: placeIds.has(e.source) ? "PlaceTransition" : "TransitionPlace",
      nodes: [nodeId(e.source), nodeId(e.target)],
    },
    weight: e.data?.weight ?? 1,
  }));

  const initialMarkingEntries = placeNodes
    .filter((p) => (p.data.tokens ?? 0) > 0)
    .map((p) => [placeIds.get(p.id), p.data.tokens ?? 0]);
  const finalMarkingEntries = placeNodes
    .filter((p) => (p.data.finalTokens ?? 0) > 0)
    .map((p) => [placeIds.get(p.id), p.data.finalTokens ?? 0]);

  return {
    places,
    transitions,
    arcs,
    initial_marking: initialMarkingEntries.length
      ? Object.fromEntries(initialMarkingEntries)
      : null,
    final_markings: finalMarkingEntries.length
      ? [Object.fromEntries(finalMarkingEntries)]
      : null,
  };
};

export const downloadFile = (
  filename: string,
  content: string,
  mediaType: string,
) => {
  const blob = new Blob([content], { type: mediaType });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
};
