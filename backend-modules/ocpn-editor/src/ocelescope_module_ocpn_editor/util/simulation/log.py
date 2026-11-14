"""Turns the ended firings into the event table and an OCEL 2.0 log."""
from collections.abc import Callable
from datetime import datetime
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulatedEvent
from ocelescope_module_ocpn_editor.util.simulation.engine import Firing
from ocelescope_module_ocpn_editor.util.simulation.objects import ocel_object_id


def _objects_by_type(firing: Firing) -> dict[str, list[str]]:
    """Consumed and created objects of a firing, per object type."""
    objects: dict[str, list[str]] = {}
    for objects_by_type in (firing.binding, firing.created):
        for object_type, objs in objects_by_type.items():
            objects.setdefault(object_type, []).extend(ocel_object_id(obj) for obj in objs)
    return objects


def event_table(firings: list[Firing], to_datetime: Callable[[float], datetime]) -> list[SimulatedEvent]:
    return [
        SimulatedEvent(
            id=f"e{firing.id}",
            activity=firing.transition.name,
            timestamp=to_datetime(firing.start),
            silent=firing.transition.silent,
            objects=_objects_by_type(firing),
        )
        for firing in firings
    ]


def _ocel_type(value) -> str:
    if isinstance(value, bool):
        return "boolean"
    if isinstance(value, int):
        return "integer"
    if isinstance(value, float):
        return "float"
    return "string"


def _object_attributes(obj: dict, iso: Callable[[float], str]) -> list[dict]:
    """Initial values at the object's creation, then every change, with the time it happened."""
    values = [(obj.get("created_at", 0.0), name, value) for name, value in obj.get("initial_attributes", {}).items()]
    values += obj.get("attribute_changes", [])
    return [{"name": name, "time": iso(time), "value": value} for time, name, value in values if value is not None]


def _object_type_attributes(objects: list[dict]) -> dict[str, dict[str, str]]:
    """Per object type: its attribute names with their OCEL type (from the values that occurred)."""
    types: dict[str, dict[str, str]] = {}
    for obj in objects:
        attributes = types.setdefault(obj["object_type"], {})
        changes = [(name, value) for _, name, value in obj.get("attribute_changes", [])]
        for name, value in [*obj.get("initial_attributes", {}).items(), *changes]:
            if value is None:
                continue
            kind, previous = _ocel_type(value), attributes.get(name)
            if previous is None or previous == kind:
                attributes[name] = kind
            else:  # whole and decimal numbers mixed are floats, anything else mixed is text
                attributes[name] = "float" if {previous, kind} <= {"integer", "float"} else "string"
    return types


def ocel20(firings: list[Firing], objects: list[dict], to_datetime: Callable[[float], datetime]) -> dict:
    """
    OCEL 2.0 JSON of the visible (non-silent) events. Events link to the objects they consumed ("involved") and
    created ("created"), objects to the objects they were created with ("related").
    """
    def iso(sim_time: float) -> str:
        return to_datetime(sim_time).isoformat(timespec="seconds")

    visible = [firing for firing in firings if not firing.transition.silent]
    activities = list(dict.fromkeys(firing.transition.name for firing in visible))
    object_types = list(dict.fromkeys(obj["object_type"] for obj in objects))
    type_attributes = _object_type_attributes(objects)

    events = []
    for firing in visible:
        relationships = [
            {"objectId": ocel_object_id(obj), "qualifier": qualifier}
            for objects_by_type, qualifier in ((firing.binding, "involved"), (firing.created, "created"))
            for objs in objects_by_type.values()
            for obj in objs
        ]
        events.append({
            "id": f"e{firing.id}",
            "type": firing.transition.name,
            "time": iso(firing.start),
            "attributes": [{"name": "end_time", "value": iso(firing.end)}],
            "relationships": relationships,
        })

    ocel_objects = []
    for obj in objects:
        related = [
            {"objectId": f"{object_type}-{oid}", "qualifier": "related"}
            for object_type, ids in obj.get("related", {}).items()
            for oid in ids
        ]
        ocel_objects.append({
            "id": ocel_object_id(obj),
            "type": obj["object_type"],
            "attributes": _object_attributes(obj, iso),
            "relationships": related,
        })

    return {
        "eventTypes": [{"name": name, "attributes": [{"name": "end_time", "type": "time"}]} for name in activities],
        "objectTypes": [
            {
                "name": name,
                "attributes": [{"name": a, "type": t} for a, t in type_attributes.get(name, {}).items()],
            }
            for name in object_types
        ],
        "events": events,
        "objects": ocel_objects,
    }
