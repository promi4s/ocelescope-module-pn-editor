"""
The simulation loop, following qel_simulation's Simulation and ExecutionQueue (without quantities):

- A firing has three points in time:  enabled --delay--> start --duration--> end.
  * *Delay*: when a transition becomes enabled, a delay is drawn; it can only start once it has stayed enabled that
    long. If it gets disabled meanwhile (another transition took the objects), the delay is dropped and drawn anew
    the next time it is enabled. After every start the delay is drawn again, so a transition with a delay starts at
    most once per delay (one firing at a time waits, like a single server).
  * The event *start* removes the bound objects from the input places and creates the objects of output-only types.
  * The event *end*, after the drawn duration, puts all of them into the output places.
  Only ended events are logged, with their start time (and the end time as an attribute).
- A time-ordered queue holds event ends and object arrivals; the clock jumps to the next queued time or the next
  elapsed delay once nothing more can start at the current time.
- Choosing what starts: among the transitions with an enabled binding whose delay has elapsed, one is drawn at random,
  weighted by the transitions' routing weights; then one of its bindings at random. The weights only matter where
  transitions compete for the same objects, since everything else that is enabled starts at the same time anyway.

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
        self._queue: list[tuple] = []  # (time, sequence, kind, payload); sequence keeps insertion order on ties
        self._sequence = itertools.count()
        self._firing_ids = itertools.count(1)
        self._ready_at: dict[SimTransition, float] = {}  # enabled transitions -> time their delay has elapsed
        self._running: dict[SimTransition, int] = {}  # transition -> its events that started but did not end

    # ---------------------------------------------------------------- objects

    def new_object(self, object_type: str) -> dict:
        """A new object with the initial values of its type's attributes."""
        obj = self.factory.create(object_type)
        obj["created_at"] = self.clock
        obj["attributes"] = {a.name: a.sample(self.rng) for a in self.config.object_attributes.get(object_type, [])}
        obj["initial_attributes"] = dict(obj["attributes"])
        obj["attribute_changes"] = []  # (time, attribute, value) after creation, for the log
        self.objects.append(obj)
        return obj

    def _update_attributes(self, transition: SimTransition, objects_by_type: dict[str, list[dict]]):
        for update in transition.updates:
            for obj in objects_by_type.get(update.object_type, []):
                value = update.apply(obj["attributes"].get(update.attribute), self.rng)
                obj["attributes"][update.attribute] = value
                obj["attribute_changes"].append((self.clock, update.attribute, value))

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
            if self._busy(transition):
                continue  # every server is taken: the objects wait in the input places
            bindings = enabled_bindings(transition, self.rng, limit=1)
            if bindings:
                enabled[transition] = bindings[0]
        return enabled

    def _busy(self, transition: SimTransition) -> bool:
        return transition.capacity is not None and self._running.get(transition, 0) >= transition.capacity

    def _ready(self, enabled: dict[SimTransition, Binding]) -> dict[SimTransition, Binding]:
        """
        Updates the delays and returns the enabled transitions whose delay has elapsed: newly enabled transitions
        draw their delay, disabled ones drop it.
        """
        for transition in list(self._ready_at):
            if transition not in enabled:
                del self._ready_at[transition]
        for transition in enabled:
            if transition not in self._ready_at:
                self._ready_at[transition] = self.clock + transition.delay.sample(self.rng)
        return {t: b for t, b in enabled.items() if self._ready_at[t] <= self.clock}

    def _choose(self, enabled: dict[SimTransition, Binding]) -> tuple[SimTransition, Binding]:
        # weighted by routing weight: in a conflict, weights 7 and 3 give a 70/30 split
        candidates = list(enabled)
        transition = self.rng.choices(candidates, weights=[t.weight for t in candidates])[0]
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

        if transition.updates:
            objects_by_type: dict[str, list[dict]] = {}
            for group in (binding, created):
                for object_type, objects in group.items():
                    objects_by_type.setdefault(object_type, []).extend(objects)
            self._update_attributes(transition, objects_by_type)

        duration = transition.duration.sample(self.rng)
        firing = Firing(next(self._firing_ids), transition, self.clock, self.clock + duration, binding, created)
        self._schedule(firing.end, "end", firing)
        self._running[transition] = self._running.get(transition, 0) + 1
        return firing

    def _end(self, firing: Firing):
        self._running[firing.transition] -= 1
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
            ready = self._ready(self._enabled())
            if ready:
                transition, binding = self._choose(ready)
                self._start(transition, binding)
                del self._ready_at[transition]  # the next firing waits for a new delay
                starts_at_moment += 1
                if starts_at_moment > MAX_STARTS_PER_MOMENT:
                    raise ValueError(
                        f"More than {MAX_STARTS_PER_MOMENT} events started at the same time; the net probably has a "
                        "loop of transitions without delay and duration."
                    )
                continue
            times = ([self._queue[0][0]] if self._queue else []) + list(self._ready_at.values())
            if not times:
                return  # nothing running, waiting or scheduled
            next_time = min(times)
            if next_time > duration:
                self.clock = duration
                return
            self.clock = next_time
            starts_at_moment = 0

    @property
    def running(self) -> int:
        """Events that started but did not end before the run stopped."""
        return sum(1 for item in self._queue if item[2] == "end")
