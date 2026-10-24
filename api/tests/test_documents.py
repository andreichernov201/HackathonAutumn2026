import io
import os
import tempfile
from pathlib import Path

os.environ['REGULA_DATA_DIR'] = tempfile.mkdtemp(prefix='regula-tests-')
os.environ['REGULA_SESSION_SECRET'] = 'test-secret-long-enough'
os.environ['REGULA_USER_PASSWORD'] = 'user-pass'
os.environ['REGULA_ADMIN_PASSWORD'] = 'admin-pass'

from fastapi.testclient import TestClient
from docx import Document
from api.main import app
from api.service import FIELDS, SOURCE_DIR

client = TestClient(app)

def login(username='user', password='user-pass'):
    response = client.post('/api/session/login', json={'username': username, 'password': password})
    assert response.status_code == 200
    return {'X-CSRF-Token': response.json()['csrfToken']}

def values():
    return {spec.key: (f'Тестовое значение {spec.key}' if spec.key != 'deadline' else '2026-12-31') for spec in FIELDS}

def test_catalog_project_lifecycle_and_access():
    headers = login()
    catalog = client.get('/api/document-templates').json()
    assert len(catalog) == 7
    assert catalog[0]['sourceStatus'] == 'ready'
    assert catalog[0]['registryStatus'] == 'unverified'
    assert catalog[1]['sourceStatus'] == 'awaiting_schema'
    assert client.post('/api/document-projects', json={'templateId': catalog[1]['templateId']}, headers=headers).status_code == 422
    created = client.post('/api/document-projects', json={'templateId': catalog[0]['templateId']}, headers=headers)
    assert created.status_code == 200
    project = created.json()
    assert project['validation']['ready'] is False
    assert client.post(f"/api/document-projects/{project['projectId']}/generate", headers=headers).status_code == 422
    changed = client.patch(f"/api/document-projects/{project['projectId']}", json={'expectedVersion': 1, 'fields': values()}, headers=headers)
    assert changed.status_code == 200
    assert changed.json()['version'] == 2
    assert changed.json()['validation']['ready'] is True
    assert client.patch(f"/api/document-projects/{project['projectId']}", json={'expectedVersion': 1, 'fields': {'chair': 'Иное'}}, headers=headers).status_code == 409
    assert client.get('/api/document-projects').json()[0]['projectId'] == project['projectId']
    tools = client.get('/api/document-tools').json()
    assert tools[2]['inputSchema']['properties']['templateId']
    assert client.post('/api/document-tools/create_document_project/invoke', json={'arguments': {'templateId': 'working-group-order'}}).status_code == 403
    invoked = client.post('/api/document-tools/get_document_project/invoke', json={'arguments': {'projectId': project['projectId']}}, headers=headers)
    assert invoked.status_code == 200 and invoked.json()['projectId'] == project['projectId']
    admin_headers = login('admin', 'admin-pass')
    assert client.get(f"/api/document-projects/{project['projectId']}").status_code == 404
    assert client.patch(f"/api/document-projects/{project['projectId']}", json={'expectedVersion': 2, 'fields': {}}, headers=admin_headers).status_code == 404

def test_real_source_docx_preserves_service_areas_and_versions():
    headers = login()
    project = client.post('/api/document-projects', json={'templateId': 'working-group-order'}, headers=headers).json()
    project = client.patch(f"/api/document-projects/{project['projectId']}", json={'expectedVersion': 1, 'fields': values()}, headers=headers).json()
    generated = client.post(f"/api/document-projects/{project['projectId']}/generate", headers=headers)
    assert generated.status_code == 200, generated.text
    artifact = generated.json()['artifacts'][0]
    download = client.get(f"/api/document-projects/{project['projectId']}/artifacts/{artifact['artifactId']}/download")
    assert download.status_code == 200
    document = Document(io.BytesIO(download.content))
    text = '\n'.join(p.text for p in document.paragraphs)
    text += '\n' + '\n'.join(cell.text for table in document.tables for row in table.rows for cell in row.cells)
    assert 'Тестовое значение purpose' in text
    assert 'Тестовое значение subject' in text
    assert '31» декабря 2026 г.' in text
    assert 'ДАТА / РЕГИСТРАЦИОННЫЙ НОМЕР' in text
    assert 'ВИЗУАЛИЗАЦИЯ ЭП' in text
    assert 'МОДУЛЬНЫЙ ДОКУМЕНТ' not in text
    assert 'УТВЕРЖДАЮ' not in text
    assert '[1]' not in text and '___' not in text
    assert len(document.tables) == 3
    assert client.get(f"/api/document-projects/{project['projectId']}/versions").json()[0]['artifactId'] == artifact['artifactId']
    changed = client.patch(f"/api/document-projects/{project['projectId']}", json={'expectedVersion': 2, 'fields': {'subject': 'Новая тема'}}, headers=headers).json()
    assert changed['status'] == 'draft'
    second = client.post(f"/api/document-projects/{project['projectId']}/generate", headers=headers).json()
    assert len(second['artifacts']) == 2
    assert second['artifacts'][0]['projectVersion'] == 3
    assert (SOURCE_DIR/'working-group-order.docx').read_bytes() != download.content

def test_admin_source_review_boundary():
    headers = login('admin', 'admin-pass')
    source = (SOURCE_DIR/'working-group-order.docx').read_bytes()
    upload = client.post('/api/document-templates/working-group-order/source', headers=headers, files={'file': ('module.docx', source, 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')})
    assert upload.status_code == 200, upload.text
    assert upload.json()['sourceStatus'] == 'awaiting_review'
    pending = client.post('/api/document-projects', json={'templateId': 'working-group-order'}, headers=headers)
    assert pending.status_code == 422
    assert client.post('/api/document-templates/working-group-order/approve', headers=headers).json()['sourceStatus'] == 'ready'
    assert client.post('/api/document-templates/working-group-order/source', headers=headers, files={'file': ('evil.docx', b'not docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')}).status_code == 422
