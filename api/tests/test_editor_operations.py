import os
import tempfile
os.environ.setdefault('REGULA_DATA_DIR', tempfile.mkdtemp(prefix='regula-editor-tests-'))
from fastapi.testclient import TestClient
from api.main import app

def device():
    client = TestClient(app)
    headers = {'X-CSRF-Token': client.get('/api/session').json()['csrfToken']}
    project = client.post('/api/document-projects', headers=headers, json={'templateId': 'working-group-order'}).json()
    return client, headers, project['projectId']

def op(client, headers, id, kind, version=1, **kwargs):
    return client.post(f'/api/document-projects/{id}/operations', headers=headers,
        json={'document_id': id, 'base_version': version, 'operation': kind, **kwargs})

def test_operations_preserve_protected_source_and_enforce_versions_and_types():
    c, h, id = device()
    model = c.get(f'/api/document-projects/{id}/editor').json()
    assert model['version'] == 1 and model['document_styles']['mode'] == 'preserve_source'
    assert model['content'][0]['id'] == 'field:organization'
    assert op(c, h, id, 'replace_block', block_id='protected:1', value='overwrite').status_code == 422
    assert op(c, h, id, 'set_field', field_id='unknown', value='x').status_code == 422
    assert op(c, h, id, 'set_field', field_id='organization', value=42).status_code == 422
    assert op(c, h, id, 'set_field', field_id='deadline', value='bad-date').status_code == 422
    assert op(c, h, id, 'insert_allowed_block', block_id='field:purpose', value='x').status_code == 422
    changed = op(c, h, id, 'set_field', field_id='organization', value='Организация').json()
    assert changed['version'] == 2
    assert changed['history'][0]['payload']['before'] == ''
    assert op(c, h, id, 'set_field', field_id='organization', value='Устаревшее').status_code == 409
    missing = op(c, h, id, 'get_missing_fields', version=2).json()
    assert 'organization' not in missing['missing_fields'] and 'purpose' in missing['missing_fields']
    assert op(c, h, id, 'validate_document', version=2).json()['validation_state']['ready'] is False
    assert len(c.get(f'/api/document-projects/{id}/editor').json()['history']) == 1

def test_suggestions_require_explicit_acceptance_and_reject_stale_changes():
    c, h, id = device()
    proposal = op(c, h, id, 'propose_rewrite', block_id='field:purpose', value='Улучшить контроль', reason='Уточнение цели').json()
    suggestion = proposal['suggestions'][0]
    assert proposal['version'] == 1
    assert next(b['value'] for b in proposal['content'] if b['field_id'] == 'purpose') == ''
    assert suggestion['source'] is None
    accepted = op(c, h, id, 'accept_suggestion', suggestion_id=suggestion['id'], value='Уточнённая пользователем цель').json()
    assert next(b['value'] for b in accepted['content'] if b['field_id'] == 'purpose') == 'Уточнённая пользователем цель'
    assert accepted['version'] == 2 and accepted['suggestions'][0]['status'] == 'accepted'
    assert op(c, h, id, 'accept_suggestion', version=2, suggestion_id=suggestion['id']).status_code == 422
    proposed = op(c, h, id, 'propose_rewrite', version=2, block_id='field:purpose', value='Другой текст').json()['suggestions'][-1]
    assert op(c, h, id, 'set_field', version=2, field_id='organization', value='Организация').status_code == 200
    assert op(c, h, id, 'accept_suggestion', version=3, suggestion_id=proposed['id']).status_code == 409
    assert op(c, h, id, 'reject_suggestion', version=3, suggestion_id=proposed['id']).status_code == 200

def test_editor_uses_owner_csrf_and_only_existing_source_references():
    c, h, id = device()
    other, other_h, _ = device()
    assert other.get(f'/api/document-projects/{id}/editor').status_code == 404
    assert op(other, other_h, id, 'get_missing_fields').status_code == 404
    assert op(c, {}, id, 'set_field', field_id='organization', value='x').status_code == 403
    assert op(c, h, id, 'propose_rewrite', block_id='field:purpose', value='Текст', source={'section_id':'00000000-0000-0000-0000-000000000000','version_id':'00000000-0000-0000-0000-000000000000'}).status_code == 404
    hit = c.get('/api/knowledge/search', params={'q':'регистрационный номер'}).json()['items'][0]['citation']
    result = op(c, h, id, 'propose_rewrite', block_id='field:purpose', value='Текст', source={'section_id':hit['sectionId'], 'version_id':hit['versionId']})
    assert result.status_code == 200, result.text
    assert result.json()['suggestions'][0]['source']['checksum'] == hit['checksum']
    assert op(c, h, id, 'propose_rewrite', block_id='field:purpose', value='Текст', source={'section_id':hit['sectionId'], 'version_id':'00000000-0000-0000-0000-000000000000'}).status_code == 422

def test_existing_patch_saves_durable_history_without_changing_contract():
    c, h, id = device()
    result = c.patch(f'/api/document-projects/{id}', headers=h, json={'expectedVersion':1,'fields':{'organization':'Пример'},'title':'Название'})
    assert result.status_code == 200
    model = c.get(f'/api/document-projects/{id}/editor').json()
    assert model['version'] == 2 and model['history'][0]['operation'] == 'save_fields'
    assert model['history'][0]['payload']['fields']['organization'] == 'Пример'
