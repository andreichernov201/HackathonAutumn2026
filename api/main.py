import os
import secrets
from uuid import uuid4
from pathlib import Path
from uuid import UUID

from fastapi import FastAPI, Cookie, Depends, File, Header, HTTPException, Response, UploadFile
from fastapi.responses import FileResponse
from fastapi.responses import JSONResponse
from itsdangerous import BadSignature, URLSafeTimedSerializer
from pydantic import BaseModel

from .models import ArtifactArg, CreateProject, DocumentProject, PatchFields, PreviewFields, ProjectIdArg, Template, TemplateIdArg, ToolCall, UpdateFieldsArg
from .service import DocumentsService, TEMPLATE_ID
from .knowledge.service import KnowledgeService, KnowledgeError
from .knowledge.router import build_router
from .knowledge.seed import import_case_sources

app = FastAPI(title='Regula AI API', version='0.2.0')
service = DocumentsService(Path(os.getenv('REGULA_DATA_DIR', './data')))
secret = os.getenv('REGULA_SESSION_SECRET', 'local-development-only-change-me')
signer = URLSafeTimedSerializer(secret)

def actor(response: Response, regula_session: str | None = Cookie(default=None)):
    try:
        data = signer.loads(regula_session, max_age=60 * 60 * 24 * 365) if regula_session else None
    except BadSignature:
        data = None
    if not isinstance(data, dict) or not data.get('deviceId') or not data.get('csrf'):
        data = {'deviceId': str(uuid4()), 'csrf': secrets.token_urlsafe(24)}
        response.set_cookie('regula_session', signer.dumps(data), max_age=60*60*24*365, httponly=True, secure=os.getenv('REGULA_SECURE_COOKIE') == '1', samesite='lax')
    return data

def mutation(user=Depends(actor), x_csrf_token: str | None = Header(default=None)):
    if not x_csrf_token or not secrets.compare_digest(x_csrf_token, user.get('csrf', '')):
        raise HTTPException(403, 'csrf_required')
    return user

knowledge_service = KnowledgeService(service.root, service.db_path)
if os.getenv('REGULA_IMPORT_CASE_CORPUS', '1') == '1':
    import_case_sources(knowledge_service)
app.include_router(build_router(knowledge_service, actor, mutation, signer))

@app.exception_handler(KnowledgeError)
def knowledge_error(request, exc):
    return JSONResponse(status_code=exc.status, content={'detail': exc.code})

@app.middleware('http')
async def knowledge_response_security(request, call_next):
    if request.url.path.startswith('/api/knowledge/'):
        length = request.headers.get('content-length', '')
        if length.isdigit() and int(length) > 22 * 1024 * 1024:
            return JSONResponse(status_code=413, content={'detail': 'invalid_file_size'})
    response = await call_next(request)
    if request.url.path.startswith('/api/knowledge/'):
        response.headers['Cache-Control'] = 'private, no-store'
        response.headers['X-Content-Type-Options'] = 'nosniff'
    return response

def admin(user=Depends(mutation)):
    # Template replacement is disabled in the anonymous demo. Deployments can
    # add corporate authentication before exposing this maintenance action.
    raise HTTPException(403, 'template_upload_disabled')

def project_or_404(user, project_id):
    try:
        UUID(project_id)
    except ValueError:
        raise HTTPException(404, 'project_not_found')
    project = service.get(user['deviceId'], project_id)
    if not project:
        raise HTTPException(404, 'project_not_found')
    return project

def error(exc: ValueError):
    code = str(exc)
    status = 409 if code == 'version_conflict' else 422
    raise HTTPException(status, code)

@app.get('/api/session')
def session(user=Depends(actor)):
    return {'deviceId': user['deviceId'], 'csrfToken': user['csrf']}

@app.get('/api/document-templates', response_model=list[Template])
def list_templates(user=Depends(actor)):
    return service.list_templates()

