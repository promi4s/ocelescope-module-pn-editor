"""Runs a simulation and turns the recorded firings into the result (event table and OCEL 2.0)."""
import json
import time
from collections.abc import Iterator
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.ocel_reporter import OCELReporter
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulatedEvent, SimulationResult
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.build import build_simulation


def _is_internal(row: dict) -> bool:
    """Object arrivals are bookkeeping, not process events."""
    return getattr(row["activity"], "internal", False)


class SimulationRun:
    """
    One simulation run, fired step by step so its progress can be reported while it runs.
    Building the model raises ValueError for nets that cannot be simulated.
    """

    def __init__(self, ocpn: Ocpn, config: SimulationConfig | None = None):
        self.config = config or SimulationConfig()
        self.model = build_simulation(ocpn, self.config)
        self.reporter = OCELReporter(self.model, to_datetime=self.config.to_datetime)
        self.event_count = 0  # recorded events so far, without internal ones

    @property
    def clock(self) -> float:
        return float(self.model.clock)

    def steps(self) -> Iterator[None]:
        """Fire the model, yielding after every firing."""
        for timed_binding in self.model.steps(self.config.duration):
            row = self.reporter.callback(timed_binding)
            if not _is_internal(row):
                self.event_count += 1
            yield

    def _to_event(self, row: dict) -> SimulatedEvent:
        return SimulatedEvent(
            id=str(row["event_id"]),
            activity=str(row["activity"]),
            timestamp=self.config.to_datetime(float(row["timestamp"])),
            silent=row["activity"].silent,
            objects={
                object_type: [f"{object_type}-{oid}" for oid in dict.fromkeys(row[object_type])]
                for object_type in self.reporter.object_types
                if row[object_type]
            },
        )

    def result(self) -> SimulationResult:
        rows = [row for row in self.reporter.rows if not _is_internal(row)]
        events = [self._to_event(row) for row in rows]
        # silent transitions appear in the event table, but not in the OCEL
        self.reporter.rows = [row for row in rows if not row["activity"].silent]
        return SimulationResult(
            events=events,
            final_marking={p.get_id(): len(p.marking) for p in self.model.places if isinstance(p, OCPNVar)},
            end_time=self.config.to_datetime(self.clock),
            ocel=self.reporter.to_ocel20(),
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
