from fastapi import APIRouter, HTTPException, UploadFile
import tempfile
import os
from r4pm.petri_net import export_pnml, import_pnml
from fastapi.responses import PlainTextResponse
from ocelescope_module_ocpn_editor.util.convert_format import convert_to_OCPN, convert_from_OCPN, convert_to_pnet_resource
from ocelescope_module_ocpn_editor.model.editor.editor_ocpn import Ocpn
from ocelescope import PetriNet
from ocelescope_module_ocpn_editor.util.convert_format import convert_from_pnml
from ocelescope_module_ocpn_editor.model.editor.editor_pn import ImportResponse, ClassicPetriNet
from ocelescope_backend.app.dependencies import ApiOcel, ApiSession
from ocelescope_backend.app.internal.model.resource import ResourceStore
from typing import cast
from ocelescope_module_ocpn_editor.util.simulation import run_simulation
from ocelescope_module_ocpn_editor.model.simulation.simulation_result import SimulationResult
from ocelescope_module_ocpn_editor.model.simulation.simulation_config import SimulationRequest

router = APIRouter()

@router.get("/{ocel_id}/objects/types", operation_id="objectTypes")
def get_object_types(ocel:ApiOcel) -> list[str]:
    return ocel.objects.types


@router.get("/{ocel_id}/events/activities", operation_id="eventActivities")
def get_event_activities(ocel:ApiOcel) -> list[str]:
    return ocel.events.activities


# ============================================

#              Classic Petri-Net

# ============================================


# Export/Import

@router.post("/petri-net/export/pnml", operation_id="exportPetriNetPnml")
def export_petri_net_pnml(net: dict) -> PlainTextResponse:
    with tempfile.NamedTemporaryFile(suffix=".pnml", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        export_pnml(net, tmp_path)
        with open(tmp_path, "r", encoding="utf-8") as f:
            pnml_text = f.read()
    finally:
        os.unlink(tmp_path)

    return PlainTextResponse(content=pnml_text)

@router.post("/petri-net/import/pnml", operation_id="importPetriNetPnml")
async def import_petri_net_pnml(file: UploadFile) -> ImportResponse:
    input = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".pnml", delete=False) as tmp:
        tmp.write(input)
        tmp_path = tmp.name

    try:
        net = import_pnml(tmp_path)
    finally:
        os.unlink(tmp_path)

    return convert_from_pnml(net)

# Load/Save to Session

@router.post("/petri-net/export/session")
def save_to_session_classic(session: ApiSession, pnet: dict, name:str):
    resource_pnet = convert_to_pnet_resource(pnet)
    session.add_resource(ResourceStore.from_resource(resource_pnet, name=name))




# ============================================

#           Object-Centric Petri Net

# ============================================


# Export/Import

@router.post("/ocpn/export/ocelescope", operation_id="exportOCPN")
def export_ocpn(ocpn: Ocpn) -> PlainTextResponse:
    pnet = convert_to_OCPN(ocpn)

    with tempfile.NamedTemporaryFile(suffix=".ocelescope", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        written_path = pnet.write(tmp_path)
        with open(written_path, "r", encoding="utf-8") as f:
            content = f.read()
    finally:
        os.unlink(written_path)

    return PlainTextResponse(content=content)


@router.post("/ocpn/import/ocelescope", operation_id="importOCPN")
async def import_ocpn(file: UploadFile) -> Ocpn:
    input = await file.read()
    pnet = PetriNet.model_validate_json(input)
    return convert_from_OCPN(pnet)


# Load/Save to session


@router.post("/ocpn/export/session", operation_id="saveSession")
def save_to_session(session: ApiSession, ocpn: Ocpn, name:str):
    pnet = convert_to_OCPN(ocpn)
    session.add_resource(ResourceStore.from_resource(pnet, name=name))


@router.post("/ocpn/import/session", operation_id="loadSession")
async def load_from_session(session:ApiSession, resource_id: str | None = None) -> Ocpn:
    resource_store = cast(PetriNet,session.get_resource(resource_id))
    petri_net = PetriNet(**resource_store.data)
    return convert_from_OCPN(petri_net)


# ============================================

#                  Simulation

# ============================================


@router.post("/simulation", operation_id="runSimulation")
def simulate_ocpn(request: SimulationRequest) -> SimulationResult:
    return run_simulation(request.ocpn, request.config)