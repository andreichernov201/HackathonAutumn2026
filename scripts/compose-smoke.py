"""HTTP acceptance against a disposable Compose stack; standard library only."""
import hashlib
import http.cookiejar
import http.client
import io
import json
import os
import urllib.error
import urllib.request
import urllib.parse
import zipfile

BASE = os.getenv('REGULA_TEST_URL', 'http://127.0.0.1:8080')
jar = http.cookiejar.CookieJar()
client = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(jar))
csrf = ''


def request(path, body=None, method=None, raw=None, content_type=None, expected=200):
    data = json.dumps(body).encode() if body is not None else raw
    headers = {'X-CSRF-Token': csrf}
    if data is not None:
        headers['Content-Type'] = content_type or 'application/json'
    req = urllib.request.Request(BASE + path, data=data, method=method, headers=headers)
    try:
        response = client.open(req, timeout=60)
    except urllib.error.HTTPError as error:
        response = error
    content = response.read()
    assert response.status == expected, (path, response.status, content[:300])
    return json.loads(content) if response.headers.get_content_type() == 'application/json' else content


def tool(name, **arguments):
    return request('/api/tools/' + name + '/invoke', {'arguments': arguments})


assert b'<html' in request('/')
assert request('/api/health')['status'] == 'ok'
session = request('/api/session')
csrf = session['csrfToken']
assert request('/api/knowledge/documents')['total'] == 3
assert len(request('/api/tools')) == 16
for query, point in [('Когда присваивается регистрационный номер проекту распоряжения?', '2.1'), ('Кто должен визировать распоряжение о создании рабочей группы для ИТ-проекта?', '6')]:
    found = tool('search_knowledge', q=query)['items'][0]
    assert found['section']['sectionNumber'] == point
    citation = found['citation']
    assert request('/api/knowledge/sections/' + citation['sectionId'])['source']['id'] == citation['id']
    assert hashlib.sha256(request(citation['originalUrl'])).hexdigest() == citation['checksum']

original_project_count = len(request('/api/document-projects'))
catalog = request('/api/document-templates')
assert len(catalog) == 7
for template in catalog:
    fields = {spec['key']: spec['options'][0] if spec['options'] else '2026-12-31' if spec['inputType'] == 'date' else 'Интеграция ' + spec['key'] for spec in template['fields'] if spec['required']}
    if 'appointees' in fields:
        fields['appointees'] = 'Отдел интеграции | специалист И. И. Иванов'
    project = tool('create_document_project', templateId=template['templateId'])
    pid = project['projectId']
    project = tool('update_document_fields', projectId=pid, expectedVersion=1, fields=fields)
    assert project['validation']['ready'], project['validation']
    assert request(f'/api/document-projects/{pid}/preview', {'fields': fields})['validation']['ready']
    generated = tool('generate_document_docx', projectId=pid)
    artifact = generated['artifacts'][0]
    data = request(tool('get_document_artifact', projectId=pid, artifactId=artifact['artifactId'])['downloadUrl'])
    assert hashlib.sha256(data).hexdigest() == artifact['sha256']
    with zipfile.ZipFile(io.BytesIO(data)) as archive:
        assert 'word/document.xml' in archive.namelist()

# This upload proves Nginx and multipart permit the complete 20 MiB file.
request('/api/knowledge/admin-session', {'token': os.environ['REGULA_KNOWLEDGE_ADMIN_TOKEN']})
assert request('/api/session') == session
prefix = '2.1 Интеграционная проверка загрузки.\n'.encode()
content = prefix + b' ' * (20 * 1024 * 1024 - len(prefix))
boundary = 'regula-integration-boundary'
metadata = json.dumps({'title': 'Compose boundary fixture', 'category': 'other'})
body = (f'--{boundary}\r\nContent-Disposition: form-data; name="metadata"\r\n\r\n{metadata}\r\n--{boundary}\r\nContent-Disposition: form-data; name="file"; filename="boundary.txt"\r\nContent-Type: text/plain\r\n\r\n'.encode() + content + f'\r\n--{boundary}--\r\n'.encode())
created = request('/api/knowledge/documents', raw=body, method='POST', content_type=f'multipart/form-data; boundary={boundary}', expected=201)
assert hashlib.sha256(request(created['latestVersion']['originalUrl'])).hexdigest() == created['latestVersion']['checksum']
# A file above 20 MiB is rejected by the service even while the complete
# multipart request still fits under the 22 MiB transport envelope.
suffix = f'\r\n--{boundary}--\r\n'.encode()
request('/api/knowledge/documents', raw=body[:-len(suffix)] + b' ' + suffix, method='POST', content_type=f'multipart/form-data; boundary={boundary}', expected=422)
# Check early rejection from headers without writing a huge body after the
# server has already closed the connection (urllib would report BrokenPipe).
endpoint = urllib.parse.urlsplit(BASE + '/api/knowledge/documents')
connection = (http.client.HTTPSConnection if endpoint.scheme == 'https' else http.client.HTTPConnection)(endpoint.netloc, timeout=30)
try:
    connection.request('POST', endpoint.path, body=b'x', headers={'Content-Length': str(22 * 1024 * 1024 + 1)})
    response = connection.getresponse()
    assert response.status == 413, response.status
    response.read()
finally:
    connection.close()
request('/api/knowledge/admin-session', method='DELETE')
assert request('/api/session') == session
assert len(request('/api/document-projects')) == original_project_count + 7
print('Compose smoke passed: Nginx, shared session/CSRF, 16 tools, 3 originals, 7 DOCX workflows, 20 MiB multipart upload and 413 boundary.')
