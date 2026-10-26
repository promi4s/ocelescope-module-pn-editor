from pydantic import BaseModel


class SimulatedEvent(BaseModel):
    id: str
    activity: str
    timestamp: float
    # object type -> ids of the objects involved, e.g. {"order": ["order-1"], "item": ["item-1", "item-2"]}
    objects: dict[str, list[str]]


class SimulationResult(BaseModel):
    events: list[SimulatedEvent]
    # place id -> number of tokens when the simulation ended
    final_marking: dict[str, int]
    end_time: float
