from collections.abc import Mapping
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


def convert_to_pnet_resource(net: dict) -> ClassicPetriNet:
    pnet = convert_from_pnml(net)
    return ClassicPetriNet(
        places=[ClassicPlace(**p.model_dump()) for p in pnet.places],
        transitions=[ClassicTransition(**t.model_dump()) for t in pnet.transitions],
        arcs=[ClassicArc(**a.model_dump()) for a in pnet.arcs],
    )
