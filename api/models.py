from datetime import datetime
from typing import Literal
from pydantic import BaseModel, Field, ConfigDict

class FieldSpec(BaseModel):
    key: str
    label: str
    section: str
    required: bool = True
    multiline: bool = False
    inputType: Literal['text', 'date', 'select'] = 'text'
    options: list[str] = Field(default_factory=list)

class Template(BaseModel):
    templateId: str
    title: str
    kind: str
    templateVersion: str | None = None
    sourceStatus: Literal['awaiting_source', 'awaiting_review', 'awaiting_schema', 'ready']
    registryStatus: Literal['unverified'] = 'unverified'
    sourceFilename: str | None = None
    sourceSha256: str | None = None
    fields: list[FieldSpec]
    note: str

class ValidationIssue(BaseModel):
    code: str
    field: str | None = None
    message: str

class Validation(BaseModel):
    ready: bool
    completed: int
    total: int
    issues: list[ValidationIssue]

class Artifact(BaseModel):
    artifactId: str
    projectVersion: int
    createdAt: datetime
    filename: str
    sha256: str

class DocumentProject(BaseModel):
    projectId: str
    templateId: str
    templateVersion: str | None
    title: str
    fields: dict[str, str]
    status: Literal['draft', 'generated']
    version: int
    createdAt: datetime
    updatedAt: datetime
    sourceStatus: str
    validation: Validation
    artifacts: list[Artifact]
    preview: list[dict[str, str]]

class CreateProject(BaseModel):
    templateId: str
    title: str = Field(default='', max_length=200)

class PatchFields(BaseModel):
    model_config = ConfigDict(extra='forbid')
    expectedVersion: int = Field(ge=1)
    fields: dict[str, str]
    title: str | None = Field(default=None, max_length=200)

class PreviewFields(BaseModel):
    model_config = ConfigDict(extra='forbid')
    fields: dict[str, str]

class ToolCall(BaseModel):
    arguments: dict

class ProjectIdArg(BaseModel):
    projectId: str

class TemplateIdArg(BaseModel):
    templateId: str

class UpdateFieldsArg(PatchFields):
    projectId: str

class ArtifactArg(BaseModel):
    projectId: str
    artifactId: str

