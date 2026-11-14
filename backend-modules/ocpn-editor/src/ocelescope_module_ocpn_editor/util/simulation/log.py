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
        ocel_objects.append({"id": ocel_object_id(obj), "type": obj["object_type"], "attributes": [], "relationships": related})

    return {
        "eventTypes": [{"name": name, "attributes": [{"name": "end_time", "type": "time"}]} for name in activities],
        "objectTypes": [{"name": name, "attributes": []} for name in object_types],
        "events": events,
        "objects": ocel_objects,
    }
