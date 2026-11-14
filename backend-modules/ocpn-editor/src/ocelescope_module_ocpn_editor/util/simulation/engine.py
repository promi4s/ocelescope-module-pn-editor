"""
The simulation loop, following qel_simulation's Simulation and ExecutionQueue (without quantities):

- A transition fires in two phases. The event *start* removes the bound objects from the input places and creates
  the objects of output-only types; the event *end*, after the drawn duration, puts all of them into the output
  places. Only ended events are logged, with their start time.
- A time-ordered queue holds event ends and object arrivals; the clock jumps to the next queued time once nothing
  more can start at the current time.
- Choosing what starts: among the transitions with an enabled binding, the highest-priority one is taken with
  `priority_probability`, otherwise one at random; then one of its bindings at random.

Unlike qel_simulation, which starts at most one event per queue time, every binding that is enabled at the current
time is started before the clock moves on, so independent cases run in parallel.
"""
import heapq
import itertools
import random
from collections.abc import Iterator
from dataclasses import dataclass, field
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import ArrivalConfig, SimulationConfig
from ocelescope_module_ocpn_editor.util.simulation.bindings import enabled_bindings
from ocelescope_module_ocpn_editor.util.simulation.model import Binding, SimNet, SimPlace, SimTransition
from ocelescope_module_ocpn_editor.util.simulation.objects import ObjectIdCounter, link

# Starts at one point in time before the run is considered stuck in a loop of zero-duration transitions.
MAX_STARTS_PER_MOMENT = 10_000


@dataclass(eq=False)
class Firing:
    """One event: a transition fired with a binding."""
    id: int
    transition: SimTransition
    start: float
    end: float
    binding: Binding  # consumed objects per input type
    created: dict[str, list[dict]] = field(default_factory=dict)  # new objects per output-only type


class Engine:
    def __init__(self, net: SimNet, config: SimulationConfig, rng: random.Random, factory: ObjectIdCounter):
        self.net = net
        self.config = config
        self.rng = rng
        self.factory = factory
        self.clock = 0.0
        self.objects: list[dict] = []  # every object of the run, for the log
        self.priority = [net.transitions[t] for t in config.activity_priority if t in net.transitions]
        self._queue: list[tuple] = []  # (time, sequence, kind, payload); sequence keeps insertion order on ties
        self._sequence = itertools.count()
        self._firing_ids = itertools.count(1)

    # ---------------------------------------------------------------- objects

    def new_object(self, object_type: str) -> dict:
        obj = self.factory.create(object_type)
        self.objects.append(obj)
        return obj

    def put_initial(self, place: SimPlace, number: int):
        for _ in range(number):
            place.add(self.new_object(place.object_type))

    def add_arrivals(self, place: SimPlace, arrival: ArrivalConfig):
        """New objects arriving in `place`; the first one at the start of the run."""
        self._schedule(0.0, "arrival", (place, arrival))

    # ---------------------------------------------------------------- queue

    def _schedule(self, time: float, kind: str, payload):
        heapq.heappush(self._queue, (time, next(self._sequence), kind, payload))

    def _process_due(self) -> Iterator[Firing]:
        """Execute all queued items due at the current time, yielding the firings that ended."""
        while self._queue and self._queue[0][0] <= self.clock:
            _, _, kind, payload = heapq.heappop(self._queue)
            if kind == "end":
                self._end(payload)
                yield payload
            else:
                place, arrival = payload
                place.add(self.new_object(place.object_type))
                self._schedule(self.clock + arrival.sample_gap(self.rng), "arrival", payload)

    # ---------------------------------------------------------------- firing

    def _enabled(self) -> dict[SimTransition, Binding]:
        """
        One random binding per enabled transition. qel_simulation draws from all enabled bindings; the search here
        visits candidates in random order, so its first binding is already a random one.
        """
        enabled = {}
        for transition in self.net.transitions.values():
            bindings = enabled_bindings(transition, self.rng, limit=1)
            if bindings:
                enabled[transition] = bindings[0]
        return enabled

    def _choose(self, enabled: dict[SimTransition, Binding]) -> tuple[SimTransition, Binding]:
        prioritized = [t for t in self.priority if t in enabled]
        if prioritized and self.rng.random() < self.config.priority_probability:
            transition = prioritized[0]
        else:
            transition = self.rng.choice(list(enabled))
        return transition, enabled[transition]

    def _created_count(self, transition: SimTransition, object_type: str) -> int:
        count = transition.counts.get(object_type)
        if count is None or object_type not in transition.variable_output_types:
            return 1  # a normal arc carries exactly one object
        if count.exact is not None:
            return count.exact
        return self.rng.randint(count.minimum, count.maximum or count.minimum)

    def _start(self, transition: SimTransition, binding: Binding) -> Firing:
        for object_type, objects in binding.items():
            for place in transition.input_places[object_type]:
                for obj in objects:
                    place.remove(obj)

        created = {
            object_type: [self.new_object(object_type) for _ in range(self._created_count(transition, object_type))]
            for object_type in transition.created_types
        }
        # new objects belong to the objects they were created with
        consumed = [obj for objects in binding.values() for obj in objects]
        new = [obj for objects in created.values() for obj in objects]
        for i, obj in enumerate(new):
            for other in consumed + new[i + 1:]:
                if other["object_type"] != obj["object_type"]:
                    link(obj, other)

        duration = transition.delay.sample(self.rng)
        firing = Firing(next(self._firing_ids), transition, self.clock, self.clock + duration, binding, created)
        self._schedule(firing.end, "end", firing)
        return firing

    def _end(self, firing: Firing):
        for objects_by_type in (firing.binding, firing.created):
            for object_type, objects in objects_by_type.items():
                for place in firing.transition.output_places.get(object_type, []):
                    for obj in objects:
                        place.add(obj)

    # ---------------------------------------------------------------- run

    def steps(self, duration: float) -> Iterator[Firing]:
        """Run until `duration` or until nothing can happen anymore, yielding every firing when it ends."""
        starts_at_moment = 0
        while True:
            yield from self._process_due()
            enabled = self._enabled()
            if enabled:
                self._start(*self._choose(enabled))
                starts_at_moment += 1
                if starts_at_moment > MAX_STARTS_PER_MOMENT:
                    raise ValueError(
                        f"More than {MAX_STARTS_PER_MOMENT} events started at the same time; the net probably has a "
                        "loop of transitions without delay."
                    )
                continue
            if not self._queue:
                return  # nothing running and nothing scheduled
            next_time = self._queue[0][0]
            if next_time > duration:
                self.clock = duration
                return
            self.clock = next_time
            starts_at_moment = 0

    @property
    def running(self) -> int:
        """Events that started but did not end before the run stopped."""
        return sum(1 for item in self._queue if item[2] == "end")
