import random
from datetime import datetime, timedelta
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


class DelayConfig(BaseModel):
    """General delay for all transitions"""
    distribution: Literal["fixed", "exponential"] = "fixed"
    value: float = Field(default=1, ge=0)

    def sample(self, rng: random.Random) -> float:
        if self.distribution == "exponential":
            return rng.expovariate(1 / self.value) if self.value > 0 else 0.0
        return self.value


# ObjectCount, ArrivalConfig and the priority settings follow the binding object counts, object creation
# frequencies and activity priorities of qel_simulation
# (https://github.com/ninagraves/qel_simulation), adapted to this module's SimPN-based simulation.


class ObjectCount(BaseModel):
    """How many objects of one type a transition binds (variable input arc) or creates (output-only type)."""
    exact: int | None = Field(default=None, ge=1, description="Exactly this many objects. Overrides minimum/maximum.")
    minimum: int = Field(default=1, ge=1, description="Wait until at least this many objects are available.")
    maximum: int | None = Field(default=None, ge=1, description="At most this many objects. None = all available.")

    @model_validator(mode="after")
    def _check_range(self):
        if self.maximum is not None and self.maximum < self.minimum:
            raise ValueError(f"maximum ({self.maximum}) must not be smaller than minimum ({self.minimum})")
        return self

    def bounds(self, available: int) -> tuple[int, int]:
        """Smallest and largest number of objects to take when `available` objects are present."""
        if self.exact is not None:
            return self.exact, self.exact
        return self.minimum, min(self.maximum or available, available)


class ArrivalConfig(BaseModel):
    """New objects arriving in a place during the simulation."""
    mode: Literal["rate", "interval"] = Field(
        default="rate",
        description="'rate': random arrivals, on average `value` per time unit. 'interval': one arrival every `value` time units.",
    )
    value: float = Field(gt=0)

    def sample_gap(self, rng: random.Random) -> float:
        """Time until the next arrival."""
        return rng.expovariate(self.value) if self.mode == "rate" else self.value


class SimulationConfig(BaseModel):
    duration: float = Field(default=500, ge=0)
    default_delay: DelayConfig = DelayConfig()
    delays: dict[str, DelayConfig] = {}
    object_counts: dict[str, dict[str, ObjectCount]] = Field(
        default={}, description="Per transition id, per object type: how many objects to bind or create."
    )
    activity_priority: list[str] = Field(
        default=[], description="Transition ids, highest priority first."
    )
    priority_probability: float = Field(
        default=0.5, ge=0, le=1,
        description="Chance that the highest-priority enabled transition is chosen instead of a random one.",
    )
    arrivals: dict[str, ArrivalConfig] = Field(default={}, description="Per place id: objects arriving over time.")
    seed: int | None = None
    start_time: datetime = Field(default_factory=lambda: datetime.now().replace(hour=0, minute=0, second=0, microsecond=0))
    time_unit: Literal["seconds", "minutes", "hours", "days"] = "minutes"

    def to_datetime(self, sim_time: float) -> datetime:
        return self.start_time + timedelta(**{self.time_unit: sim_time})


class SimulationRequest(BaseModel):
    ocpn: Ocpn
    config: SimulationConfig
