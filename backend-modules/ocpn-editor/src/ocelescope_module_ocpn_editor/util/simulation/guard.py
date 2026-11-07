"""Whether a combination of input tokens may fire together."""
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import ObjectCount
from ocelescope_module_ocpn_editor.util.simulation.net import arc_indices
from ocelescope_module_ocpn_editor.util.simulation.objects import object_id, related_ids


def default_guard(incoming_vars: list[tuple[OCPNVar, bool]], counts: dict[str, ObjectCount]):
    """
    - all regular input arcs of the same object type must bind the same object,
    - regular input objects of different types must belong together: if one has relations to the other's type,
      the other must be one of them (e.g. an order only with one of its own items),
    - a variable input arc must contain all objects related to the anchors (wait until every related object has
      arrived), unless an ObjectCount is set for its type: then the count decides.
    Returns None if there is nothing to check, so no guard is installed.
    """
    regular_input, variable_input = arc_indices(incoming_vars)
    regular_by_type: dict[str, list[int]] = {}
    for i in regular_input:
        regular_by_type.setdefault(incoming_vars[i][0].object_type, []).append(i)
    several_regular_types = len(regular_by_type) > 1
    regular_by_type = {object_type: indices for object_type, indices in regular_by_type.items() if len(indices) > 1}
    if not regular_by_type and not several_regular_types and not (regular_input and variable_input):
        return None

    def guard(*args):
        for object_type, indices in regular_by_type.items():
            if len({args[i][f"{object_type}_id"] for i in indices}) > 1:
                return False
        anchors = [args[i] for i in regular_input]
        if several_regular_types:
            for a in anchors:
                for b in anchors:
                    related = a.get("related", {}).get(b["object_type"])
                    if b["object_type"] != a["object_type"] and related is not None and object_id(b) not in related:
                        return False
        for i in variable_input:
            object_type = incoming_vars[i][0].object_type
            if object_type in counts:
                continue
            ids = related_ids(anchors, object_type)
            if ids is not None and {token.value[f"{object_type}_id"] for token in args[i]} != ids:
                return False
        return True

    return guard
