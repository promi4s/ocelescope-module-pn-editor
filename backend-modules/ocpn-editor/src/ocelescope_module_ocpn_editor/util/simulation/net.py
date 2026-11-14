"""Reading the editor net: arc kinds, event names and checks of the settings against the net."""
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.model import SimTransition


def is_variable(ocpn: Ocpn, place_id: str, transition_id: str, place_is_source: bool) -> bool:
    if not ocpn.place_in_out_mult or place_id not in ocpn.place_in_out_mult:
        return False
    in_mult, out_mult = ocpn.place_in_out_mult[place_id]
    lookup = out_mult if place_is_source else in_mult
    return lookup.get(transition_id, False)


def event_names(ocpn: Ocpn) -> dict[str, str]:
    """Use the label as event name; fall back to the id for unlabeled or already used labels."""
    id_transitionLabel: dict[str, str] = {}
    for t in ocpn.petri_net.transitions:
        if not t.label:
            id_transitionLabel[t.id] = t.id
        elif t.label not in id_transitionLabel.values():
            id_transitionLabel[t.id] = t.label
        else:
            id_transitionLabel[t.id] = f"{t.label}_{t.id}"
    return id_transitionLabel


def check_object_counts(transition: SimTransition):
    """An ObjectCount needs a variable arc to bind or create more than one object."""
    for object_type in transition.counts:
        on_variable_input = object_type in transition.variable_input_types
        created_on_variable_output = (
            object_type in transition.created_types and object_type in transition.variable_output_types
        )
        if not (on_variable_input or created_on_variable_output):
            raise ValueError(
                f"Transition '{transition.name}' sets a number of '{object_type}' objects, "
                f"but has no variable arc of that type to take or create them."
            )
