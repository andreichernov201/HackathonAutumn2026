import hashlib
import os
import secrets
import threading
import time
from uuid import UUID

from fastapi import APIRouter, Depends, File, Form, Query, Request, Response, UploadFile
from fastapi.responses import FileResponse
from pydantic import ValidationError

from ..session import write_session_cookie
from .extract import MAX_BYTES, MIMES
from .models import (
    AdminLogin, DocumentPage, KnowledgeDocument, KnowledgeSection, KnowledgeVersion,
    ListArgs, Principal, SearchArgs, SearchPage, SectionPage, ToolCall, UploadMetadata, VersionPage,
)
from .service import KnowledgeError, KnowledgeService
from .tools import definitions, invoke


def configured_token():
    value = os.getenv('REGULA_KNOWLEDGE_ADMIN_TOKEN', '')
    return value if len(value) >= 32 else ''


def principal_for(user):
    token = configured_token()
    grant = hashlib.sha256(token.encode()).hexdigest() if token else ''
    granted_at = user.get('knowledgeGrantedAt', 0)
    unexpired = isinstance(granted_at, (int, float)) and 0 <= time.time() - granted_at < 8 * 60 * 60
    is_admin = bool(grant and unexpired and secrets.compare_digest(str(user.get('knowledgeGrant', '')), grant))
    return Principal(id=user['deviceId'], role='knowledge_admin' if is_admin else 'reader')


def build_router(service: KnowledgeService, actor, mutation, signer):
    router = APIRouter(prefix='/api/knowledge', tags=['knowledge'])
    attempts: dict[str, tuple[float, int]] = {}
    attempts_lock = threading.Lock()

    def principal(user=Depends(actor)):
        return principal_for(user)

    def writer(user=Depends(mutation), identity=Depends(principal)):
        service.require_admin(identity)
        return identity

    @router.get('/session')
    def knowledge_session(identity=Depends(principal)):
        return {'mode': 'demo', 'role': identity.role, 'adminConfigured': bool(configured_token()), 'corporateAuthentication': False}

    @router.post('/admin-session')
    def admin_login(body: AdminLogin, request: Request, response: Response, user=Depends(mutation)):
        key = request.client.host if request.client else 'local'
        with attempts_lock:
            current = time.monotonic()
            start, count = attempts.get(key, (current, 0))
            if current - start > 300:
                start, count = current, 0
            if count >= 10:
                raise KnowledgeError('too_many_admin_attempts', 429)
            if len(attempts) > 10000:
                attempts.clear()
            attempts[key] = (start, count + 1)
        token = configured_token()
        if not token or not secrets.compare_digest(body.token.encode(), token.encode()):
            raise KnowledgeError('invalid_admin_token', 403)
        data = {**user, 'knowledgeGrant': hashlib.sha256(token.encode()).hexdigest(), 'knowledgeGrantedAt': time.time()}
        write_session_cookie(response, signer, data)
        return {'role': 'knowledge_admin', 'mode': 'demo'}

    @router.delete('/admin-session')
    def admin_logout(response: Response, user=Depends(mutation)):
        data = {key: value for key, value in user.items() if key not in ('knowledgeGrant', 'knowledgeGrantedAt')}
        write_session_cookie(response, signer, data)
        return {'role': 'reader', 'mode': 'demo'}

    @router.get('/documents', response_model=DocumentPage)
    def list_documents(args: ListArgs = Depends(), identity=Depends(principal)):
        return service.list_knowledge_documents(identity, args)

    @router.get('/documents/{document_id}', response_model=KnowledgeDocument)
    def get_document(document_id: UUID, identity=Depends(principal)):
        return service.get_knowledge_document(identity, document_id)

    @router.get('/documents/{document_id}/versions', response_model=VersionPage)
    def versions(document_id: UUID, limit: int = Query(100, ge=1, le=100), offset: int = Query(0, ge=0, le=100000), identity=Depends(principal)):
        return service.list_knowledge_versions(identity, document_id, limit, offset)

    @router.get('/versions/{version_id}/sections', response_model=SectionPage)
    def sections(version_id: UUID, limit: int = Query(1000, ge=1, le=1000), offset: int = Query(0, ge=0, le=100000), identity=Depends(principal)):
        return service.sections(identity, version_id, limit, offset)

    @router.get('/sections/{section_id}', response_model=KnowledgeSection)
    def section(section_id: UUID, identity=Depends(principal)):
        return service.get_knowledge_section(identity, section_id)

    @router.get('/search', response_model=SearchPage)
    def search(args: SearchArgs = Depends(), identity=Depends(principal)):
        return service.search_knowledge(identity, args)

    @router.get('/versions/{version_id}/original')
    def original(version_id: UUID, identity=Depends(principal)):
        path, filename, file_type = service.original(identity, version_id)
        return FileResponse(path, filename=filename, media_type=next(iter(MIMES[file_type])), content_disposition_type='inline', headers={'X-Content-Type-Options': 'nosniff', 'Cache-Control': 'private, no-store', 'Content-Security-Policy': "sandbox; default-src 'none'"})

    def upload_file(metadata, file, identity, document_id=None):
        try:
            data = UploadMetadata.model_validate_json(metadata)
        except ValidationError as exc:
            raise KnowledgeError('invalid_upload_metadata') from exc
        try:
            content = file.file.read(MAX_BYTES+1)
            return service.upload(identity, data, content, file.filename or '', file.content_type or '', document_id)
        finally:
            file.file.close()

    @router.post('/documents', response_model=KnowledgeDocument, status_code=201)
    def upload(metadata: str = Form(max_length=10000), file: UploadFile = File(), identity=Depends(writer)):
        return upload_file(metadata, file, identity)

    @router.post('/documents/{document_id}/versions', response_model=KnowledgeDocument, status_code=201)
    def upload_version(document_id: UUID, metadata: str = Form(max_length=10000), file: UploadFile = File(), identity=Depends(writer)):
        return upload_file(metadata, file, identity, document_id)

    @router.post('/versions/{version_id}/index', response_model=KnowledgeVersion)
    def reindex(version_id: UUID, identity=Depends(writer)):
        return service.reindex(identity, version_id)

    @router.get('/tools')
    def tools(identity=Depends(principal)):
        return definitions()

    @router.post('/tools/{tool_name}/invoke')
    def tool(tool_name: str, body: ToolCall, user=Depends(mutation), identity=Depends(principal)):
        return invoke(service, identity, tool_name, body.arguments)

    @router.get('/audit')
    def audit(limit: int = Query(50, ge=1, le=100), offset: int = Query(0, ge=0, le=100000), identity=Depends(principal)):
        service.require_admin(identity)
        with service.db() as db:
            rows = db.execute('SELECT * FROM knowledge_audit ORDER BY created_at DESC LIMIT ? OFFSET ?', (limit, offset)).fetchall()
        return {'items': [dict(row) for row in rows], 'limit': limit, 'offset': offset}

    return router
