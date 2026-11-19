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


# ObjectCount and ArrivalConfig follow the binding object counts and object creation frequencies of qel_simulation (https://github.com/ninagraves/qel_simulation).


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
    """New objects arriving in a place during the simulation, one at a time; the first arrival is at the start."""
    mode: Literal["fixed", "exponential"] = Field(
        default="exponential",
        description=(
            "Distribution of the time between two arrivals, with (mean) `value` time units: 'fixed' always `value`, "
            "'exponential' exponentially distributed (a Poisson process)."
        ),
    )
    value: float = Field(gt=0, description="(Mean) time between two arrivals, in time units.")

    def sample_gap(self, rng: random.Random) -> float:
        """Time until the next arrival."""
        if self.mode == "exponential":
            return rng.expovariate(1 / self.value)
        return self.value


# Object attributes, guards and attribute updates follow qel_simulation's object attributes (object_types_attributes,
# initial_attributes), object guards and InstructionObjectAttributeUpdate, as settings instead of Python code.

AttributeValue = bool | int | float | str
AttributeType = Literal["number", "text", "boolean"]


class AttributeOption(BaseModel):
    """One possible value of an attribute, drawn with probability proportional to its weight."""
    value: AttributeValue
    weight: float = Field(default=1, gt=0)


ValueSource = Literal["fixed", "choice", "uniform"]
_SOURCE_DESCRIPTION = (
    "'fixed': `value`. 'choice': one of `options`, by weight. 'uniform': between `minimum` and `maximum` (numbers)."
)


def _draw(
    source: ValueSource,
    value: AttributeValue | None,
    options: list[AttributeOption],
    minimum: float,
    maximum: float,
    integer: bool,
    rng: random.Random,
) -> AttributeValue | None:
    """A value as `source` says: fixed, one of the weighted options, or uniformly between minimum and maximum."""
    if source == "choice":
        return rng.choices([o.value for o in options], weights=[o.weight for o in options])[0]
    if source == "uniform":
        if integer:
            return rng.randint(int(minimum), int(maximum))
        return rng.uniform(minimum, maximum)
    return value


def _check_source(label: str, source: ValueSource, options: list[AttributeOption], minimum: float, maximum: float):
    if source == "uniform" and maximum < minimum:
        raise ValueError(f"{label}: maximum must not be smaller than minimum")
    if source == "choice" and not options:
        raise ValueError(f"{label}: add at least one option")


class ObjectAttributeConfig(BaseModel):
    """An attribute of an object type and how its value is set when an object is created."""
    name: str = Field(min_length=1)
    type: AttributeType = "text"
    initial: ValueSource = Field(default="fixed", description=_SOURCE_DESCRIPTION)
    value: AttributeValue | None = None
    options: list[AttributeOption] = []
    minimum: float = 0
    maximum: float = 1
    integer: bool = Field(default=False, description="'uniform': draw whole numbers.")

    @model_validator(mode="after")
    def _check(self):
        if self.initial == "uniform" and self.type != "number":
            raise ValueError(f"attribute '{self.name}': a uniform initial value needs a number attribute")
        _check_source(f"attribute '{self.name}'", self.initial, self.options, self.minimum, self.maximum)
        return self

    def sample(self, rng: random.Random) -> AttributeValue | None:
        return _draw(self.initial, self.value, self.options, self.minimum, self.maximum, self.integer, rng)


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
    """
    Sets (or, for numbers, adds to) an attribute of the bound and created objects of one type when an event starts.
    The new value (or the amount to add) can be fixed or random; random values are drawn for every object.
    """
    object_type: str
    attribute: str
    operation: Literal["set", "add"] = "set"
    source: ValueSource = Field(default="fixed", description=_SOURCE_DESCRIPTION)
    value: AttributeValue | None = None
    options: list[AttributeOption] = []
    minimum: float = 0
    maximum: float = 1

    @model_validator(mode="after")
    def _check(self):
        label = f"update of '{self.attribute}'"
        if self.source == "fixed" and self.value is None:
            raise ValueError(f"{label}: a value is required")
        _check_source(label, self.source, self.options, self.minimum, self.maximum)
        return self

    def apply(self, current: AttributeValue | None, rng: random.Random) -> AttributeValue:
        # random ranges draw whole numbers, as integer attributes are entered in the editor
        new = _draw(self.source, self.value, self.options, self.minimum, self.maximum, True, rng)
        if self.operation == "add":
            if isinstance(current, bool) or not isinstance(current, (int, float)):
                current = 0
            if isinstance(new, bool) or not isinstance(new, (int, float)):
                raise ValueError(f"'add' to attribute '{self.attribute}' needs a number")
            return current + new
        return new


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
    weights: dict[str, float] = Field(
        default={},
        description="Per transition id: routing weight (default 1). When enabled transitions compete for the same "
        "objects, one is chosen with probability proportional to its weight.",
    )
    capacities: dict[str, int] = Field(
        default={},
        description="Per transition id: how many of its events can run at the same time (parallel servers). "
        "Unset means unlimited.",
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
