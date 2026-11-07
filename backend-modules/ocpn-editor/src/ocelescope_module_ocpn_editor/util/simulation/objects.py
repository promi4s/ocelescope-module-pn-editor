"""Simulated objects: creation with ids per type, and the relations between them."""
from itertools import count


class ObjectIdCounter:
    """Creates object tokens in places with ids that are unique per object type."""

    def __init__(self):
        self._counters: dict[str, count] = {}

    def create(self, object_type: str) -> dict:
        counter = self._counters.setdefault(object_type, count(1))
        return {"object_type": object_type, f"{object_type}_id": next(counter)}


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


def object_id(obj: dict):
    return obj[f"{obj['object_type']}_id"]
