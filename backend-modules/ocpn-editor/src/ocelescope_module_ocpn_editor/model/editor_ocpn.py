from pydantic import BaseModel


class EditorPlace(BaseModel):
    id: str


class EditorTransition(BaseModel):
    id: str
    label: str | None = None


class EditorArc(BaseModel):
    nodes: tuple[str, str]
    weight: int | None = None


class EditorOCPN(BaseModel):
    places: list[EditorPlace]
    transitions: list[EditorTransition]
    arcs: list[EditorArc]
    initial_marking: dict[str, int] | None = None
    final_marking: dict[str, int] | None = None


class Ocpn(BaseModel):
    petri_net: EditorOCPN
    place_object_type: dict[str, str]
    place_in_out_mult: dict[str, tuple[dict[str, bool], dict[str, bool]]] | None = None


