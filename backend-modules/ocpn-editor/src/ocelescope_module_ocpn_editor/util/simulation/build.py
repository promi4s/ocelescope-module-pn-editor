"""Translates the editor net and the settings into a simulation engine with its initial marking and arrivals."""
import random
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import (
    AttributeCondition,
    AttributeUpdate,
    DelayConfig,
    SimulationConfig,
)
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.engine import Engine
from ocelescope_module_ocpn_editor.util.simulation.model import SimNet, SimPlace, SimTransition
from ocelescope_module_ocpn_editor.util.simulation.net import check_object_counts, event_names, is_variable
from ocelescope_module_ocpn_editor.util.simulation.objects import ObjectIdCounter


def _check_attribute(config: SimulationConfig, transition: str, object_type: str, attribute: str):
    if attribute not in {a.name for a in config.object_attributes.get(object_type, [])}:
        raise ValueError(f"Transition '{transition}' uses the attribute '{attribute}', which {object_type} does not have.")


def _guards(config: SimulationConfig, transition_id: str, name: str, input_places: dict) -> dict[str, list[AttributeCondition]]:
    """The transition's conditions per input type; conditions can only refer to objects the transition binds."""
    guards: dict[str, list[AttributeCondition]] = {}
    for condition in config.guards.get(transition_id, []):
        if condition.object_type not in input_places:
            raise ValueError(
                f"Transition '{name}' has a condition on {condition.object_type}, which is not one of its inputs."
            )
        _check_attribute(config, name, condition.object_type, condition.attribute)
        guards.setdefault(condition.object_type, []).append(condition)
    return guards


def _updates(
    config: SimulationConfig, transition_id: str, name: str, input_places: dict, output_places: dict
) -> list[AttributeUpdate]:
    updates = config.attribute_updates.get(transition_id, [])
    for update in updates:
        if update.object_type not in input_places and update.object_type not in output_places:
            raise ValueError(f"Transition '{name}' updates {update.object_type}, which it neither binds nor creates.")
        _check_attribute(config, name, update.object_type, update.attribute)
    return updates


def _weight(config: SimulationConfig, transition_id: str, name: str) -> float:
    weight = config.weights.get(transition_id, 1.0)
    if weight <= 0:
        raise ValueError(f"Transition '{name}' needs a routing weight above 0.")
    return weight


def build_simulation(ocpn: Ocpn, config: SimulationConfig) -> Engine:
    net = ocpn.petri_net
    names = event_names(ocpn)
    places = {p.id: SimPlace(p.id, ocpn.place_object_type[p.id]) for p in net.places}

    transitions = {}
    for t in net.transitions:
        input_places: dict[str, list[SimPlace]] = {}
        output_places: dict[str, list[SimPlace]] = {}
        variable_input_types, variable_output_types = set(), set()
        for arc in net.arcs:
            source, target = arc.nodes
            if target == t.id and source in places:
                place = places[source]
                input_places.setdefault(place.object_type, []).append(place)
                if is_variable(ocpn, source, t.id, place_is_source=True):
                    variable_input_types.add(place.object_type)
            elif source == t.id and target in places:
                place = places[target]
                output_places.setdefault(place.object_type, []).append(place)
                if is_variable(ocpn, target, t.id, place_is_source=False):
                    variable_output_types.add(place.object_type)
        if not input_places:
            raise ValueError(
                f"Transition '{names[t.id]}' has no input places. Let objects arrive in a place instead."
            )

        silent = not t.label
        # silent transitions only route objects: they take no time unless set for them explicitly
        no_time = DelayConfig(value=0)
        transition = SimTransition(
            id=t.id,
            name=names[t.id],
            silent=silent,
            delay=config.delays.get(t.id) or (no_time if silent else config.default_delay),
            duration=config.durations.get(t.id) or (no_time if silent else config.default_duration),
            input_places=input_places,
            output_places=output_places,
            variable_input_types=variable_input_types,
            variable_output_types=variable_output_types,
            counts=config.object_counts.get(t.id, {}),
            guards=_guards(config, t.id, names[t.id], input_places),
            updates=_updates(config, t.id, names[t.id], input_places, output_places),
            weight=_weight(config, t.id, names[t.id]),
        )
        check_object_counts(transition)
        transitions[t.id] = transition

    engine = Engine(SimNet(places, transitions), config, random.Random(config.seed), ObjectIdCounter())
    for place_id, tokens in (net.initial_marking or {}).items():
        if place_id in places:
            engine.put_initial(places[place_id], tokens)
    for place_id, arrival in config.arrivals.items():
        if place_id in places:  # settings of deleted places are ignored
            engine.add_arrivals(places[place_id], arrival)
    return engine
