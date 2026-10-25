from typing import Annotated, Literal
from uuid import UUID
from pydantic import BaseModel, ConfigDict, Field
from ..models import FieldSpec, Validation
from ..knowledge.models import CitationArg, KnowledgeCitation


class Strict(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Workspace(Strict):
    open: bool = False
    tab: Literal['sources', 'document', 'route'] = 'sources'
    selectedSourceId: str | None = None


class FileReference(Strict):
    name: str = Field(max_length=255)
    size: int = Field(ge=0)
    type: str = Field(max_length=255)


class Context(Strict):
    documentProjectId: UUID | None = None
    workspace: Workspace = Field(default_factory=Workspace)
    file: FileReference | None = None
    knowledgeSource: KnowledgeCitation | None = None


class ChatRequest(Strict):
    conversationId: UUID
    requestId: UUID
    message: str = Field(default='', max_length=8000)
    scenario: Literal['requirement', 'document', 'file-check', 'approval'] | None = None
    # Compatibility only: never trust browser-supplied model/tool/system history.
    history: list[dict] = Field(default_factory=list, max_length=200)
    context: Context = Field(default_factory=Context)
    syntheticOnlyAcknowledged: bool = False
    confirmActionId: UUID | None = None
    selectTemplateId: str | None = Field(default=None, max_length=100)


class FinalAnswer(Strict):
    text: str = Field(max_length=16000)
    answerType: Literal['normative', 'document', 'general']
    citations: list[CitationArg] = Field(default_factory=list, max_length=8)
    suggestedTemplateIds: list[str] = Field(default_factory=list, max_length=7)
    clarification: str | None = Field(default=None, max_length=2000)


class CitationBlock(Strict):
    type: Literal['citation'] = 'citation'
    sourceId: str


class DocumentFormBlock(Strict):
    type: Literal['document_form'] = 'document_form'
    projectId: str
    templateId: str
    projectVersion: int
    title: str
    status: Literal['draft', 'generated']
    fieldSpecs: list[FieldSpec]
    values: dict[str, str]
    validation: Validation
    editable: bool = True
    actions: list[Literal['save', 'validate', 'preview', 'generate', 'open_editor']]


class TemplateSuggestion(Strict):
    templateId: str
    title: str
    kind: str
    note: str
    sourceStatus: str


class TemplateSuggestionsBlock(Strict):
    type: Literal['template_suggestions'] = 'template_suggestions'
    templates: list[TemplateSuggestion]
    recommendedTemplateId: str | None = None


class ValidationBlock(Strict):
    type: Literal['validation_result'] = 'validation_result'
    outcome: Literal['pass', 'needs-review', 'blocked']
    checks: list[dict[str, str]]


class ProgressStep(Strict):
    label: str
    state: Literal['done', 'current', 'pending']


class ProgressBlock(Strict):
    type: Literal['task_progress'] = 'task_progress'
    title: str
    steps: list[ProgressStep]


class Confirmation(Strict):
    id: str
    projectId: str
    projectVersion: int


class ClarificationBlock(Strict):
    type: Literal['clarification'] = 'clarification'
    question: str
    fields: list[str] = Field(default_factory=list)
    confirmation: Confirmation | None = None


class DownloadBlock(Strict):
    type: Literal['download_artifact'] = 'download_artifact'
    projectId: str
    artifactId: str
    projectVersion: int
    filename: str


class DocumentCardBlock(Strict):
    type: Literal['document_card'] = 'document_card'
    projectId: str
    title: str
    status: Literal['draft', 'needs-data']
    summary: str


class DocumentPreviewBlock(Strict):
    type: Literal['document_preview'] = 'document_preview'
    projectId: str
    projectVersion: int


ChatBlock = Annotated[CitationBlock | DocumentFormBlock | TemplateSuggestionsBlock | ValidationBlock | ProgressBlock | ClarificationBlock | DownloadBlock | DocumentCardBlock | DocumentPreviewBlock, Field(discriminator='type')]


class ChatResult(Strict):
    status: Literal['completed', 'not-configured', 'error']
    conversationId: str
    requestId: str
    text: str = ''
    message: str | None = None
    blocks: list[ChatBlock] = Field(default_factory=list)
    sources: list[KnowledgeCitation] = Field(default_factory=list)
    workspace: Workspace | None = None
    documentProjectId: str | None = None
    origin: Literal['api'] = 'api'
    provider: str
    model: str
    usage: dict[str, int] = Field(default_factory=dict)
