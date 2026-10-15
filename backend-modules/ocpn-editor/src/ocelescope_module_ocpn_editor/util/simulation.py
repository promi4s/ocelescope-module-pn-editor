from simpn.simulator import SimProblem, SimToken
from ocelescope_module_ocpn_editor.model.simulation.simulation_ocpn import OCPNVar, OCPNEvent
from ocelescope_module_ocpn_editor.model.simulation.ocel_reporter import OCELReporter
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn


def run_simulation_on_ocpn(ocpn: Ocpn):
    model = SimProblem() 