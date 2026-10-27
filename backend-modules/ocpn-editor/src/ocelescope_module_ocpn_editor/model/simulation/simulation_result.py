from datetime import datetime
from pydantic import BaseModel


class SimulatedEvent(BaseModel):
    id: str
    activity: str
    timestamp: datetime
    silent: bool
    objects: dict[str, list[str]]


class SimulationResult(BaseModel):
    events: list[SimulatedEvent]
    final_marking: dict[str, int]
    end_time: datetime
    ocel: dict
