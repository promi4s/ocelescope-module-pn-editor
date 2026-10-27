from fastapi import APIRouter, HTTPException, UploadFile
import tempfile
import os
from r4pm.petri_net import PetriNet as PnmlPetriNet, export_pnml, import_pnml
from fastapi.responses import PlainTextResponse
from ocelescope_module_ocpn_editor.util.convert_format import (
    convert_to_OCPN,
    convert_from_OCPN,
    convert_from_pnml,
    convert_ocpn_to_pnml_net,
    convert_ocpn_to_classic,
    convert_classic_to_ocpn,
)
from ocelescope_module_ocpn_editor.model.editor_ocpn import (
    OcpnExportRequest,
    OcpnImportResponse,
)
from ocelescope import PetriNet
from ocelescope_module_ocpn_editor.model.editor_pn import ClassicPetriNet
from ocelescope_backend.app.dependencies import ApiOcel, ApiSession
from typing import Literal, cast

router = APIRouter()


@router.get("/{ocel_id}/objects/types", operation_id="objectTypes")
def get_object_types(ocel: ApiOcel) -> list[str]:
    return ocel.objects.types


@router.get("/{ocel_id}/events/activities", operation_id="eventActivities")
def get_event_activities(ocel: ApiOcel) -> list[str]:
    return ocel.events.activities

@router.get("/ocpn/schemaHash", operation_id="ocpnSchemaHash")
def get_ocpn_schema_hash() -> str:
    return PetriNet.get_schema_hash()


@router.get("/petri-net/schemaHash", operation_id="classicSchemaHash")
def get_classic_schema_hash() -> str:
    return ClassicPetriNet.get_schema_hash()


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

@router.post("/ocpn/export/pnml", operation_id="exportPnml")
def export_ocpn_pnml(ocpn: OcpnExportRequest) -> PlainTextResponse:
    try:
        net = convert_ocpn_to_pnml_net(ocpn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))

    with tempfile.NamedTemporaryFile(suffix=".pnml", delete=False) as tmp:
        tmp_path = tmp.name

    try:
        export_pnml(cast(PnmlPetriNet, net), tmp_path)
        with open(tmp_path, "r", encoding="utf-8") as f:
            pnml_text = f.read()
    finally:
        os.unlink(tmp_path)

    return PlainTextResponse(content=pnml_text)


@router.post("/ocpn/import/pnml", operation_id="importPnml")
async def import_ocpn_pnml(file: UploadFile) -> OcpnImportResponse:
    input = await file.read()

    with tempfile.NamedTemporaryFile(suffix=".pnml", delete=False) as tmp:
        tmp.write(input)
        tmp_path = tmp.name

    try:
        net = import_pnml(tmp_path)
    finally:
        os.unlink(tmp_path)

    classic = convert_from_pnml(net)
    return convert_classic_to_ocpn(classic.places, classic.transitions, classic.arcs)


# Load/Save to session


@router.post("/ocpn/export/session", operation_id="saveSession")
def save_to_session(
    session: ApiSession,
    ocpn: OcpnExportRequest,
    name: str,
    format: Literal["ocpn", "classic"] = "ocpn",
):
    try:
        resource = convert_ocpn_to_classic(ocpn) if format == "classic" else convert_to_OCPN(ocpn)
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e))
    session.add_resource(resource, name=name)


@router.post("/ocpn/import/session", operation_id="loadSession")
async def load_from_session(
    session: ApiSession, resource_id: str | None = None
) -> OcpnImportResponse:
    if resource_id is None:
        raise HTTPException(status_code=400, detail="resource_id is required")
    if session.get_resource(resource_id).schema_hash == ClassicPetriNet.get_schema_hash():
        classic = session.load_resource(resource_id, ClassicPetriNet)
        return convert_classic_to_ocpn(classic.places, classic.transitions, classic.arcs)
    petri_net = session.load_resource(resource_id, PetriNet)
    return convert_from_OCPN(petri_net)
