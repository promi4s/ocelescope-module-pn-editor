"""Translates the editor net and the settings into a SimPN model."""
import random
from simpn.simulator import SimProblem
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar, OCPNEvent
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import DelayConfig, SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.arrivals import add_arrivals
from ocelescope_module_ocpn_editor.util.simulation.behavior import default_behavior
from ocelescope_module_ocpn_editor.util.simulation.engine import BoundedSimProblem, choose_binding
from ocelescope_module_ocpn_editor.util.simulation.guard import default_guard
from ocelescope_module_ocpn_editor.util.simulation.net import check_object_counts, event_names, is_variable
from ocelescope_module_ocpn_editor.util.simulation.objects import ObjectIdCounter
from ocelescope_module_ocpn_editor.util.simulation.selection import default_selection


def build_simulation(ocpn: Ocpn, config: SimulationConfig) -> SimProblem:
    net = ocpn.petri_net
    rng = random.Random(config.seed)
    # Seeds the random object subsets; drawn outside `rng` so it does not shift a seeded run.
    salt = config.seed if config.seed is not None else random.SystemRandom().getrandbits(64)
    priority_events: list = []  # filled below, read by the binding priority during the run
    model = BoundedSimProblem(binding_priority=choose_binding(rng, priority_events, config.priority_probability))
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

    arcs: dict[str, tuple[list, list]] = {}
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
        arcs[t.id] = (incoming_places, outgoing_places)
    check_object_counts(config, names, arcs)

    events_by_transition = {}
    for t in net.transitions:
        incoming_places, outgoing_places = arcs[t.id]
        silent = not t.label
        delay_config = config.delays.get(t.id) or (DelayConfig(value=0) if silent else config.default_delay)
        counts = config.object_counts.get(t.id, {})
        fired = [0]  # firings of this transition, shared by its selection and behavior
        event = OCPNEvent(
            model,
            incoming_places,
            outgoing_places,
            name=names[t.id],
            guard=default_guard(incoming_places, counts),
            behavior=default_behavior(
                incoming_places,
                outgoing_places,
                factory,
                sample_delay=lambda delay_config=delay_config: delay_config.sample(rng),
                counts=counts,
                rng=rng,
                fired=fired,
            ),
            selection=default_selection(t.id, incoming_places, counts, fired, salt),
        )
        event.silent = silent
        events_by_transition[t.id] = event

    priority_events.extend(events_by_transition[t] for t in config.activity_priority if t in events_by_transition)

    for place_id, arrival in config.arrivals.items():
        if place_id not in simulation_places:
            continue  # settings of deleted places are ignored
        add_arrivals(model, simulation_places[place_id], arrival, factory, rng)

    return model
