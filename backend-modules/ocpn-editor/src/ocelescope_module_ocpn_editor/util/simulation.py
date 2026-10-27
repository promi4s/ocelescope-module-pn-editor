import inspect
import random
from collections.abc import Callable
from itertools import count
from simpn.simulator import SimProblem, SimToken
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar, OCPNEvent
from ocelescope_module_ocpn_editor.model.simulation.ocel_reporter import OCELReporter
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulatedEvent, SimulationResult
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import DelayConfig, SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


class ObjectIdCounter:
    """Creates object tokens in places with ids that are unique per object type."""

    def __init__(self):
        self._counters: dict[str, count] = {}

    def create(self, object_type: str) -> dict:
        counter = self._counters.setdefault(object_type, count(1))
        return {"object_type": object_type, f"{object_type}_id": next(counter)}


def is_variable(ocpn: Ocpn, place_id: str, transition_id: str, place_is_source: bool) -> bool:
    if not ocpn.place_in_out_mult or place_id not in ocpn.place_in_out_mult:
        return False
    in_mult, out_mult = ocpn.place_in_out_mult[place_id]
    lookup = out_mult if place_is_source else in_mult
    return lookup.get(transition_id, False)


def link(a: dict, b: dict):
    """Record a relation between two objects on both of them, under obj["related"][other_type]."""
    a_type, b_type = a["object_type"], b["object_type"]
    a.setdefault("related", {}).setdefault(b_type, []).append(b[f"{b_type}_id"])
    b.setdefault("related", {}).setdefault(a_type, []).append(a[f"{a_type}_id"])


def related_ids(places: list[dict], object_type: str) -> set | None:
    """
    Ids of objects of `object_type` related to any place object.
    Returns None if no anchor has relations to that type, meaning there is nothing to correlate on.
    """
    ids = None
    for place in places:
        related = place.get("related", {})
        if object_type in related:
            ids = (ids or set()) | set(related[object_type])
    return ids


def arc_indices(incoming_vars: list[tuple[OCPNVar, bool]]) -> tuple[list[int], list[int]]:
    """Indices of regular and variable input arcs."""
    regular = [i for i, (_, variable) in enumerate(incoming_vars) if not variable]
    variable = [i for i, (_, variable) in enumerate(incoming_vars) if variable]
    return regular, variable


def default_selection(incoming_vars: list[tuple[OCPNVar, bool]]):
    """
    On every variable input arc, select only the objects related to the objects on the regular input arcs.
    If there are no relations, all available tokens are selected.
    Returns None if the transition has no variable input arcs.
    """
    regular, variable = arc_indices(incoming_vars)
    if not variable:
        return None

    def selection(*args): #arcs represent the tokens of different places
        object_input_regular = [args[i] for i in regular]
        selected_tokens = list(args)
        for i in variable:
            object_type = incoming_vars[i][0].object_type
            ids = related_ids(object_input_regular, object_type)
            if ids is not None:
                selected_tokens[i] = [token for token in args[i] if token.value[f"{object_type}_id"] in ids]
        return selected_tokens

    selection.__signature__ = inspect.Signature(
        [inspect.Parameter(f"arg{i}", inspect.Parameter.POSITIONAL_ONLY) for i in range(len(incoming_vars))]
    )
    return selection


def default_guard(incoming_vars: list[tuple[OCPNVar, bool]]):
    """
    - all regular input arcs of the same object type must bind the same object,
    - a variable input arc must contain all objects related to the anchors (wait until every related object has arrived).
    Returns None if there is nothing to check, so no guard is installed.
    """
    regular_input, variable_input = arc_indices(incoming_vars)
    regular_by_type: dict[str, list[int]] = {}
    for i in regular_input:
        regular_by_type.setdefault(incoming_vars[i][0].object_type, []).append(i)
    regular_by_type = {object_type: indices for object_type, indices in regular_by_type.items() if len(indices) > 1}
    if not regular_by_type and not (regular_input and variable_input):
        return None

    def guard(*args):
        for object_type, indices in regular_by_type.items():
            if len({args[i][f"{object_type}_id"] for i in indices}) > 1:
                return False
        anchors = [args[i] for i in regular_input]
        for i in variable_input:
            object_type = incoming_vars[i][0].object_type
            ids = related_ids(anchors, object_type)
            if ids is not None and {token.value[f"{object_type}_id"] for token in args[i]} != ids:
                return False
        return True

    return guard


