import { type PetriNetNode } from "@r4pm/components/petri";

export type ArcOption = { value: string; label: string; group?: string };

export const nodesByTypes = (nodes: PetriNetNode[]) => {
  const places = nodes.filter(
    (n): n is Extract<PetriNetNode, { type: "place" }> => n.type === "place",
  );
  const transitions = nodes.filter(
    (n): n is Extract<PetriNetNode, { type: "transition" }> =>
      n.type === "transition",
  );
  return { places, transitions };
};

export const buildArcSourceOptions = (nodes: PetriNetNode[]) => {
  const { places, transitions } = nodesByTypes(nodes);
  return [
    {
      group: "Places",
      items: places.map((p) => ({ value: p.id, label: p.data.label ?? p.id })),
    },
    {
      group: "Transitions",
      items: transitions.map((t) => ({
        value: t.id,
        label: t.data.label ?? t.id,
      })),
    },
  ];
};

export const buildArcTargetOptions = (
  nodes: PetriNetNode[],
  sourceId: string | null,
): ArcOption[] => {
  if (!sourceId) return [];
  const sourceNode = nodes.find((n) => n.id === sourceId);
  if (!sourceNode) return [];

  const { places, transitions } = nodesByTypes(nodes);
  return sourceNode.type === "place"
    ? transitions.map((t) => ({ value: t.id, label: t.data.label ?? t.id }))
    : places.map((p) => ({ value: p.id, label: p.data.label ?? p.id }));
};
