from datetime import datetime, timedelta
import json
from collections.abc import Callable
from typing import Any
import pandas as pd
from simpn.simulator import SimProblem
from simpn.reporters import Reporter
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar, OCPNEvent


def _make_object_id(object_type: str, oid: Any) -> str:
    """Create a globally unique object ID string."""
    return f"{object_type}-{oid}"


def _serialize_attr(value: Any) -> Any:
    """Serialize attribute value for OCEL JSON (handles lists, dicts)."""
    if isinstance(value, (dict, list)):
        return json.dumps(value)
    return value


def _seconds_since_epoch(timestamp: float) -> datetime:
    """Default conversion: simulation time counted as seconds since 1970-01-01."""
    return datetime(1970, 1, 1) + timedelta(seconds=float(timestamp))

class OCELReporter(Reporter):
    """
    An OCEL reporter that writes occurring events to Excel, OCEL 1.0 JSON (pm4py),
    or OCEL 2.0 JSON format.
    Every event is characterized by:
    - event_id: a unique identifier for the event
    - activity: the transition that was fired
    - timestamp: the time when the transition was fired
    - omap: the mapping of object types to set of object ids involved in the transition
    - vmap: mapping of object types to set of object attribute dictionaries (one per oid)
    """
    def __init__(self, model, to_datetime: Callable[[float], datetime] = _seconds_since_epoch):
        self.model = model
        self.to_datetime = to_datetime
        self.header = ["event_id", "activity", "timestamp"]
        self.event_id = 20260200
        self.object_types = []
        for var in self.model.places:
            if isinstance(var, OCPNVar):
                if var.object_type not in self.object_types:
                    self.object_types.append(var.object_type)
        self.header.extend(self.object_types)
        self.header.extend([str(object_type)+"_vmap" for object_type in self.object_types])
        print(self.header)
        self.ocel_df = pd.DataFrame(columns=self.header)
    
    def callback(self, timed_binding):
        (binding, timestamp, activity) = timed_binding

        self.event_id += 1

        omap = {object_type: [] for object_type in self.object_types}
        vmap = {str(object_type)+"_vmap": [] for object_type in self.object_types}

        # Re-apply the selection function (if present) to determine which tokens from
        # variable arc queues actually participated in the event, rather than inspecting
        # the output binding to see what was put back.
        raw_args = [token.value for var, token in binding]
        if isinstance(activity, OCPNEvent) and activity._user_selection is not None:
            selected_args = activity._user_selection(*raw_args)
        else:
            selected_args = raw_args

        for i, (var, token) in enumerate(binding):
            if str(var).endswith(".queue"):
                # Variable arc: selected_args[i] is the subset of SimTokens that participated
                for t in selected_args[i]:
                    obj_type = t.value['object_type']
                    omap[obj_type].append(t.value[str(obj_type) + "_id"])
                    vmap[str(obj_type) + "_vmap"].append(t.value)
            else:
                # Regular arc: token.value is the consumed object dict
                if isinstance(var, OCPNVar):
                    obj_type = var.object_type
                    omap[obj_type].append(token.value[str(obj_type) + "_id"])
                    vmap[str(obj_type) + "_vmap"].append(token.value)

        result = [self.event_id, activity, timestamp] + list(omap.values()) + list(vmap.values())
        self.ocel_df.loc[len(self.ocel_df)] = result

    def _build_ocel_structures(self) -> tuple[dict, dict]:
        """
        Build events and objects dicts from ocel_df for OCEL export.
        Returns (events_dict, objects_dict).
        objects_dict values include ocel:type, ocel:ovmap, and first_seen (ISO timestamp).
        """
        events: dict = {}
        objects: dict = {}

        for _, row in self.ocel_df.iterrows():
            eid = row["event_id"]
            activity = row["activity"]
            timestamp = row["timestamp"]
            ts_iso = self.to_datetime(timestamp).isoformat(timespec="seconds")
            flat_omap: list[str] = []

            for ot in self.object_types:
                omap_ids = row.get(ot)
                vmap_list = row.get(f"{ot}_vmap")

                if omap_ids is not None and vmap_list is not None:
                    ids = omap_ids if isinstance(omap_ids, list) else [omap_ids]
                    attrs_list = vmap_list if isinstance(vmap_list, list) else [vmap_list]

                    for i, oid in enumerate(ids):
                        obj_id = _make_object_id(ot, oid)
                        flat_omap.append(obj_id)

                        if obj_id not in objects:
                            ovmap = {}
                            if i < len(attrs_list):
                                d = attrs_list[i]
                                if isinstance(d, dict):
                                    for k, v in d.items():
                                        if k != "object_type":
                                            ovmap[k] = _serialize_attr(v)
                            objects[obj_id] = {
                                "ocel:type": ot,
                                "ocel:ovmap": ovmap,
                                "first_seen": ts_iso,
                            }

            events[f"e{eid}"] = {
                "ocel:activity": str(activity),
                "ocel:timestamp": ts_iso,
                "ocel:omap": flat_omap,
                "ocel:vmap": {},
            }

        return events, objects

    def save_report(self, path: str = "ocel_report.xlsx") -> None:
        """Save the event log to Excel (backward compatible)."""
        print(self.ocel_df)
        print(f"saved to {path}")
        self.ocel_df.to_excel(path, index=False)

    def save_jsonocel(self, path: str = "ocel_report.jsonocel") -> None:
        """
        Export to OCEL 1.0 JSON format for pm4py.
        Use file extension .jsonocel for pm4py.read.read_ocel().
        """
        events, objects_raw = self._build_ocel_structures()

        objects = {
            oid: {"ocel:type": o["ocel:type"], "ocel:ovmap": o["ocel:ovmap"]}
            for oid, o in objects_raw.items()
        }

        ocel10 = {
            "ocel:global-log": {
                "ocel:version": "1.0",
                "ocel:attribute-names": [],
                "ocel:object-types": list(self.object_types),
                "ocel:ordering": "timestamp",
            },
            "ocel:global-event": {"ocel:activity": "__INVALID__"},
            "ocel:global-object": {"ocel:type": "__INVALID__"},
            "ocel:events": events,
            "ocel:objects": objects,
        }

        with open(path, "w", encoding="utf-8") as f:
            json.dump(ocel10, f, indent=2)
        print(f"OCEL 1.0 saved to {path}")

    def save_ocel20(self, path: str = "ocel_report.json") -> None:
        """
        Export to OCEL 2.0 JSON format.
        Compatible with ocel-standard.org and tools supporting OCEL 2.0.
        """
        with open(path, "w", encoding="utf-8") as f:
            json.dump(self.to_ocel20(), f, indent=2)
        print(f"OCEL 2.0 saved to {path}")

    def to_ocel20(self) -> dict:
        """Build the OCEL 2.0 JSON structure without writing it to a file."""
        events, objects_raw = self._build_ocel_structures()

        event_types: dict[str, dict] = {}
        for e in events.values():
            act = e["ocel:activity"]
            if act not in event_types:
                event_types[act] = {"name": act, "attributes": []}

        object_types: dict[str, dict] = {}
        for o in objects_raw.values():
            ot = o["ocel:type"]
            if ot not in object_types:
                attrs = [{"name": k, "type": "string"} for k in o["ocel:ovmap"].keys()]
                object_types[ot] = {"name": ot, "attributes": attrs}

        ocel20_events = []
        for eid, e in events.items():
            relationships = [
                {"objectId": oid, "qualifier": "involved"}
                for oid in e["ocel:omap"]
            ]
            ocel20_events.append({
                "id": eid,
                "type": e["ocel:activity"],
                "time": e["ocel:timestamp"],
                "attributes": [],
                "relationships": relationships,
            })

        ocel20_objects = []
        for oid, o in objects_raw.items():
            ts = o.get("first_seen", "1970-01-01T00:00:00")
            attrs = [
                {"name": k, "value": str(v), "time": ts}
                for k, v in o["ocel:ovmap"].items()
            ]
            ocel20_objects.append({
                "id": oid,
                "type": o["ocel:type"],
                "attributes": attrs,
                "relationships": [],
            })

        return {
            "eventTypes": list(event_types.values()),
            "objectTypes": list(object_types.values()),
            "events": ocel20_events,
            "objects": ocel20_objects,
        }
        