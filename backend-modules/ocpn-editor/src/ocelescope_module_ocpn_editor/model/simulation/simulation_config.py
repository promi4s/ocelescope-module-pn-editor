import random
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


class SimulationRequest(BaseModel):
    ocpn: Ocpn
    config: SimulationConfig
