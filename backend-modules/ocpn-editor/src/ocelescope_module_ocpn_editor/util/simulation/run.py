"""Runs a simulation and turns the ended firings into the result (event table and OCEL 2.0)."""
import json
import time
from collections.abc import Iterator
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulationResult
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.build import build_simulation
from ocelescope_module_ocpn_editor.util.simulation.engine import Firing
from ocelescope_module_ocpn_editor.util.simulation.log import event_table, ocel20


class SimulationRun:
    """
    One simulation run, fired step by step so its progress can be reported while it runs.
    Building the engine raises ValueError for nets that cannot be simulated.
    """

    def __init__(self, ocpn: Ocpn, config: SimulationConfig | None = None):
        self.config = config or SimulationConfig()
        self.engine = build_simulation(ocpn, self.config)
        self.firings: list[Firing] = []  # ended firings
        self.event_count = 0  # ended visible events so far

    @property
    def clock(self) -> float:
        return float(self.engine.clock)

    def steps(self) -> Iterator[None]:
        """Run the engine, yielding after every ended event."""
        for firing in self.engine.steps(self.config.duration):
            self.firings.append(firing)
            if not firing.transition.silent:
                self.event_count += 1
            yield

    def result(self) -> SimulationResult:
        firings = sorted(self.firings, key=lambda firing: (firing.start, firing.id))  # events end out of start order
        to_datetime = self.config.to_datetime
        return SimulationResult(
            events=event_table(firings, to_datetime),
            final_marking={place.id: len(place.marking) for place in self.engine.net.places.values()},
            end_time=to_datetime(self.clock),
            ocel=ocel20(firings, self.engine.objects, to_datetime),
        )


def stream_simulation(run: SimulationRun, interval_seconds: float = 0.1) -> Iterator[str]:
    """
    Newline-delimited JSON messages for a run:
      {"type": "progress", "clock": t, "duration": d, "event_count": n}  at most every `interval_seconds`
      {"type": "done", "result": SimulationResult}                       once the run has finished
      {"type": "error", "detail": "..."}                                  if the run failed midway
    """

    def message(**data) -> str:
        return json.dumps(data) + "\n"

    def progress() -> str:
        return message(type="progress", clock=run.clock, duration=run.config.duration, event_count=run.event_count)

    last_report = time.monotonic()
    try:
        yield progress()
        for _ in run.steps():
            now = time.monotonic()
            if now - last_report >= interval_seconds:
                yield progress()
                last_report = now
        yield progress()
        yield message(type="done", result=run.result().model_dump(mode="json"))
    except Exception as e:  # the HTTP status is already sent, so errors travel in the stream
        yield message(type="error", detail=str(e) or type(e).__name__)
