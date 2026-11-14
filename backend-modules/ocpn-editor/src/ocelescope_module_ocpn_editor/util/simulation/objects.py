"""Simulated objects: creation with ids per type, and the relations between them."""
from itertools import count


class ObjectIdCounter:
    """Creates objects with ids that are unique per object type."""

    def __init__(self):
        self._counters: dict[str, count] = {}

    def create(self, object_type: str) -> dict:
        counter = self._counters.setdefault(object_type, count(1))
        return {"object_type": object_type, f"{object_type}_id": next(counter)}


def object_id(obj: dict):
    return obj[f"{obj['object_type']}_id"]


def object_key(obj: dict) -> tuple:
    """Unique across types: ids only count per type."""
    return obj["object_type"], object_id(obj)


def ocel_object_id(obj: dict) -> str:
    return f"{obj['object_type']}-{object_id(obj)}"


def link(a: dict, b: dict):
    """Record a relation between two objects on both of them, under obj["related"][other_type]."""
    a_type, b_type = a["object_type"], b["object_type"]
    a.setdefault("related", {}).setdefault(b_type, []).append(object_id(b))
    b.setdefault("related", {}).setdefault(a_type, []).append(object_id(a))


def related_ids(objects: list[dict], object_type: str) -> set | None:
    """
    Ids of objects of `object_type` related to any of `objects`.
    Returns None if none of them has relations to that type, meaning there is nothing to correlate on.
    """
    ids = None
    for obj in objects:
        related = obj.get("related", {})
        if object_type in related:
            ids = (ids or set()) | set(related[object_type])
    return ids


def belong_together(a: dict, b: dict) -> bool:
    """False if one object has relations to the other's type, but not to the other object."""
    for x, y in ((a, b), (b, a)):
        related = x.get("related", {}).get(y["object_type"])
        if related is not None and object_id(y) not in related:
            return False
    return True
