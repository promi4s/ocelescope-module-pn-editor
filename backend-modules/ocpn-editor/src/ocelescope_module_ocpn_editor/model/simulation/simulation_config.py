import random
from datetime import datetime, timedelta
from typing import Literal
from pydantic import BaseModel, Field
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


class DelayConfig(BaseModel):
    """General delay for all transitions"""
    distribution: Literal["fixed", "exponential"] = "fixed"
    value: float = Field(default=1, ge=0)

    def sample(self, rng: random.Random) -> float:
        if self.distribution == "exponential":
            return rng.expovariate(1 / self.value) if self.value > 0 else 0.0
        return self.value


class SimulationConfig(BaseModel):
    duration: float = Field(default=500, ge=0)
    default_delay: DelayConfig = DelayConfig()
    delays: dict[str, DelayConfig] = {}
    seed: int | None = None
    start_time: datetime = Field(default_factory=lambda: datetime.now().replace(hour=0, minute=0, second=0, microsecond=0))
    time_unit: Literal["seconds", "minutes", "hours", "days"] = "minutes"

    def to_datetime(self, sim_time: float) -> datetime:
        return self.start_time + timedelta(**{self.time_unit: sim_time})


class SimulationRequest(BaseModel):
    ocpn: Ocpn
    config: SimulationConfig
