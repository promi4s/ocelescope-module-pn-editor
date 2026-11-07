"""New objects arriving in places during the simulation."""
import random
from simpn.simulator import SimProblem, SimToken
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import ArrivalConfig
from ocelescope_module_ocpn_editor.util.simulation.objects import ObjectIdCounter


def add_arrivals(model: SimProblem, place: OCPNVar, arrival: ArrivalConfig, factory: ObjectIdCounter, rng: random.Random):
    """
    New objects arriving in `place` over time: a hidden clock
    token fires a generator event that puts one new object into the place and returns the clock after the next gap.
    The first object arrives at the start of the simulation. Generator events are not logged.
    """
    clock = model.add_var(f"__arrivals_{place.get_id()}")
    clock.put("tick")

    def arrive(tick):
        return [SimToken(tick, delay=arrival.sample_gap(rng)), SimToken(factory.create(place.object_type))]

    event = model.add_event([clock], [clock, place], arrive, name=f"__arrive_{place.get_id()}")
    event.silent = True
    event.internal = True
