"""Request/response contracts. Unknown fields are rejected, so raw HTML or page content cannot be sent by accident."""
from typing import Annotated, Literal, Optional

from pydantic import BaseModel, ConfigDict, Field, StringConstraints, field_validator

Short = Annotated[str, StringConstraints(max_length=100)]
Impact = Literal["critical", "serious", "moderate", "minor"]


class Strict(BaseModel):
    model_config = ConfigDict(extra="forbid")


class WcagCriterionIn(Strict):
    criterion: Annotated[str, StringConstraints(pattern=r"^\d\.\d{1,2}\.\d{1,2}$")]
    level: Optional[Literal["A", "AA", "AAA"]] = None


class NodeIn(Strict):
    tag: Optional[Annotated[str, StringConstraints(max_length=30)]] = None
    role: Optional[Annotated[str, StringConstraints(max_length=40)]] = None
    is_interactive: bool = False
    landmark: Optional[Annotated[str, StringConstraints(max_length=30)]] = None


class FindingIn(Strict):
    rule_id: Annotated[str, StringConstraints(min_length=1, max_length=100)]
    axe_impact: Optional[Impact] = None
    tags: list[Short] = Field(default_factory=list, max_length=50)
    wcag_criteria: list[WcagCriterionIn] = Field(default_factory=list, max_length=10)
    node_count: int = Field(ge=0, le=100_000)
    page_finding_count: int = Field(default=1, ge=0, le=100_000)
    nodes: list[NodeIn] = Field(default_factory=list, max_length=50)

    @field_validator("axe_impact", mode="before")
    @classmethod
    def _lower(cls, v):
        return v.lower() if isinstance(v, str) else v


class BatchIn(Strict):
    findings: list[FindingIn] = Field(min_length=1, max_length=100)


class PredictionOut(BaseModel):
    priority: Literal["High", "Medium", "Low"]
    probabilities: dict[str, float]
    source: Literal["ML"] = "ML"
    model_name: str
    model_version: str
    feature_version: str
    model_origin: Literal["real_annotated", "synthetic_fixture", "development"]
    development_model: bool


class BatchOut(BaseModel):
    predictions: list[PredictionOut]
