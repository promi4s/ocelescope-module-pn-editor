"""
Simulation of object-centric Petri nets, following the simulation approach of qel_simulation
(https://github.com/ninagraves/qel_simulation) without its quantity part.

    build.py     net + settings -> engine with initial marking and arrivals
    engine.py    two-phase firing, execution queue, choice of what starts
    bindings.py  enabled bindings of a transition
    model.py     places and transitions of the simulated net
    objects.py   object ids and relations
    net.py       reading the editor net
    log.py       event table and OCEL 2.0
    run.py       running a simulation and streaming its progress
"""
from ocelescope_module_ocpn_editor.util.simulation.build import build_simulation
from ocelescope_module_ocpn_editor.util.simulation.run import SimulationRun, stream_simulation

__all__ = ["build_simulation", "stream_simulation", "SimulationRun"]
