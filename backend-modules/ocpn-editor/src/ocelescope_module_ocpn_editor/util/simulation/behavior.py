"""What a firing does: pass objects on, create new ones, end others, draw the duration."""
import random
from collections.abc import Callable
from simpn.simulator import SimToken
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import ObjectCount
from ocelescope_module_ocpn_editor.util.simulation.objects import ObjectIdCounter, link


def default_behavior(
    incoming_vars: list[tuple[OCPNVar, bool]],
    outgoing_vars: list[tuple[OCPNVar, bool]],
    factory: ObjectIdCounter,
    sample_delay: Callable[[], float],
    counts: dict[str, ObjectCount],
    rng: random.Random,
    fired: list[int],
):
    """
    - objects consumed of type T are produced in every output place of type T,
    - an output type with no input of that type creates new objects (one, or as many as its ObjectCount says),
      which are linked to all consumed and other created objects of other types,
    - an input type with no output of that type ends its objects,
    - variable input arcs consume all selected tokens; the rest is returned by OCPNEvent,
    - all produced tokens get the same sampled delay (the duration of this firing).
    """
    num_variable_input_arcs = sum(1 for _, variable in incoming_vars if variable)

    def created_count(object_type: str) -> int:
        object_count = counts.get(object_type)
        if object_count is None:
            return 1
        if object_count.exact is not None:
            return object_count.exact
        return rng.randint(object_count.minimum, object_count.maximum or object_count.minimum)

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
                    existing = [factory.create(var.object_type) for _ in range(created_count(var.object_type))]
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
        fired[0] += 1
        return result

    return behavior
