from collections.abc import Mapping
from uuid import uuid4
from typing import Any

from ocelescope.resource.default.petri_net import (
    Arc,
    ArcType,
    PetriNet,
    Place,
    Transition,
)
from ocelescope_module_ocpn_editor.model.editor_ocpn import (
    OcpnExportRequest,
    OcpnImportResponse,
    EditorArc,
    EditorOCPN,
    EditorPlace,
    EditorTransition,
)
from ocelescope_module_ocpn_editor.model.editor_pn import (
    ImportResponse,
    ImportPlace,
    ImportArc,
    ImportTransition,
)
from ocelescope_module_ocpn_editor.model.editor_pn import (
    ClassicPetriNet,
    ClassicArc,
    ClassicPlace,
    ClassicTransition,
)


def convert_to_OCPN(ocpn: OcpnExportRequest) -> PetriNet:
    net = ocpn.petri_net
    object_types = ocpn.place_object_type
    in_out_mult = ocpn.place_in_out_mult if ocpn.place_in_out_mult is not None else {}

    petri_net = PetriNet()

    for place in net.places:
        petri_net.add_place(Place(name=place.id, object_type=object_types[place.id]))

    for transition in net.transitions:
        petri_net.add_transition(Transition(name=transition.id, label=transition.label))

    place_ids = {place.name for place in petri_net.places}

    def is_variable(source: str, target: str) -> bool:
        if source in place_ids:
            _, outgoing = in_out_mult.get(source, ({}, {}))
            return bool(outgoing.get(target))
        incoming, _ = in_out_mult.get(target, ({}, {}))
        return bool(incoming.get(source))

    for arc in net.arcs:
        source, target = arc.nodes
        petri_net.add_arc(
            Arc(
                source=source,
                target=target,
                type=ArcType.VARIABLE
                if is_variable(source, target)
                else ArcType.NORMAL,
                weight=arc.weight if arc.weight is not None else 1,
            )
        )

    petri_net.initial_marking = dict(
        net.initial_marking if net.initial_marking is not None else {}
    )
    petri_net.final_marking = dict(
        net.final_marking if net.final_marking is not None else {}
    )

    return petri_net


def convert_from_OCPN(ocpn: PetriNet) -> OcpnImportResponse:
    places = []
    place_object_type = {}

    for place in ocpn.places:
        places.append(EditorPlace(id=place.name))
        place_object_type[place.name] = place.object_type

    transitions = [
        EditorTransition(id=transition.name, label=transition.label)
        for transition in ocpn.transitions
    ]
    initial_marking = ocpn.initial_marking if ocpn.initial_marking is not None else {}
    final_marking = ocpn.final_marking if ocpn.final_marking is not None else {}

    place_ids = {place.id for place in places}
    place_in_out_mult: dict[str, tuple[dict[str, bool], dict[str, bool]]] = {
        ids: ({}, {}) for ids in place_ids
    }

    arcs = []
    for arc in ocpn.arcs:
        arcs.append(EditorArc(nodes=(arc.source, arc.target), weight=arc.weight))
        if arc.type != ArcType.VARIABLE:
            continue
        if arc.source in place_ids:
            place_id, transition_id = arc.source, arc.target
            incoming, outgoing = place_in_out_mult[place_id]
            place_in_out_mult[place_id] = (incoming, {**outgoing, transition_id: True})
        else:
            transition_id, place_id = arc.source, arc.target
            incoming, outgoing = place_in_out_mult[place_id]
            place_in_out_mult[place_id] = ({**incoming, transition_id: True}, outgoing)

    return OcpnImportResponse(
        petri_net=EditorOCPN(
            places=places,
            transitions=transitions,
            arcs=arcs,
            initial_marking=initial_marking,
            final_marking=final_marking,
        ),
        place_object_type=place_object_type,
        place_in_out_mult=place_in_out_mult,
    )


