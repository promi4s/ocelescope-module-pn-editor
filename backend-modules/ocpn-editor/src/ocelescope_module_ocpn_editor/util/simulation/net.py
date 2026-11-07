"""Reading the editor net: arc kinds, event names and checks of the settings against the net."""
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


def is_variable(ocpn: Ocpn, place_id: str, transition_id: str, place_is_source: bool) -> bool:
    if not ocpn.place_in_out_mult or place_id not in ocpn.place_in_out_mult:
        return False
    in_mult, out_mult = ocpn.place_in_out_mult[place_id]
    lookup = out_mult if place_is_source else in_mult
    return lookup.get(transition_id, False)


def arc_indices(incoming_vars: list[tuple[OCPNVar, bool]]) -> tuple[list[int], list[int]]:
    """Indices of regular and variable input arcs."""
    regular = [i for i, (_, variable) in enumerate(incoming_vars) if not variable]
    variable = [i for i, (_, variable) in enumerate(incoming_vars) if variable]
    return regular, variable


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


def check_object_counts(config: SimulationConfig, names: dict[str, str], arcs: dict[str, tuple[list, list]]):
    """An ObjectCount needs a variable arc to bind or create more than one object."""
    for transition_id, by_type in config.object_counts.items():
        if transition_id not in arcs:
            continue  # settings of deleted transitions are ignored
        incoming, outgoing = arcs[transition_id]
        input_types = {var.object_type for var, _ in incoming}
        for object_type in by_type:
            on_variable_input = any(var.object_type == object_type and variable for var, variable in incoming)
            created_on_variable_output = object_type not in input_types and any(
                var.object_type == object_type and variable for var, variable in outgoing
            )
            if not (on_variable_input or created_on_variable_output):
                raise ValueError(
                    f"Transition '{names[transition_id]}' sets a number of '{object_type}' objects, "
                    f"but has no variable arc of that type to take or create them."
                )
