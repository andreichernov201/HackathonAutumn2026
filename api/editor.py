"""Versioned, provider-independent document operations. Never accept model HTML.

The source DOCX owns static/protected content and document styles. Only field
blocks explicitly granted by its server-side schema can be changed.
"""
import json
from typing import Literal
from uuid import uuid4
from pydantic import BaseModel, ConfigDict, Field
from .service import now
from .knowledge.models import Principal

class SourceReference(BaseModel):
    model_config = ConfigDict(extra='forbid')
    section_id: str
    version_id: str

class EditorOperation(BaseModel):
    model_config = ConfigDict(extra='forbid', strict=True)
    operation: Literal['set_field', 'replace_block', 'propose_rewrite', 'insert_allowed_block', 'get_missing_fields', 'validate_document', 'accept_suggestion', 'reject_suggestion']
    document_id: str
    base_version: int = Field(ge=1)
    field_id: str | None = None
    block_id: str | None = None
    value: str | None = Field(default=None, max_length=4000)
    suggestion_id: str | None = None
    reason: str | None = Field(default=None, max_length=2000)
    source: SourceReference | None = None

class EditorService:
    def __init__(self, documents, knowledge):
        self.documents, self.knowledge = documents, knowledge
        with documents.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS document_history (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, version INTEGER NOT NULL,
                operation TEXT NOT NULL, payload TEXT NOT NULL, created TEXT NOT NULL);
            CREATE INDEX IF NOT EXISTS document_history_project ON document_history(project_id, version);
            CREATE TABLE IF NOT EXISTS document_suggestions (
                id TEXT PRIMARY KEY, project_id TEXT NOT NULL, base_version INTEGER NOT NULL,
                field_id TEXT NOT NULL, original TEXT NOT NULL, proposed TEXT NOT NULL,
                reason TEXT NOT NULL, source TEXT, status TEXT NOT NULL, created TEXT NOT NULL);
            ''')

    def model(self, owner, project_id):
        project = self.documents.get(owner, project_id)
        if not project:
            return None
        template = self.documents.template(project.templateId)
        with self.documents.db() as db:
            history = [dict(row) for row in db.execute('SELECT version, operation, payload, created FROM document_history WHERE project_id=? ORDER BY rowid', (project_id,))]
            suggestions = [dict(row) for row in db.execute('SELECT * FROM document_suggestions WHERE project_id=? ORDER BY rowid', (project_id,))]
        for row in history:
            row['payload'] = json.loads(row['payload'])
        for row in suggestions:
            row['source'] = json.loads(row['source']) if row['source'] else None
        return {
            'document_id': project.projectId, 'template_id': project.templateId,
            'version': project.version,
            'metadata': {'title': project.title, 'template_version': project.templateVersion},
            'content': [{'id': f'field:{spec.key}', 'kind': 'generated' if spec.multiline else 'field',
                         'field_id': spec.key, 'value': project.fields.get(spec.key, ''), 'editable': True}
                        for spec in template.fields],
            'editable_fields': [spec.model_dump() for spec in template.fields],
            'document_styles': {'source': template.sourceFilename, 'source_sha256': template.sourceSha256,
                                'mode': 'preserve_source'},
            'validation_state': project.validation.model_dump(), 'history': history, 'suggestions': suggestions,
        }

    def apply(self, owner, operation):
        service = self.documents
        project = service.get(owner, operation.document_id)
        if not project:
            raise ValueError('project_not_found')
        template = service.template(project.templateId)
        if template.sourceStatus != 'ready':
            raise ValueError('source_not_ready')
        if project.templateVersion != template.templateVersion:
            raise ValueError('template_version_changed')
        if operation.field_id and operation.block_id and operation.block_id != f'field:{operation.field_id}':
            raise ValueError('operation_not_allowed')
        key = operation.field_id or (operation.block_id.removeprefix('field:') if operation.block_id and operation.block_id.startswith('field:') else None)
        spec = next((f for f in template.fields if f.key == key), None)
        source = None
        if operation.source:
            # Resolve only an existing, readable section in the named edition.
            section = self.knowledge.get_knowledge_section(Principal(id=owner, role='reader'), operation.source.section_id).model_dump(mode='json')
            if section['documentVersionId'] != operation.source.version_id:
                raise ValueError('source_version_mismatch')
            source = section['source']
        with service.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM projects WHERE id=? AND owner=?', (project.projectId, owner)).fetchone()
            if not row:
                raise ValueError('project_not_found')
            if row['version'] != operation.base_version:
                raise ValueError('version_conflict')
            fields = json.loads(row['fields'])
            kind = operation.operation
            suggestion = None
            if kind in ('accept_suggestion', 'reject_suggestion'):
                suggestion = db.execute('SELECT * FROM document_suggestions WHERE id=? AND project_id=?', (operation.suggestion_id, project.projectId)).fetchone()
                if not suggestion or suggestion['status'] != 'pending':
                    raise ValueError('suggestion_not_found')
                if kind == 'accept_suggestion' and suggestion['base_version'] != row['version']:
                    raise ValueError('version_conflict')
                key = suggestion['field_id']
                spec = next((f for f in template.fields if f.key == key), None)
            if kind in ('set_field', 'replace_block', 'propose_rewrite', 'insert_allowed_block', 'accept_suggestion'):
                if not spec:
                    raise ValueError('protected_block')
                if kind in ('replace_block', 'propose_rewrite') and not spec.multiline:
                    raise ValueError('operation_not_allowed')
                if kind == 'insert_allowed_block':
                    # Existing schemas grant no insertion points in the source.
                    raise ValueError('operation_not_allowed')
                value = operation.value if kind != 'accept_suggestion' or operation.value is not None else suggestion['proposed']
                if value is None:
                    raise ValueError('invalid_fields')
                merged = {**fields, key: value}
                invalid = [issue for issue in service._validation(merged, template, project.templateVersion).issues if issue.field == key and issue.code != 'required']
                if invalid:
                    raise ValueError(invalid[0].code)
                if kind == 'propose_rewrite':
                    db.execute('INSERT INTO document_suggestions VALUES (?,?,?,?,?,?,?,?,?,?)',
                        (str(uuid4()), project.projectId, row['version'], key, fields.get(key, ''), value,
                         operation.reason or '', json.dumps(source, ensure_ascii=False) if source else None, 'pending', now()))
                else:
                    db.execute("UPDATE projects SET fields=?, version=version+1, status='draft', updated=? WHERE id=? AND owner=? AND version=?",
                        (json.dumps(merged, ensure_ascii=False), now(), project.projectId, owner, row['version']))
            elif kind not in ('get_missing_fields', 'validate_document', 'reject_suggestion'):
                raise ValueError('operation_not_allowed')
            if suggestion:
                db.execute('UPDATE document_suggestions SET status=? WHERE id=?', ('accepted' if kind == 'accept_suggestion' else 'rejected', suggestion['id']))
            if kind not in ('get_missing_fields', 'validate_document'):
                version = row['version'] + int(kind in ('set_field', 'replace_block', 'accept_suggestion'))
                db.execute('INSERT INTO document_history VALUES (?,?,?,?,?,?)',
                    (str(uuid4()), project.projectId, version, kind, json.dumps({'field_id': key, 'before': fields.get(key, ''), 'value': operation.value if not suggestion or operation.value is not None else suggestion['proposed'], 'suggestion_id': operation.suggestion_id}, ensure_ascii=False), now()))
        result = self.model(owner, project.projectId)
        if operation.operation == 'get_missing_fields':
            result['missing_fields'] = [f.key for f in template.fields if f.required and not fields.get(f.key, '').strip()]
        return result
