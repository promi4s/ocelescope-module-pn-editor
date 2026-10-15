from fastapi import FastAPI
from ocelescope_backend.app.modules import Module, ModuleMeta
from packaging.version import Version
from ocelescope_module_ocpn_editor.routes import router
from ocelescope_module_ocpn_editor.model.editor.editor_pn import ClassicPetriNet


class OCPNEditor(Module):
    meta = ModuleMeta(key="ocpnEditor", version=Version("1.0"))
    resources = [ClassicPetriNet]
    @classmethod
    def create_app(cls) -> FastAPI:
        app = FastAPI(title="OCPN Editor", version=str(cls.meta.version))
        app.include_router(router)
        return app
