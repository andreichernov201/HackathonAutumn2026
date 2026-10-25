"""No paid requests: real services + deterministic provider/tool transcripts."""
import copy
import hashlib
import io
import json
from dataclasses import replace
from uuid import uuid4

import httpx
import pytest
from docx import Document
from fastapi import HTTPException
from fastapi.testclient import TestClient

from api import main
from api.agent.config import AISettings
from api.agent.models import ChatRequest
from api.agent.providers import Completion, DeepSeekProvider, LocalQwenProvider, ModelMessage, ProviderError
from api.agent.runner import AgentRunner
from api.agent.store import ChatStore
from api.knowledge.models import Principal, UploadMetadata
from api.knowledge.seed import import_case_sources
from api.knowledge.service import KnowledgeService
from api.service import DocumentsService, SOURCE_DIR


class MockProvider:
    def __init__(self, *steps):
        self.steps, self.calls = list(steps), []

    def complete(self, messages, tools, timeout, max_tokens):
        self.calls.append(copy.deepcopy(messages))
        assert timeout > 0 and max_tokens > 0 and len(tools) == 16
        step = self.steps.pop(0)
        if isinstance(step, Exception):
            raise step
        message = step(messages) if callable(step) else step
        return Completion(message=ModelMessage.model_validate(message), total_tokens=200)