@app.get('/api/document-templates/{template_id}', response_model=Template)
def get_template(template_id: str, user=Depends(actor)):
    result = service.template(template_id)
    if not result:
        raise HTTPException(404, 'template_not_found')
    return result

@app.post('/api/document-templates/{template_id}/source', response_model=Template)
async def upload_source(template_id: str, file: UploadFile = File(), user=Depends(admin)):
    if template_id != TEMPLATE_ID:
        raise HTTPException(404, 'template_not_found')
    if file.content_type not in ('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'application/octet-stream'):
        raise HTTPException(422, 'invalid_media_type')
    content = await file.read(10_000_001)
    try:
        result = service.install_source(content, Path((file.filename or '').replace('\\','/')).name, '')
    except ValueError as exc:
        error(exc)
    return result

@app.post('/api/document-templates/{template_id}/approve', response_model=Template)
def approve_source(template_id: str, user=Depends(admin)):
    if template_id != TEMPLATE_ID:
        raise HTTPException(404, 'template_not_found')
    try:
        return service.approve_source()
    except ValueError as exc:
        error(exc)

@app.post('/api/document-projects', response_model=DocumentProject)
def create_project(body: CreateProject, user=Depends(mutation)):
    try:
        return service.create(user['deviceId'], body.templateId, body.title)
    except ValueError as exc:
        error(exc)

@app.get('/api/document-projects', response_model=list[DocumentProject])
def list_projects(user=Depends(actor)):
    return service.list_projects(user['deviceId'])

@app.get('/api/document-projects/{project_id}', response_model=DocumentProject)
def get_project(project_id: str, user=Depends(actor)):
    return project_or_404(user, project_id)

@app.patch('/api/document-projects/{project_id}', response_model=DocumentProject)
def update_fields(project_id: str, body: PatchFields, user=Depends(mutation)):
    project_or_404(user, project_id)
    try:
        return service.patch(user['deviceId'], project_id, body.expectedVersion, body.fields, body.title)
    except ValueError as exc:
        error(exc)

@app.post('/api/document-projects/{project_id}/preview')
def preview_project(project_id: str, body: PreviewFields, user=Depends(mutation)):
    project_or_404(user, project_id)
    allowed = {spec.key for spec in service.template(TEMPLATE_ID).fields}
    if any(key not in allowed or len(value) > 4000 for key, value in body.fields.items()):
        raise HTTPException(422, 'invalid_fields')
    project = project_or_404(user, project_id)
    template = service.template(project.templateId)
    return {'preview': service.preview(body.fields), 'validation': service._validation(body.fields, template, project.templateVersion)}

@app.post('/api/document-projects/{project_id}/validate', response_model=DocumentProject)
def validate_project(project_id: str, user=Depends(mutation)):
    return project_or_404(user, project_id)

@app.post('/api/document-projects/{project_id}/generate', response_model=DocumentProject)
def generate_project(project_id: str, user=Depends(mutation)):
    project_or_404(user, project_id)
    try:
        return service.generate(user['deviceId'], project_id)
    except ValueError as exc:
        error(exc)

@app.get('/api/document-projects/{project_id}/versions')
def list_versions(project_id: str, user=Depends(actor)):
    return project_or_404(user, project_id).artifacts

@app.get('/api/document-projects/{project_id}/artifacts/{artifact_id}/download')
def download(project_id: str, artifact_id: str, user=Depends(actor)):
    project_or_404(user, project_id)
    try:
        UUID(artifact_id)
    except ValueError:
        raise HTTPException(404, 'artifact_not_found')
    found = service.artifact(user['deviceId'], project_id, artifact_id)
    if not found or not found[0].is_file():
        raise HTTPException(404, 'artifact_not_found')
    return FileResponse(found[0], filename=found[1], media_type='application/vnd.openxmlformats-officedocument.wordprocessingml.document', headers={'X-Content-Type-Options': 'nosniff'})

class ToolDefinition(BaseModel):
    name: str
    method: str
    path: str
    irreversible: bool = False
    inputSchema: dict = {}
    outputSchema: dict = {}

TOOLS = [
    ToolDefinition(name='list_templates', method='GET', path='/api/document-templates'),
    ToolDefinition(name='get_template', method='GET', path='/api/document-templates/{templateId}'),
    ToolDefinition(name='create_document_project', method='POST', path='/api/document-projects'),
    ToolDefinition(name='get_document_project', method='GET', path='/api/document-projects/{projectId}'),
    ToolDefinition(name='list_document_projects', method='GET', path='/api/document-projects'),
    ToolDefinition(name='update_document_fields', method='PATCH', path='/api/document-projects/{projectId}'),
    ToolDefinition(name='validate_document_project', method='POST', path='/api/document-projects/{projectId}/validate'),
    ToolDefinition(name='generate_document_docx', method='POST', path='/api/document-projects/{projectId}/generate'),
    ToolDefinition(name='list_document_versions', method='GET', path='/api/document-projects/{projectId}/versions'),
    ToolDefinition(name='get_document_artifact', method='GET', path='/api/document-projects/{projectId}/artifacts/{artifactId}/download'),
]

TOOL_MODELS = {
    'list_templates': (None, list[Template]),
    'get_template': (TemplateIdArg, Template),
    'create_document_project': (CreateProject, DocumentProject),
    'get_document_project': (ProjectIdArg, DocumentProject),
    'list_document_projects': (None, list[DocumentProject]),
    'update_document_fields': (UpdateFieldsArg, DocumentProject),
    'validate_document_project': (ProjectIdArg, DocumentProject),
    'generate_document_docx': (ProjectIdArg, DocumentProject),
    'list_document_versions': (ProjectIdArg, list),
    'get_document_artifact': (ArtifactArg, dict),
}

@app.get('/api/document-tools', response_model=list[ToolDefinition])
def list_tools(user=Depends(actor)):
    from pydantic import TypeAdapter
    return [tool.model_copy(update={'inputSchema': model.model_json_schema() if model else {'type': 'object', 'properties': {}, 'additionalProperties': False}, 'outputSchema': TypeAdapter(output).json_schema()}) for tool in TOOLS for model, output in [TOOL_MODELS[tool.name]]]

@app.post('/api/document-tools/{tool_name}/invoke')
def invoke_tool(tool_name: str, call: ToolCall, user=Depends(mutation)):
    from pydantic import ValidationError
    if tool_name not in TOOL_MODELS:
        raise HTTPException(404, 'tool_not_found')
    model, _ = TOOL_MODELS[tool_name]
    try:
        args = model.model_validate(call.arguments).model_dump() if model else {}
    except ValidationError:
        raise HTTPException(422, 'invalid_tool_arguments')
    owner = user['deviceId']
    try:
        if tool_name == 'list_templates': return service.list_templates()
        if tool_name == 'get_template':
            result = service.template(args['templateId'])
            if not result: raise HTTPException(404, 'template_not_found')
            return result
        if tool_name == 'create_document_project': return service.create(owner, args['templateId'], args['title'])
        if tool_name == 'list_document_projects': return service.list_projects(owner)
        project = project_or_404(user, args['projectId'])
        if tool_name == 'get_document_project': return project
        if tool_name == 'update_document_fields': return service.patch(owner, args['projectId'], args['expectedVersion'], args['fields'], args['title'])
        if tool_name == 'validate_document_project': return project
        if tool_name == 'generate_document_docx': return service.generate(owner, args['projectId'])
        if tool_name == 'list_document_versions': return project.artifacts
        if tool_name == 'get_document_artifact':
            found = service.artifact(owner, args['projectId'], args['artifactId'])
            if not found: raise HTTPException(404, 'artifact_not_found')
            return {'downloadUrl': f"/api/document-projects/{args['projectId']}/artifacts/{args['artifactId']}/download", 'filename': found[1]}
    except ValueError as exc:
        error(exc)
