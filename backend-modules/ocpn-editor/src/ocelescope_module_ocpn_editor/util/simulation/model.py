"""The net as the simulation sees it: places holding objects, transitions with their arcs grouped by object type."""
from dataclasses import dataclass, field
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import DelayConfig, ObjectCount
from ocelescope_module_ocpn_editor.util.simulation.objects import object_key

# A binding maps each input object type of a transition to the objects it consumes,
# as in the OCPN definition and qel_simulation's BindingFunction.
Binding = dict[str, list[dict]]


@dataclass(eq=False)
class SimPlace:
    id: str
    object_type: str
    # object key -> object, in arrival order
    marking: dict[tuple, dict] = field(default_factory=dict)

    def add(self, obj: dict):
        self.marking[object_key(obj)] = obj

    def remove(self, obj: dict):
        del self.marking[object_key(obj)]


@dataclass(eq=False)
class SimTransition:
    id: str
    name: str  # unique name, used as activity in the log
    silent: bool
    delay: DelayConfig
    input_places: dict[str, list[SimPlace]]  # object type -> input places of that type
    output_places: dict[str, list[SimPlace]]  # object type -> output places of that type
    variable_input_types: set[str]  # input types with at least one variable arc
    variable_output_types: set[str]  # output types with at least one variable arc
    counts: dict[str, ObjectCount]  # object type -> how many objects to bind or create

    @property
    def created_types(self) -> list[str]:
        """Output types without an input of that type: firing creates new objects of them."""
        return [t for t in self.output_places if t not in self.input_places]


@dataclass(eq=False)
class SimNet:
    places: dict[str, SimPlace]
    transitions: dict[str, SimTransition]