def default_behavior(
    incoming_vars: list[tuple[OCPNVar, bool]],
    outgoing_vars: list[tuple[OCPNVar, bool]],
    factory: ObjectIdCounter,
    sample_delay: Callable[[], float],
):
    """
    - objects consumed of type T are produced in every output place of type T,
    - an output type with no input of that type creates one new object,
      which is linked to all consumed and other created objects of other types,
    - an input type with no output of that type ends its objects,
    - variable input arcs consume all selected tokens; the rest is returned by OCPNEvent,
    - all produced tokens get the same sampled delay (the duration of this firing).
    """
    num_variable_input_arcs = sum(1 for _, variable in incoming_vars if variable)

    def behavior(*args):
        delay = sample_delay()
        consumed: dict[str, dict] = {}
        for (var, variable), arg in zip(incoming_vars, args):
            objects = [token.value for token in arg] if variable else [arg]
            by_id = consumed.setdefault(var.object_type, {})
            for obj in objects:
                by_id[obj[f"{var.object_type}_id"]] = obj

        produced: dict[str, list[dict]] = {}
        created: list[dict] = []
        result = []
        for var, variable in outgoing_vars:
            if var.object_type not in produced:
                existing = list(consumed.get(var.object_type, {}).values())
                if not existing:
                    existing = [factory.create(var.object_type)]
                    created.extend(existing)
                produced[var.object_type] = existing
            objects = produced[var.object_type]
            if variable:
                result.append([SimToken(obj, delay=delay) for obj in objects])
            else:
                result.append(SimToken(objects[0], delay=delay))

        consumed_objects = [obj for by_id in consumed.values() for obj in by_id.values()]
        for i, new in enumerate(created):
            for other in consumed_objects + created[i + 1:]:
                if other["object_type"] != new["object_type"]:
                    link(new, other)

        result.extend([] for _ in range(num_variable_input_arcs))
        return result

    return behavior


def event_names(ocpn: Ocpn) -> dict[str, str]:
    """Use the label as event name; fall back to the id for unlabeled or already used labels (SimPN needs unique names)."""
    id_transitionLabel: dict[str, str] = {}
    for t in ocpn.petri_net.transitions:
        if not t.label:
            id_transitionLabel[t.id] = t.id
        elif t.label not in id_transitionLabel.values():
            id_transitionLabel[t.id] = t.label
        else:
            id_transitionLabel[t.id] = f"{t.label}_{t.id}"
    return id_transitionLabel

def build_simulation(ocpn: Ocpn, config: SimulationConfig) -> SimProblem:
    config = config
    net = ocpn.petri_net
    rng = random.Random(config.seed)
    model = SimProblem(binding_priority=lambda bindings: rng.choice(bindings))
    factory = ObjectIdCounter()

    place_ids = {p.id for p in net.places}
    names = event_names(ocpn)

    simulation_places: dict[str, OCPNVar] = {
        p.id: OCPNVar(model, ocpn.place_object_type[p.id], p.id) for p in net.places
    }

    for place_id, tokens in (net.initial_marking or {}).items():
        place = simulation_places[place_id]
        for _ in range(tokens):
            place.put(factory.create(place.object_type))

    for t in net.transitions:
        incoming_places, outgoing_places = [], []
        for arc in net.arcs:
            source, target = arc.nodes
            if target == t.id and source in place_ids:
                incoming_places.append((simulation_places[source], is_variable(ocpn, source, t.id, place_is_source=True)))
            elif source == t.id and target in place_ids:
                outgoing_places.append((simulation_places[target], is_variable(ocpn, target, t.id, place_is_source=False)))

        if not incoming_places:
            raise ValueError(f"Transition '{names[t.id]}' has no input places; SimPN cannot simulate source transitions.")

        silent = not t.label
        delay_config = config.delays.get(t.id) or (DelayConfig(value=0) if silent else config.default_delay)
        event = OCPNEvent(
            model,
            incoming_places,
            outgoing_places,
            name=names[t.id],
            guard=default_guard(incoming_places),
            behavior=default_behavior(
                incoming_places,
                outgoing_places,
                factory,
                sample_delay=lambda delay_config=delay_config: delay_config.sample(rng),
            ),
            selection=default_selection(incoming_places),
        )
        event.silent = silent

    return model


def run_simulation(ocpn: Ocpn, config: SimulationConfig | None = None) -> SimulationResult:
    config = config or SimulationConfig()
    model = build_simulation(ocpn, config)
    reporter = OCELReporter(model, to_datetime=config.to_datetime)
    model.simulate(config.duration, reporter)

    events = [
        SimulatedEvent(
            id=str(row["event_id"]),
            activity=str(row["activity"]),
            timestamp=config.to_datetime(float(row["timestamp"])),
            silent=row["activity"].silent,
            objects={
                object_type: [f"{object_type}-{oid}" for oid in dict.fromkeys(row[object_type])]
                for object_type in reporter.object_types
                if row[object_type]
            },
        )
        for _, row in reporter.ocel_df.iterrows()
    ]

    reporter.ocel_df = reporter.ocel_df[~reporter.ocel_df["activity"].map(lambda event: event.silent)]

    return SimulationResult(
        events=events,
        final_marking={p.get_id(): len(p.marking) for p in model.places},
        end_time=config.to_datetime(float(model.clock)),
        ocel=reporter.to_ocel20(),
    )
