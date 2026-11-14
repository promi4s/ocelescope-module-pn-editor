import random
from datetime import datetime, timedelta
from typing import Literal
from pydantic import BaseModel, Field, model_validator
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


class DelayConfig(BaseModel):
    """A time drawn for each firing: used for the delay and for the duration of transitions."""
    distribution: Literal["fixed", "exponential"] = "fixed"
    value: float = Field(default=1, ge=0)

    def sample(self, rng: random.Random) -> float:
        if self.distribution == "exponential":
            return rng.expovariate(1 / self.value) if self.value > 0 else 0.0
        return self.value


# ObjectCount, ArrivalConfig and the priority settings follow the binding object counts, object creation
# frequencies and activity priorities of qel_simulation (https://github.com/ninagraves/qel_simulation).


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


# Object attributes, guards and attribute updates follow qel_simulation's object attributes (object_types_attributes,
# initial_attributes), object guards and InstructionObjectAttributeUpdate, as settings instead of Python code.

AttributeValue = bool | int | float | str
AttributeType = Literal["number", "text", "boolean"]


class AttributeOption(BaseModel):
    """One possible initial value of an attribute, drawn with probability proportional to its weight."""
    value: AttributeValue
    weight: float = Field(default=1, gt=0)


class ObjectAttributeConfig(BaseModel):
    """An attribute of an object type and how its value is set when an object is created."""
    name: str = Field(min_length=1)
    type: AttributeType = "text"
    initial: Literal["fixed", "choice", "uniform"] = Field(
        default="fixed",
        description="'fixed': `value`. 'choice': one of `options`, by weight. 'uniform': between `minimum` and `maximum` (numbers).",
    )
    value: AttributeValue | None = None
    options: list[AttributeOption] = []
    minimum: float = 0
    maximum: float = 1
    integer: bool = Field(default=False, description="'uniform': draw whole numbers.")

    @model_validator(mode="after")
    def _check(self):
        if self.initial == "uniform":
            if self.type != "number":
                raise ValueError(f"attribute '{self.name}': a uniform initial value needs a number attribute")
            if self.maximum < self.minimum:
                raise ValueError(f"attribute '{self.name}': maximum must not be smaller than minimum")
        if self.initial == "choice" and not self.options:
            raise ValueError(f"attribute '{self.name}': add at least one option")
        return self

    def sample(self, rng: random.Random) -> AttributeValue | None:
        if self.initial == "choice":
            return rng.choices([o.value for o in self.options], weights=[o.weight for o in self.options])[0]
        if self.initial == "uniform":
            if self.integer:
                return rng.randint(int(self.minimum), int(self.maximum))
            return rng.uniform(self.minimum, self.maximum)
        return self.value


_COMPARE = {
    "==": lambda a, b: a == b,
    "!=": lambda a, b: a != b,
    "<": lambda a, b: a < b,
    "<=": lambda a, b: a <= b,
    ">": lambda a, b: a > b,
    ">=": lambda a, b: a >= b,
}


class AttributeCondition(BaseModel):
    """Condition on an attribute of the input objects of one type: every bound object of that type must meet it."""
    object_type: str
    attribute: str
    operator: Literal["==", "!=", "<", "<=", ">", ">="] = "=="
    value: AttributeValue

    def holds(self, obj: dict) -> bool:
        current = obj.get("attributes", {}).get(self.attribute)
        if current is None:
            return False
        try:
            return _COMPARE[self.operator](current, self.value)
        except TypeError:  # e.g. comparing text with a number
            return False


class AttributeUpdate(BaseModel):
    """Sets (or, for numbers, adds to) an attribute of the bound and created objects of one type when an event starts."""
    object_type: str
    attribute: str
    operation: Literal["set", "add"] = "set"
    value: AttributeValue

    def apply(self, current: AttributeValue | None) -> AttributeValue:
        if self.operation == "add":
            if isinstance(current, bool) or not isinstance(current, (int, float)):
                current = 0
            if isinstance(self.value, bool) or not isinstance(self.value, (int, float)):
                raise ValueError(f"'add' to attribute '{self.attribute}' needs a number")
            return current + self.value
        return self.value


class SimulationConfig(BaseModel):
    duration: float = Field(default=500, ge=0)
    # A firing: enabled --delay--> start (inputs consumed) --duration--> end (outputs produced).
    default_delay: DelayConfig = Field(
        default_factory=lambda: DelayConfig(value=0),
        description="How long a transition stays enabled before it starts. Restarts when it gets disabled.",
    )
    delays: dict[str, DelayConfig] = Field(default={}, description="Per transition id: its own delay.")
    default_duration: DelayConfig = Field(
        default_factory=DelayConfig,
        description="How long an event takes from its start to its end, when its outputs are produced.",
    )
    durations: dict[str, DelayConfig] = Field(default={}, description="Per transition id: its own duration.")
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
    object_attributes: dict[str, list[ObjectAttributeConfig]] = Field(
        default={}, description="Per object type: its attributes and their initial values."
    )
    guards: dict[str, list[AttributeCondition]] = Field(
        default={}, description="Per transition id: conditions on input object attributes; all must hold to fire."
    )
    attribute_updates: dict[str, list[AttributeUpdate]] = Field(
        default={}, description="Per transition id: attribute changes when its events start."
    )
    seed: int | None = None
    start_time: datetime = Field(default_factory=lambda: datetime.now().replace(hour=0, minute=0, second=0, microsecond=0))
    time_unit: Literal["seconds", "minutes", "hours", "days"] = "minutes"

    def to_datetime(self, sim_time: float) -> datetime:
        return self.start_time + timedelta(**{self.time_unit: sim_time})


class SimulationRequest(BaseModel):
    ocpn: Ocpn
    config: SimulationConfig
