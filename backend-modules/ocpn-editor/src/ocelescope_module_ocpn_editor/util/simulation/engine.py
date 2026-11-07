"""Corrections to SimPN's run loop and binding search, and the choice of which binding fires."""
import bisect
import itertools
import random
from simpn.simulator import SimProblem


def new_combinations(previous: list[int], available: list[int]):
    """
    Token index combinations (one token per input place) that are possible with `available` tokens per place but
    were not yet possible with `previous`, i.e. that use at least one newly available token. Place j is the first
    place with a new token: earlier places use old tokens only, later places any token. So every combination is
    produced exactly once over all moments.
    """
    if any(n == 0 for n in available):
        return
    for j in range(len(available)):
        if previous[j] == available[j]:
            continue
        ranges = (
            [range(previous[k]) for k in range(j)]
            + [range(previous[j], available[j])]
            + [range(available[k]) for k in range(j + 1, len(available))]
        )
        yield from itertools.product(*ranges)


class BoundedSimProblem(SimProblem):
    """
    SimProblem with two corrections to SimPN:

    - The run ends at the duration. SimPN checks the duration before `bindings()` moves the clock to the next
      possible event, so it would still fire one event after the end (e.g. one more object arrival).
    - Bindings are searched iteratively and at the earliest possible moment. SimPN's search is recursive (one call
      per search level), which exceeds Python's recursion limit when a guard rejects many combinations, e.g. orders
      waiting for their items on a variable arc. When nothing can fire now, it also returns the combination with the
      smallest token indices instead of the earliest one, so one waiting order can delay others.
      Here the token times are walked in ascending order and every combination is checked once, at the first moment
      all of its tokens are available. Requires every place to be sorted by time, which holds for OCPNVar places,
      their TimedSimVarQueue and the arrival clocks.
    """

    def event_bindings(self, event):
        if not event.incoming:
            return super().event_bindings(event)
        places = event.incoming
        markings = [list(place.marking) for place in places]  # TimedSimVarQueue rebuilds its marking per access
        if any(not marking for marking in markings):
            return None
        token_times = [[token.time for token in marking] for marking in markings]
        moments = sorted({self.clock, *(t for times in token_times for t in times if t > self.clock)})

        previous = [0] * len(places)  # tokens per place that were already available at the previous moment
        for moment in moments:
            available = [bisect.bisect_right(times, moment) for times in token_times]
            for combination in new_combinations(previous, available):
                values = [markings[j][i].value for j, i in enumerate(combination)]
                if event.guard is None or SimProblem.evaluate_guard(values, event):
                    binding = [(place, markings[j][i]) for j, (place, i) in enumerate(zip(places, combination))]
                    return binding, max(token.time for _, token in binding)
            previous = available
        return None

    def simulate(self, duration, reporter=None):
        reporters = [] if reporter is None else reporter if isinstance(reporter, list) else [reporter]
        while self.clock <= duration:
            bindings = self.bindings()
            if not bindings:
                break
            if self.clock > duration:  # the next event would happen after the end
                self.clock = duration
                break
            timed_binding = self.binding_priority(bindings)
            self.fire(timed_binding)
            for r in reporters:
                r.callback(timed_binding)


def choose_binding(rng: random.Random, priority: list, priority_probability: float):
    """
    Binding priority for SimPN: if a transition from the priority list is enabled, it is
    chosen with `priority_probability` (the highest enabled one); otherwise a random enabled transition.
    Then one of that transition's bindings at random.
    """
    def choose(bindings):
        by_event: dict = {}
        for binding in bindings:
            by_event.setdefault(binding[2], []).append(binding)
        prioritized = [event for event in priority if event in by_event]
        if prioritized and rng.random() < priority_probability:
            event = prioritized[0]
        else:
            event = rng.choice(list(by_event))
        return rng.choice(by_event[event])

    return choose