def calls(*items, reasoning='private-reasoning-never-public'):
    return {'role': 'assistant', 'content': None, 'reasoning_content': reasoning,
            'tool_calls': [{'id': str(uuid4()), 'type': 'function', 'function': {'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}} for name, args in items]}


def final(text='Проект готов к заполнению.', kind='document', citations=None, **extra):
    return {'role': 'assistant', 'content': json.dumps({'text': text, 'answerType': kind, 'citations': citations or [], **extra}, ensure_ascii=False), 'reasoning_content': 'final-private-reasoning'}


def request(cid=None, **kwargs):
    return ChatRequest(conversationId=cid or uuid4(), requestId=uuid4(), message='Учебный запрос', syntheticOnlyAcknowledged=True, **kwargs)


@pytest.fixture
def setup(tmp_path, monkeypatch):
    documents = DocumentsService(tmp_path)
    knowledge = KnowledgeService(tmp_path, documents.db_path)
    import_case_sources(knowledge)
    monkeypatch.setattr(main, 'service', documents)
    monkeypatch.setattr(main, 'knowledge_service', knowledge)
    user = {'deviceId': 'test-device', 'csrf': 'test-csrf'}
    # This value is confined to a mocked provider; it is never used for HTTP.
    settings = AISettings(api_key='mock-transport-only')
    return documents, knowledge, user, settings


def runner(setup, provider, settings=None):
    d, k, _, config = setup
    return AgentRunner(d, k, main.tool_registry, settings or config, provider)


def body_of_last_tool(messages):
    return json.loads(next(m['content'] for m in reversed(messages) if m['role'] == 'tool'))


def sample(template):
    fields = {s.key: s.options[0] if s.options else '2026-12-01' if s.inputType == 'date' else f'Учебное значение {s.key}' for s in template.fields if s.required}
    if 'appointees' in fields:
        fields['appointees'] = 'Учебный отдел | специалист И. И. Иванов'
    return fields


def test_registration_answer_uses_fts_section_exact_verification_and_workspace(setup):
    def get_section(messages):
        hit = body_of_last_tool(messages)['items'][0]
        assert hit['section']['sectionNumber'] == '2.1'
        return calls(('get_knowledge_section', {'sectionId': hit['citation']['sectionId']}))
    citation = {}
    def verify(messages):
        section = body_of_last_tool(messages)
        citation.update({k: section['source'][k] for k in ('documentId', 'versionId', 'sectionId', 'excerpt')})
        return calls(('verify_citation', citation))
    provider = MockProvider(calls(('search_knowledge', {'q': 'Когда присваивается регистрационный номер распоряжению?', 'limit': 3})), get_section, verify,
                            lambda _: final('Номер присваивается на этапе, указанном в пункте 2.1.', 'normative', [citation]))
    agent = runner(setup, provider)
    result = agent.run(request(), setup[2])
    assert len(result.sources) == 1
    assert result.workspace.tab == 'sources'
    assert '2.1' in result.sources[0].locator
    assert 'private-reasoning' not in result.model_dump_json()
    for transcript in provider.calls[1:]:
        assert any(m.get('reasoning_content') == 'private-reasoning-never-public' for m in transcript)
    assert result.sources[0].excerpt in setup[1].get_knowledge_section(Principal(id=setup[2]['deviceId']), citation['sectionId']).text


def test_complex_normative_question_reads_multiple_sources_and_matrix_row_six(setup):
    found = []
    def sections(messages):
        for m in messages:
            if m['role'] == 'tool':
                found.extend(json.loads(m['content']).get('items', []))
        assert any(h['section']['sectionNumber'] == '6' or '6' in h['section']['locator'] for h in found)
        chosen = list({h['citation']['documentId']: h['citation'] for h in found}.values())
        assert len(chosen) >= 2
        return calls(*[('get_knowledge_section', {'sectionId': c['sectionId']}) for c in chosen])
    citations = []
    def verify_all(messages):
        for m in messages:
            if m['role'] == 'tool':
                value = json.loads(m['content'])
                if 'source' in value:
                    citations.append({k: value['source'][k] for k in ('documentId','versionId','sectionId','excerpt')})
        return calls(*[('verify_citation', c) for c in citations])
    provider = MockProvider(calls(('search_knowledge', {'q': 'рабочая группа ИТ проект визирование', 'limit': 8}), ('search_knowledge', {'q': 'модуль повторного визирования', 'limit': 4})),
                            sections, verify_all, lambda _: final('Матрица задаёт обязательные и условные визы; статус модуля в реестре неизвестен, исключение автоматически не применяется. Фактическое согласование не выполнялось.', 'normative', citations))
    result = runner(setup, provider).run(request(), setup[2])
    assert len(result.sources) >= 2, result.model_dump_json()
    assert 'Фактическое согласование не выполнялось' in result.text


@pytest.mark.parametrize('template_id', [p[0] for p in __import__('api.service', fromlist=['CATALOG']).CATALOG])
def test_all_seven_modules_create_form_fill_validate_confirm_and_download_real_docx(setup, template_id):
    documents, _, user, _ = setup
    source_hashes = {p.name: hashlib.sha256(p.read_bytes()).hexdigest() for p in SOURCE_DIR.glob('*.docx')}
    fields = sample(documents.template(template_id))
    def update(messages):
        p = body_of_last_tool(messages)
        return calls(('update_document_fields', {'projectId': p['projectId'], 'expectedVersion': p['version'], 'fields': fields}))
    def validate(messages):
        p = body_of_last_tool(messages)
        return calls(('validate_document_project', {'projectId': p['projectId']}), ('generate_document_docx', {'projectId': p['projectId']}))
    provider = MockProvider(calls(('list_templates', {}), ('get_template', {'templateId': template_id})),
                            calls(('create_document_project', {'templateId': template_id})), update, validate, final('Реквизиты заполнены. Подтвердите формирование.'))
    agent = runner(setup, provider)
    req = request()
    result = agent.run(req, user)
    assert result.documentProjectId, result.model_dump_json()
    form = next(b for b in result.blocks if b.type == 'document_form')
    assert form.templateId == template_id and form.validation.ready
    assert form.values == fields
    confirmation = next(b.confirmation for b in result.blocks if b.type == 'clarification' and b.confirmation)
    assert not documents.get(user['deviceId'], form.projectId).artifacts
    confirmed = agent.run(request(cid=req.conversationId, confirmActionId=confirmation.id), user)
    download = next(b for b in confirmed.blocks if b.type == 'download_artifact')
    path, _ = documents.artifact(user['deviceId'], download.projectId, download.artifactId)
    docx = Document(io.BytesIO(path.read_bytes()))
    assert docx.tables
    assert all(hashlib.sha256(p.read_bytes()).hexdigest() == source_hashes[p.name] for p in SOURCE_DIR.glob('*.docx'))
    assert len(documents.list_projects(user['deviceId'])) == 1
    # Identical network retry does not create a project or execute inference again.
    assert agent.run(req, user).model_dump() == result.model_dump()
    assert len(documents.list_projects(user['deviceId'])) == 1


def test_manual_change_and_next_ai_turn_share_live_version_and_private_history(setup):
    documents, _, user, _ = setup
    project = documents.create(user['deviceId'], 'working-group-order', '')
    first = request(context={'documentProjectId': project.projectId})
    agent = runner(setup, MockProvider(calls(('get_document_project', {'projectId': project.projectId})), final()))
    agent.run(first, user)
    documents.patch(user['deviceId'], project.projectId, 1, {'subject': 'Ручное изменение'}, None)
    def edit(messages):
        current = body_of_last_tool(messages)
        assert current['version'] == 2 and current['fields']['subject'] == 'Ручное изменение'
        assert any(m.get('reasoning_content') == 'final-private-reasoning' for m in messages)
        return calls(('update_document_fields', {'projectId': current['projectId'], 'expectedVersion': 2, 'fields': {'secretary': 'Петрова Анна Сергеевна'}}))
    provider = MockProvider(calls(('get_document_project', {'projectId': project.projectId})), edit, final())
    result = runner(setup, provider).run(request(cid=first.conversationId), user)
    form = next(b for b in result.blocks if b.type == 'document_form')
    assert form.values == {'subject': 'Ручное изменение', 'secretary': 'Петрова Анна Сергеевна'}
    public = ChatStore(documents).public_history(user['deviceId'], str(first.conversationId))
    assert 'reasoning_content' not in json.dumps(public)


def test_unknown_fields_foreign_projects_roles_invalid_json_and_version_conflict_rejected(setup):
    documents, _, user, _ = setup
    p = documents.create(user['deviceId'], 'working-group-order', '')
    other = documents.create('other-owner', 'working-group-order', '')
    bad = calls(('get_document_project', {'projectId': p.projectId}), ('update_document_fields', {'projectId': p.projectId, 'expectedVersion': 1, 'fields': {'nonexistent': 'bad'}}),
                ('get_document_project', {'projectId': other.projectId}), ('list_templates', {'role': 'knowledge_admin'}), ('run_sql', {'sql': 'drop table projects'}))
    bad['tool_calls'].append({'id': 'bad-json', 'function': {'name': 'list_templates', 'arguments': '{broken'}})
    provider = MockProvider(bad, final())
    runner(setup, provider).run(request(), user)
    errors = [json.loads(m['content'])['error'] for m in provider.calls[-1] if m['role'] == 'tool' and 'error' in json.loads(m['content'])]
    assert 'invalid_fields' in errors and 'project_not_found' in errors and 'invalid_tool_arguments' in errors and 'tool_not_found' in errors
    assert documents.get(user['deviceId'], p.projectId).fields == {}
    def conflict(messages):
        documents.patch(user['deviceId'], p.projectId, 1, {'subject': 'новая версия'}, None)
        return calls(('update_document_fields', {'projectId': p.projectId, 'expectedVersion': 1, 'fields': {'subject': 'затереть'}}))
    provider = MockProvider(calls(('get_document_project', {'projectId': p.projectId})), conflict, final())
    runner(setup, provider).run(request(), user)
    assert documents.get(user['deviceId'], p.projectId).fields['subject'] == 'новая версия'
    assert any(m['role'] == 'tool' and json.loads(m['content']).get('error') == 'version_conflict' for m in provider.calls[-1])


def test_corporate_material_never_reaches_cloud_even_for_admin(setup, monkeypatch):
    _, knowledge, user, _ = setup
    import time
    token = 'test-maintenance-grant-for-synthetic-corpus-only'
    monkeypatch.setenv('REGULA_KNOWLEDGE_ADMIN_TOKEN', token)
    user.update(knowledgeGrantedAt=time.time(), knowledgeGrant=hashlib.sha256(token.encode()).hexdigest())
    document = knowledge.upload(Principal(id=user['deviceId'], role='knowledge_admin'), UploadMetadata(title='Реальное положение', category='instruction', materialNature='corporate'), '2.1 СЕКРЕТНЫЙ-КОРПОРАТИВНЫЙ-ТЕКСТ'.encode(), 'private.txt', 'text/plain')
    provider = MockProvider(calls(('search_knowledge', {'q': 'СЕКРЕТНЫЙ'}), ('get_knowledge_document', {'documentId': document.id}), ('list_knowledge_versions', {'documentId': document.id})), final('Нет источника.', 'normative'))
    result = runner(setup, provider).run(request(), user)
    assert 'СЕКРЕТНЫЙ-КОРПОРАТИВНЫЙ-ТЕКСТ' not in json.dumps(provider.calls[-1], ensure_ascii=False)
    assert not result.sources and 'Нет подтверждённого' in result.text


def test_unverified_hallucinated_citation_and_html_final_not_published(setup):
    provider = MockProvider(final('Номер присваивают заранее по выдуманному правилу.', 'normative', [{'documentId': str(uuid4()), 'sectionId': str(uuid4()), 'versionId': str(uuid4()), 'excerpt': 'выдумка'}]))
    result = runner(setup, provider).run(request(), setup[2])
    assert not result.sources and 'выдуманному' not in result.text
    result = runner(setup, MockProvider({'role': 'assistant', 'content': '<script>bad()</script>'})).run(request(), setup[2])
    assert '<script>' not in result.model_dump_json()


def test_provider_outage_preserves_created_project_and_manual_editor(setup):
    p = MockProvider(calls(('list_templates', {})), calls(('create_document_project', {'templateId': 'system-commissioning-order'})), ProviderError('provider_unavailable'))
    result = runner(setup, p).run(request(), setup[2])
    assert result.documentProjectId and any(b.type == 'document_form' for b in result.blocks)
    project = setup[0].get(setup[2]['deviceId'], result.documentProjectId)
    updated = setup[0].patch(setup[2]['deviceId'], project.projectId, 1, {'responsible': 'Иванов'}, None)
    assert updated.fields['responsible'] == 'Иванов'


def test_limits_duplicate_tool_calls_and_request_journal(setup):
    documents, _, user, settings = setup
    p = MockProvider(calls(('list_templates', {})), calls(('create_document_project', {'templateId': 'working-group-order'}), ('create_document_project', {'title': '', 'templateId': 'working-group-order'})), final())
    req = request()
    agent = runner(setup, p)
    agent.run(req, user)
    assert len(documents.list_projects(user['deviceId'])) == 1
    with pytest.raises(HTTPException) as reused:
        agent.run(req.model_copy(update={'message': 'другие аргументы'}), user)
    assert reused.value.detail == 'idempotency_key_reused'
    loop = MockProvider(*[calls(('list_templates', {})) for _ in range(10)])
    result = runner(setup, loop, replace(settings, max_model_calls=2)).run(request(), user)
    assert len(loop.calls) == 2 and result.message
    store = ChatStore(documents)
    req = request()
    store.claim(user['deviceId'], req, 'digest', settings)
    with pytest.raises(HTTPException):
        store.claim(user['deviceId'], req, 'digest', settings)


def test_stale_confirmation_does_not_generate_new_version(setup):
    documents, _, user, _ = setup
    p = documents.create(user['deviceId'], 'working-group-order', '')
    p = documents.patch(user['deviceId'], p.projectId, 1, sample(documents.template(p.templateId)), None)
    req = request(context={'documentProjectId': p.projectId})
    result = runner(setup, MockProvider(calls(('generate_document_docx', {'projectId': p.projectId})), final())).run(req, user)
    token = next(b.confirmation.id for b in result.blocks if b.type == 'clarification')
    documents.patch(user['deviceId'], p.projectId, p.version, {'subject': 'Изменено вручную'}, None)
    result = runner(setup, MockProvider()).run(request(cid=req.conversationId, confirmActionId=token), user)
    assert not documents.get(user['deviceId'], p.projectId).artifacts
    assert 'Проект изменился' in result.text


def test_api_contract_csrf_server_identity_status_and_history(setup, monkeypatch):
    monkeypatch.delenv('DEEPSEEK_API_KEY', raising=False)
    client = TestClient(main.app)
    assert client.post('/api/chat', json=request().model_dump(mode='json')).status_code == 403
    session = client.get('/api/session').json()
    client.headers['X-CSRF-Token'] = session['csrfToken']
    body = request().model_dump(mode='json')
    body['role'] = 'knowledge_admin'
    assert client.post('/api/chat', json=body).status_code == 422
    body.pop('role')
    response = client.post('/api/chat', json=body)
    assert response.status_code == 200, response.text
    assert response.json()['origin'] == 'api'
    assert response.json()['message']
    status = client.get(f"/api/chat/{body['conversationId']}/requests/{body['requestId']}")
    assert status.json()['state'] == 'done'
    assert client.get('/api/chat/config').json()['model'] == 'deepseek-v4-pro'
    outsider = TestClient(main.app)
    assert outsider.get(f"/api/chat/{body['conversationId']}/requests/{body['requestId']}").status_code == 404
    assert outsider.get(f"/api/chat/{body['conversationId']}/history").json() == []


def test_http_provider_correct_payload_reasoning_roundtrip_timeout_and_redaction():
    seen = []
    def handler(req):
        body = json.loads(req.content)
        seen.append(body)
        assert req.url == 'https://api.deepseek.com/chat/completions'
        assert body['model'] == 'deepseek-v4-pro' and body['thinking']['type'] == 'enabled'
        assert body['response_format'] == {'type':'json_object'}
        return httpx.Response(200, json={'choices': [{'message': final(), 'finish_reason': 'stop'}], 'usage': {'total_tokens': 20}})
    provider = DeepSeekProvider(AISettings(api_key='mock-transport-only'), httpx.MockTransport(handler))
    messages = [{'role': 'assistant', 'content': None, 'reasoning_content': 'private', 'tool_calls': []}]
    assert provider.complete(messages, [], 2, 1000).total_tokens == 20
    assert seen[0]['messages'][0]['reasoning_content'] == 'private'
    def unauthorized(_): return httpx.Response(401, text='SECRET raw upstream error')
    with pytest.raises(ProviderError) as error:
        DeepSeekProvider(AISettings(), httpx.MockTransport(unauthorized)).complete([], [], 1, 1000)
    assert str(error.value) == 'provider_auth_failed' and 'SECRET' not in str(error.value)
    def timeout(req): raise httpx.ReadTimeout('SECRET', request=req)
    with pytest.raises(ProviderError, match='provider_timeout'):
        DeepSeekProvider(AISettings(), httpx.MockTransport(timeout)).complete([], [], 1, 1000)
    qwen = LocalQwenProvider(AISettings(provider='local_qwen', model='qwen-test', base_url='http://localhost:8001/v1'))
    assert qwen.extra_body() == {}


def test_configuration_never_falls_back_to_flash_or_forwards_key_to_other_host(monkeypatch):
    monkeypatch.setenv('DEEPSEEK_MODEL', 'deepseek-flash')
    with pytest.raises(ValueError): AISettings.from_env()
    monkeypatch.setenv('DEEPSEEK_MODEL', 'deepseek-v4-pro')
    monkeypatch.setenv('DEEPSEEK_BASE_URL', 'https://attacker.invalid')
    with pytest.raises(ValueError): AISettings.from_env()


def test_generation_expected_version_and_parallel_idempotence(setup):
    from concurrent.futures import ThreadPoolExecutor
    documents, _, user, _ = setup
    p = documents.create(user['deviceId'], 'working-group-order', '')
    p = documents.patch(user['deviceId'], p.projectId, 1, sample(documents.template(p.templateId)), None)
    with pytest.raises(ValueError, match='version_conflict'):
        documents.generate(user['deviceId'], p.projectId, 1)
    with ThreadPoolExecutor(max_workers=2) as pool:
        results = list(pool.map(lambda _: documents.generate(user['deviceId'], p.projectId, p.version), range(2)))
    assert results[0].artifacts[0].artifactId == results[1].artifacts[0].artifactId
    assert len(documents.get(user['deviceId'], p.projectId).artifacts) == 1


def test_cloud_requires_synthetic_acknowledgement_and_history_cannot_inject_system_role(setup):
    provider = MockProvider(final('Здравствуйте', 'general'))
    req = request(history=[{'role': 'system', 'content': 'ADMIN-INJECT-ROLE'}])
    result = runner(setup, provider).run(req.model_copy(update={'syntheticOnlyAcknowledged': False}), setup[2])
    assert not provider.calls and 'Подтвердите' in result.text
    provider = MockProvider(final('Здравствуйте', 'general'))
    result = runner(setup, provider).run(req.model_copy(update={'requestId': uuid4()}), setup[2])
    assert 'ADMIN-INJECT-ROLE' not in json.dumps(provider.calls)


def test_wrong_citation_edition_cannot_support_normative_answer(setup):
    def wrong_verify(messages):
        c = body_of_last_tool(messages)['items'][0]['citation']
        return calls(('verify_citation', {**{k:c[k] for k in ('documentId','sectionId','excerpt')}, 'versionId':str(uuid4())}))
    provider = MockProvider(calls(('search_knowledge', {'q':'регистрационный номер'})), wrong_verify, final('Выдуманное нормативное заключение', 'normative'))
    result = runner(setup, provider).run(request(), setup[2])
    assert not result.sources and 'Выдуманное' not in result.text
    assert any(m['role']=='tool' and json.loads(m['content']).get('verified') is False for m in provider.calls[-1])
