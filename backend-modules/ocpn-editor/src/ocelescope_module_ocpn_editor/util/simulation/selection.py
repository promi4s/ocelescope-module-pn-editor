"""Which objects a transition takes from its variable input arcs."""
import hashlib
import inspect
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import ObjectCount
from ocelescope_module_ocpn_editor.util.simulation.net import arc_indices
from ocelescope_module_ocpn_editor.util.simulation.objects import object_id, related_ids


def chance(salt: int, *parts) -> float:
    """
    A pseudo-random number in [0, 1) that is always the same for the same inputs.
    Selections run several times per firing (binding search, behavior), so they cannot draw from the RNG.
    """
    digest = hashlib.sha256("|".join(map(str, (salt, *parts))).encode()).digest()
    return int.from_bytes(digest[:8], "big") / 2**64


def random_subset(ids: set, low: int, high: int, key: tuple) -> set:
    """A subset of `low`..`high` of `ids`, chosen pseudo-randomly from `key` (stable while `key` is unchanged)."""
    size = low + min(int(chance(*key, "size") * (high - low + 1)), high - low)
    return set(sorted(ids, key=lambda i: (chance(*key, i), str(i)))[:size])


def default_selection(
    transition_id: str,
    incoming_vars: list[tuple[OCPNVar, bool]],
    counts: dict[str, ObjectCount],
    fired: list[int],
    salt: int,
):
    """
    Which objects a transition takes from its variable input arcs, per object type:
    - an object can only be taken if it is in every variable input place of its type,
    - if the regular-arc objects have relations to that type, only related objects are taken (e.g. the items of
      this order); otherwise any object,
    - with an ObjectCount for the type, a random subset of `exact` or `minimum`..`maximum` objects is taken,
      and the transition waits until at least that many are available; without one, all of them are taken.
    The random subset is drawn from (salt, transition, number of firings), so it stays the same for all
    evaluations of one firing and changes with every firing.
    Returns None if the transition has no variable input arcs.
    """
    regular, variable = arc_indices(incoming_vars)
    if not variable:
        return None
    arcs_by_type: dict[str, list[int]] = {}
    for i in variable:
        arcs_by_type.setdefault(incoming_vars[i][0].object_type, []).append(i)

    def selection(*args):
        anchors = [args[i] for i in regular]
        selected = list(args)
        for object_type, indices in arcs_by_type.items():
            common = set.intersection(*({object_id(token.value) for token in args[i]} for i in indices))
            ids = related_ids(anchors, object_type)
            if ids is not None:
                common &= ids
            object_count = counts.get(object_type)
            if object_count is not None:
                low, high = object_count.bounds(len(common))
                if len(common) < low or high < low:
                    return [[] if j in variable else arg for j, arg in enumerate(args)]  # disables the transition
                common = random_subset(common, low, high, key=(salt, transition_id, fired[0], object_type))
            for i in indices:
                selected[i] = [token for token in args[i] if object_id(token.value) in common]
        return selected

    selection.__signature__ = inspect.Signature(
        [inspect.Parameter(f"arg{i}", inspect.Parameter.POSITIONAL_ONLY) for i in range(len(incoming_vars))]
    )
    return selection
