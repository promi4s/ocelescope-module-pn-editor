from pydantic import BaseModel


class SimulatedEvent(BaseModel):
    id: str
    activity: str
    timestamp: float
    silent: bool
    objects: dict[str, list[str]]


class SimulationResult(BaseModel):
    events: list[SimulatedEvent]
    final_marking: dict[str, int]
    end_time: float
    ocel: dict
