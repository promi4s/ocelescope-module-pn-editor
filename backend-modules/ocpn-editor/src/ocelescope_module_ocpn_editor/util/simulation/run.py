"""Runs a simulation and turns the recorded firings into the result (event table and OCEL 2.0)."""
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar
from ocelescope_module_ocpn_editor.model.simulation.ocel_reporter import OCELReporter
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulatedEvent, SimulationResult
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import SimulationConfig
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope_module_ocpn_editor.util.simulation.build import build_simulation


def run_simulation(ocpn: Ocpn, config: SimulationConfig | None = None) -> SimulationResult:
    config = config or SimulationConfig()
    model = build_simulation(ocpn, config)
    reporter = OCELReporter(model, to_datetime=config.to_datetime)
    model.simulate(config.duration, reporter)

    # object arrivals are bookkeeping, not process events
    reporter.ocel_df = reporter.ocel_df[~reporter.ocel_df["activity"].map(lambda event: getattr(event, "internal", False))]

    events = [
        SimulatedEvent(
            id=str(row["event_id"]),
            activity=str(row["activity"]),
            timestamp=config.to_datetime(float(row["timestamp"])),
            silent=row["activity"].silent,
            objects={
                object_type: [f"{object_type}-{oid}" for oid in dict.fromkeys(row[object_type])]
                for object_type in reporter.object_types
                if row[object_type]
            },
        )
        for _, row in reporter.ocel_df.iterrows()
    ]

    reporter.ocel_df = reporter.ocel_df[~reporter.ocel_df["activity"].map(lambda event: event.silent)]

    return SimulationResult(
        events=events,
        final_marking={p.get_id(): len(p.marking) for p in model.places if isinstance(p, OCPNVar)},
        end_time=config.to_datetime(float(model.clock)),
        ocel=reporter.to_ocel20(),
    )
