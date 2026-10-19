import type { ObjectCentricPetriNet } from "@r4pm/components";

const nextTransitionId = (existingIds: string[]) => {
  const used = existingIds
    .filter((id) => id.startsWith("t"))
    .map((id) => parseInt(id.slice(1), 10))
    .filter((n) => !isNaN(n));
  const next = used.length ? Math.max(...used) + 1 : 0;
  return `${"t"}${next}`;
};
const nextPlaceId = (net: ObjectCentricPetriNet, objectType: string) => {
  const prefix = `${objectType}_p_`;
  const used = net.petri_net.places
    .map((p) => p.id)
    .filter((id) => id.startsWith(prefix))
    .map((id) => parseInt(id.slice(prefix.length), 10))
    .filter((n) => !isNaN(n));
  const next = used.length ? Math.max(...used) + 1 : 0;
  return `${prefix}${next}`;
};

export const addPlace = (
  net: ObjectCentricPetriNet,
  objectType: string,
  tokens: number,
  finalTokens: number,
): ObjectCentricPetriNet => {
  const id = nextPlaceId(net, objectType);
  const initial = { ...(net.petri_net.initial_marking ?? {}) };
  const final = { ...(net.petri_net.final_marking ?? {}) };
  if (tokens > 0) initial[id] = tokens;
  if (finalTokens > 0) final[id] = finalTokens;

  return {
    ...net,
    petri_net: {
      ...net.petri_net,
      places: [...net.petri_net.places, { id }],
      initial_marking: Object.keys(initial).length ? initial : null,
      final_marking: Object.keys(final).length ? final : null,
    },
    place_object_type: { ...net.place_object_type, [id]: objectType },
    place_in_out_mult: { ...net.place_in_out_mult, [id]: [{}, {}] },
  };
};

export const addTransition = (
  net: ObjectCentricPetriNet,
  label: string,
): ObjectCentricPetriNet => {
  const id = nextTransitionId(net.petri_net.transitions.map((t) => t.id));
  return {
    ...net,
    petri_net: {
      ...net.petri_net,
      transitions: [...net.petri_net.transitions, { id, label }],
    },
  };
};

export const addArc = (
  net: ObjectCentricPetriNet,
  source: string,
  target: string,
  isVariable: boolean,
): ObjectCentricPetriNet => {
  const isPlace = (id: string) => net.petri_net.places.some((p) => p.id === id);
  const updatedArcs = [
    ...net.petri_net.arcs,
    { nodes: [source, target] as [string, string] },
  ];
  if (!isVariable) {
    return { ...net, petri_net: { ...net.petri_net, arcs: updatedArcs } };
  }
  const placeId = isPlace(source) ? source : target;
  const transitionId = isPlace(source) ? target : source;
  const existing = net.place_in_out_mult?.[placeId] ?? [{}, {}];
  const updatedMult: [Record<string, boolean>, Record<string, boolean>] = [
    { ...existing[0] },
    { ...existing[1] },
  ];
  updatedMult[0] = { ...updatedMult[0], [transitionId]: true };
  updatedMult[1] = { ...updatedMult[1], [transitionId]: true };

  return {
    ...net,
    petri_net: { ...net.petri_net, arcs: updatedArcs },
    place_in_out_mult: { ...net.place_in_out_mult, [placeId]: updatedMult },
  };
};
