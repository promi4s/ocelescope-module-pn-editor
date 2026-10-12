from pydantic import BaseModel
from ocelescope import Resource


class ImportPlace(BaseModel):
    id: str
    tokens: int = 0
    final_tokens: int = 0


class ImportTransition(BaseModel):
    id: str
    label: str | None = None


class ImportArc(BaseModel):
    source: str
    target: str
    weight: int = 1


class ImportResponse(BaseModel):
    places: list[ImportPlace]
    transitions: list[ImportTransition]
    arcs: list[ImportArc]

#Resource 

class ClassicPlace(BaseModel):
    id: str
    tokens: int = 0
    final_tokens: int = 0


class ClassicTransition(BaseModel):
    id: str
    label: str | None = None


class ClassicArc(BaseModel):
    source: str
    target: str
    weight: int = 1


class ClassicPetriNet(Resource):
    places: list[ClassicPlace]
    transitions: list[ClassicTransition]
    arcs: list[ClassicArc]