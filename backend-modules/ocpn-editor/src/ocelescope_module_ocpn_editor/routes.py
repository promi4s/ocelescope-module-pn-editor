from fastapi import APIRouter, HTTPException, UploadFile
import tempfile
import os
from r4pm.petri_net import PetriNet as PnmlPetriNet, export_pnml, import_pnml
from fastapi.responses import PlainTextResponse
from ocelescope_module_ocpn_editor.util.convert_format import (
    convert_to_OCPN,
    convert_from_OCPN,
    convert_to_pnet_resource,
)
from ocelescope_module_ocpn_editor.model.editor_ocpn import (
    OcpnExportRequest,
    OcpnImportResponse,
)
from ocelescope import PetriNet
from ocelescope_module_ocpn_editor.util.convert_format import convert_from_pnml
from ocelescope_module_ocpn_editor.model.editor_pn import (
    ImportResponse,
    ClassicPetriNet,
)
from ocelescope_backend.app.dependencies import ApiOcel, ApiSession
from typing import cast

router = APIRouter()


@router.get("/{ocel_id}/objects/types", operation_id="objectTypes")
def get_object_types(ocel: ApiOcel) -> list[str]:
    return ocel.objects.types


@router.get("/{ocel_id}/events/activities", operation_id="eventActivities")
def get_event_activities(ocel: ApiOcel) -> list[str]:
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
        export_pnml(cast(PnmlPetriNet, net), tmp_path)
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
def save_to_session_classic(session: ApiSession, pnet: dict, name: str):
    resource_pnet = convert_to_pnet_resource(pnet)
    session.add_resource(resource_pnet, name=name)
    print(session.list_resources())


# ============================================

#           Object-Centric Petri Net

# ============================================


# Export/Import


@router.post("/ocpn/export/ocelescope", operation_id="exportOCPN")
def export_ocpn(ocpn: OcpnExportRequest) -> PlainTextResponse:
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
async def import_ocpn(file: UploadFile) -> OcpnImportResponse:
    input = await file.read()
    pnet = PetriNet.model_validate_json(input)
    return convert_from_OCPN(pnet)


# Load/Save to session


@router.post("/ocpn/export/session", operation_id="saveSession")
def save_to_session(session: ApiSession, ocpn: OcpnExportRequest, name: str):
    pnet = convert_to_OCPN(ocpn)
    session.add_resource(pnet, name=name)


@router.post("/ocpn/import/session", operation_id="loadSession")
async def load_from_session(
    session: ApiSession, resource_id: str | None = None
) -> OcpnImportResponse:
    if resource_id is None:
        raise HTTPException(status_code=400, detail="resource_id is required")
    petri_net = session.load_resource(resource_id, PetriNet)
    return convert_from_OCPN(petri_net)
