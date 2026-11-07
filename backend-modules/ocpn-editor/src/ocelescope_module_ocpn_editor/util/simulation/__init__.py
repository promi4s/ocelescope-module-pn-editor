"""
Simulation of object-centric Petri nets on top of SimPN.

    build.py      net + settings -> SimPN model
    run.py        run the model, collect the event table and the OCEL
    engine.py     corrected run loop, binding search and binding choice
    selection.py  which objects a variable arc takes
    guard.py      whether input tokens may fire together
    behavior.py   what a firing produces and creates
    arrivals.py   objects arriving over time
    objects.py    object ids and relations
    net.py        reading the editor net
"""
# Binding object counts, activity priority and object arrivals follow qel_simulation
# (https://github.com/ninagraves/qel_simulation), reimplemented on top of SimPN.
from ocelescope_module_ocpn_editor.util.simulation.build import build_simulation
from ocelescope_module_ocpn_editor.util.simulation.run import SimulationRun, stream_simulation

__all__ = ["build_simulation", "stream_simulation", "SimulationRun"]
