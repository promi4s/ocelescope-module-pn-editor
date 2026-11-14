"""
Enabled bindings of a transition, following qel_simulation's Transition.determine_new_binding_functions:
per input object type, the candidates are the objects in *every* input place of that type; a normal arc binds
exactly one of them, a variable arc a subset. qel_simulation builds every combination; here the search stops after
`limit` bindings in random order, because the number of subsets of a variable arc grows exponentially.

On top of that, objects must belong together (see objects.related_ids / belong_together):
- objects on normal arcs of different types must not contradict each other's relations,
- a variable arc only takes objects related to the normal-arc objects, if they have relations to its type, and
  without an ObjectCount it waits until all of them are there.
"""
import itertools
import random
from ocelescope_module_ocpn_editor.util.simulation.model import Binding, SimTransition
from ocelescope_module_ocpn_editor.util.simulation.objects import belong_together, object_id, related_ids


def candidates(transition: SimTransition, object_type: str) -> list[dict]:
    """Objects that are in every input place of `object_type`, in the order of the first place."""
    first, *others = transition.input_places[object_type]
    return [obj for key, obj in first.marking.items() if all(key in place.marking for place in others)]


def _subsets(pool: list[dict], low: int, high: int, rng: random.Random, limit: int) -> list[list[dict]]:
    """Up to `limit` subsets of `pool` with `low`..`high` objects, in random order."""
    pool = pool[:]
    rng.shuffle(pool)
    sizes = list(range(low, high + 1))
    rng.shuffle(sizes)
    subsets = []
    for size in sizes:
        for combination in itertools.combinations(pool, size):
            subsets.append(list(combination))
            if len(subsets) >= limit:
                return subsets
    return subsets


def _variable_choices(
    transition: SimTransition,
    anchors: list[dict],
    pools: dict[str, list[dict]],
    pools_by_id: dict[str, dict],
    rng: random.Random,
    limit: int,
) -> list[dict[str, list[dict]]]:
    """Possible object sets for the variable input types, given the objects on the normal arcs."""
    options_per_type = []
    for object_type in sorted(transition.variable_input_types):  # sorted: set order changes between processes
        pool = pools[object_type]
        ids = related_ids(anchors, object_type)
        if ids is not None:
            by_id = pools_by_id[object_type]
            pool = [by_id[i] for i in sorted(ids, key=str) if i in by_id]
        count = transition.counts.get(object_type)
        if count is not None:
            low, high = count.bounds(len(pool))
            if len(pool) < low or high < low:
                return []
            options = _subsets(pool, low, high, rng, limit)
        elif ids is not None:
            if {object_id(obj) for obj in pool} != ids:
                return []  # wait until every related object has arrived
            options = [pool]
        else:
            if not pool:
                return []
            options = [pool]  # no count and nothing to correlate on: take all available objects
        options_per_type.append((object_type, options))

    choices = []
    for combination in itertools.product(*(options for _, options in options_per_type)):
        choices.append({object_type: objects for (object_type, _), objects in zip(options_per_type, combination)})
        if len(choices) >= limit:
            break
    return choices


def enabled_bindings(transition: SimTransition, rng: random.Random, limit: int = 100) -> list[Binding]:
    """Up to `limit` enabled bindings of `transition` under the current marking, in random order."""
    pools = {object_type: candidates(transition, object_type) for object_type in transition.input_places}
    if any(not pool for pool in pools.values()):
        return []

    normal_types = [t for t in transition.input_places if t not in transition.variable_input_types]
    for object_type in normal_types:
        rng.shuffle(pools[object_type])
    # variable arcs look related objects up by id instead of scanning the whole pool for every anchor
    pools_by_id = {t: {object_id(obj): obj for obj in pools[t]} for t in transition.variable_input_types}

    bindings: list[Binding] = []

    def choose(i: int, anchors: list[dict]):
        """Pick one object per normal type (depth-first), then the variable sets."""
        if i == len(normal_types):
            for variable in _variable_choices(transition, anchors, pools, pools_by_id, rng, limit - len(bindings)):
                bindings.append({**{t: [obj] for t, obj in zip(normal_types, anchors)}, **variable})
            return
        for obj in pools[normal_types[i]]:
            if all(belong_together(obj, anchor) for anchor in anchors):
                choose(i + 1, anchors + [obj])
                if len(bindings) >= limit:
                    return

    choose(0, [])
    return bindings