def convert_from_pnml(net: Mapping[str, Any]) -> ImportResponse:
    initial_marking = net.get("initial_marking") or {}
    final_markings = net.get("final_markings") or []
    final_marking = final_markings[0] if final_markings else {}

    places = [
        ImportPlace(
            id=pid,
            tokens=initial_marking.get(pid, 0),
            final_tokens=final_marking.get(pid, 0),
        )
        for pid in net.get("places", {})
    ]
    transitions = [
        ImportTransition(id=tid, label=transition.get("label"))
        for tid, transition in net.get("transitions", {}).items()
    ]
    arcs = []
    for arc in net.get("arcs", []):
        source, target = arc["from_to"]["nodes"]
        arcs.append(
            ImportArc(source=source, target=target, weight=arc.get("weight", 1))
        )

    return ImportResponse(places=places, transitions=transitions, arcs=arcs)


# ============================================
#   OCPN <-> classic Petri net
#   An OCPN with a single object type and no variable arcs is a classic Petri net.
# ============================================

DEFAULT_OBJECT_TYPE = "object"


def classic_incompatibility(ocpn: OcpnExportRequest) -> str | None:
    """Why the OCPN cannot be treated as a classic Petri net, or None if it can."""
    object_types = set(ocpn.place_object_type.values())
    if len(object_types) > 1:
        return f"A classic Petri net has exactly one object type, but this net has {len(object_types)}."
    in_out_mult = ocpn.place_in_out_mult or {}
    if any(any(incoming.values()) or any(outgoing.values()) for incoming, outgoing in in_out_mult.values()):
        return "A classic Petri net cannot have variable arcs."
    return None


def check_classic(ocpn: OcpnExportRequest):
    reason = classic_incompatibility(ocpn)
    if reason is not None:
        raise ValueError(reason)


def convert_ocpn_to_pnml_net(ocpn: OcpnExportRequest) -> dict:
    check_classic(ocpn)
    net = ocpn.petri_net
    uuids = {node.id: str(uuid4()) for node in [*net.places, *net.transitions]}
    place_ids = {p.id for p in net.places}

    return {
        "places": {uuids[p.id]: {"id": uuids[p.id]} for p in net.places},
        "transitions": {uuids[t.id]: {"id": uuids[t.id], "label": t.label} for t in net.transitions},
        "arcs": [
            {
                "from_to": {
                    "type": "PlaceTransition" if source in place_ids else "TransitionPlace",
                    "nodes": [uuids[source], uuids[target]],
                },
                "weight": arc.weight or 1,
            }
            for arc in net.arcs
            for source, target in [arc.nodes]
        ],
        "initial_marking": {uuids[p]: n for p, n in (net.initial_marking or {}).items() if n} or None,
        "final_markings": [{uuids[p]: n for p, n in (net.final_marking or {}).items() if n}] if net.final_marking else None,
    }


def convert_ocpn_to_classic(ocpn: OcpnExportRequest) -> ClassicPetriNet:
    check_classic(ocpn)
    net = ocpn.petri_net
    initial = net.initial_marking or {}
    final = net.final_marking or {}
    return ClassicPetriNet(
        places=[ClassicPlace(id=p.id, tokens=initial.get(p.id, 0), final_tokens=final.get(p.id, 0)) for p in net.places],
        transitions=[ClassicTransition(id=t.id, label=t.label) for t in net.transitions],
        arcs=[ClassicArc(source=a.nodes[0], target=a.nodes[1], weight=a.weight or 1) for a in net.arcs],
    )


def convert_classic_to_ocpn(
    places: list[ImportPlace] | list[ClassicPlace],
    transitions: list[ImportTransition] | list[ClassicTransition],
    arcs: list[ImportArc] | list[ClassicArc],
    object_type: str = DEFAULT_OBJECT_TYPE,
) -> OcpnImportResponse:
    """A classic Petri net as an OCPN whose places all have `object_type`."""
    return OcpnImportResponse(
        petri_net=EditorOCPN(
            places=[EditorPlace(id=p.id) for p in places],
            transitions=[EditorTransition(id=t.id, label=t.label) for t in transitions],
            arcs=[EditorArc(nodes=(a.source, a.target), weight=a.weight) for a in arcs],
            initial_marking={p.id: p.tokens for p in places if p.tokens},
            final_marking={p.id: p.final_tokens for p in places if p.final_tokens},
        ),
        place_object_type={p.id: object_type for p in places},
        place_in_out_mult={p.id: ({}, {}) for p in places},
    )
