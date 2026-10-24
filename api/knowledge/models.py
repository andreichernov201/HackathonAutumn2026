from datetime import date, datetime
from typing import Literal
from uuid import UUID

from pydantic import BaseModel, ConfigDict, Field, model_validator


Category = Literal['instruction', 'matrix', 'guidance', 'template', 'other']
VersionStatus = Literal['unverified', 'active', 'archived']


class StrictModel(BaseModel):
    model_config = ConfigDict(extra='forbid')


class Principal(StrictModel):
    id: str
    role: Literal['reader', 'knowledge_admin'] = 'reader'


class UploadMetadata(StrictModel):
    title: str = Field(min_length=1, max_length=300)
    category: Category
    description: str = Field(default='', max_length=2000)
    owner: str | None = Field(default=None, max_length=200)
    accessLevel: Literal['internal', 'restricted'] = 'internal'
    versionLabel: str | None = Field(default=None, max_length=100)
    effectiveFrom: date | None = None
    effectiveUntil: date | None = None
    status: VersionStatus = 'unverified'
    statusEvidence: str | None = Field(default=None, max_length=2000)
    materialNature: Literal['synthetic', 'corporate'] = 'synthetic'

    @model_validator(mode='after')
    def confirmed_status(self):
        self.title = self.title.strip()
        if not self.title:
            raise ValueError('title_required')
        if self.effectiveUntil and (not self.effectiveFrom or self.effectiveUntil < self.effectiveFrom):
            raise ValueError('invalid_effective_interval')
        if self.status != 'unverified' and not (self.statusEvidence or '').strip():
            raise ValueError('status_evidence_required')
        if self.status == 'active' and not self.effectiveFrom:
            raise ValueError('effective_date_required')
        return self


class KnowledgeVersion(StrictModel):
    id: str
    documentId: str
    versionLabel: str | None
    effectiveFrom: date | None
    effectiveUntil: date | None
    status: VersionStatus
    statusEvidence: str | None
    checksum: str
    filename: str
    fileType: Literal['pdf', 'docx', 'txt']
    pageCount: int | None
    createdAt: datetime
    indexedAt: datetime | None
    processingStatus: Literal['indexed'] = 'indexed'
    extractionWarnings: list[str]
    extractor: str
    originalUrl: str


class KnowledgeDocument(StrictModel):
    id: str
    title: str
    category: Category
    description: str
    owner: str | None
    accessLevel: Literal['internal', 'restricted']
    materialNature: Literal['synthetic', 'corporate']
    createdAt: datetime
    updatedAt: datetime
    latestVersion: KnowledgeVersion


class DocumentPage(StrictModel):
    items: list[KnowledgeDocument]
    total: int
    limit: int
    offset: int


class SectionSummary(StrictModel):
    id: str
    documentVersionId: str
    parentId: str | None
    sectionNumber: str | None
    heading: str
    locator: str
    pageStart: int | None
    pageEnd: int | None
    position: int
    locatorConfidence: Literal['numbered', 'table', 'fragment']


class KnowledgeCitation(StrictModel):
    id: str
    documentId: str
    versionId: str
    sectionId: str
    title: str
    locator: str
    excerpt: str
    provenance: Literal['knowledge'] = 'knowledge'
    sourceReference: str
    originalUrl: str
    versionLabel: str | None
    status: VersionStatus
    checksum: str
    materialNature: Literal['synthetic', 'corporate']


class KnowledgeSection(SectionSummary):
    text: str
    table: list[list[str]] | None
    source: KnowledgeCitation


class SectionPage(StrictModel):
    items: list[SectionSummary]
    total: int
    limit: int
    offset: int


class VersionPage(StrictModel):
    items: list[KnowledgeVersion]
    total: int
    limit: int
    offset: int


class SearchArgs(StrictModel):
    q: str = Field(min_length=1, max_length=500)
    category: Category | None = None
    status: VersionStatus | None = None
    versionId: UUID | None = None
    fileType: Literal['pdf', 'docx', 'txt'] | None = None
    includeTemplates: bool = False
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=100000)


class ListArgs(StrictModel):
    category: Category | None = None
    status: VersionStatus | None = None
    fileType: Literal['pdf', 'docx', 'txt'] | None = None
    sort: Literal['title', 'createdAt', 'updatedAt'] = 'updatedAt'
    limit: int = Field(default=20, ge=1, le=100)
    offset: int = Field(default=0, ge=0, le=100000)


class SearchHit(StrictModel):
    section: SectionSummary
    citation: KnowledgeCitation
    snippet: str
    score: float
    matchReason: Literal['full_text_fts5'] = 'full_text_fts5'


class SearchPage(StrictModel):
    items: list[SearchHit]
    total: int
    limit: int
    offset: int
    message: str | None = None
    searchMode: Literal['lexical_fts5'] = 'lexical_fts5'


class DocumentArg(StrictModel):
    documentId: UUID


class SectionArg(StrictModel):
    sectionId: UUID


class CitationArg(StrictModel):
    documentId: UUID
    versionId: UUID
    sectionId: UUID
    excerpt: str = Field(min_length=1, max_length=12000)


class CitationVerification(StrictModel):
    verified: bool
    reason: Literal['exact_excerpt', 'source_mismatch', 'excerpt_not_found']
    citation: KnowledgeCitation | None = None


class ToolCall(StrictModel):
    arguments: dict


class AdminLogin(StrictModel):
    token: str = Field(min_length=1, max_length=1024)
