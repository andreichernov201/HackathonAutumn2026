"""Explicit test-only ASGI entry point. Never imported by api.main or Docker CMD.

REGULA_AGENT_BROWSER_TEST=1 REGULA_DATA_DIR=/tmp/... AI_PROVIDER=local_qwen
QWEN_MODEL=scripted-test uvicorn api.tests.agent_browser_app:app --port 8000
"""
import json
import os
from uuid import uuid4

if os.getenv('REGULA_AGENT_BROWSER_TEST') != '1':
    raise RuntimeError('test_app_requires_explicit_opt_in')

from api import main
from api.agent import runner
from api.agent.providers import Completion, ModelMessage


def call(name, args):
    return Completion(message=ModelMessage(role='assistant', reasoning_content='test-private-reasoning', tool_calls=[{'id': str(uuid4()), 'function': {'name': name, 'arguments': json.dumps(args, ensure_ascii=False)}}]), total_tokens=100)


def done(text, kind='document', citations=None):
    return Completion(message=ModelMessage(content=json.dumps({'text': text, 'answerType': kind, 'citations': citations or []}, ensure_ascii=False)), total_tokens=100)


class BrowserTestProvider:
    def complete(self, messages, tools, timeout, max_tokens):
        last_user = max(i for i,m in enumerate(messages) if m['role'] == 'user')
        text = messages[last_user]['content'].lower()
        current = messages[last_user+1:]
        outputs = [json.loads(m['content']) for m in current if m['role'] == 'tool']
        names = [c['function']['name'] for m in current if m['role'] == 'assistant' for c in m.get('tool_calls', [])]
        if 'сбой' in text:
            from api.agent.providers import ProviderError
            raise ProviderError('provider_unavailable')
        if 'номер' in text:
            if not outputs: return call('search_knowledge', {'q': 'Когда присваивается регистрационный номер распоряжению?', 'limit': 3})
            if names[-1] == 'search_knowledge': return call('get_knowledge_section', {'sectionId': outputs[-1]['items'][0]['citation']['sectionId']})
            if names[-1] == 'get_knowledge_section': return call('verify_citation', {k: outputs[-1]['source'][k] for k in ('documentId','versionId','sectionId','excerpt')})
            return done('Регистрационный номер присваивается после подписания согласно пункту 2.1.', 'normative', [{k: outputs[-1]['citation'][k] for k in ('documentId','versionId','sectionId','excerpt')}])
        if 'создай' in text and 'систем' in text:
            if not outputs: return call('list_templates', {})
            if names[-1] == 'list_templates': return call('get_template', {'templateId': 'system-commissioning-order'})
            if names[-1] == 'get_template': return call('create_document_project', {'templateId': 'system-commissioning-order'})
            if names[-1] == 'create_document_project': return call('validate_document_project', {'projectId': outputs[-1]['projectId']})
            return done('Создан проект приказа. Заполните обязательные поля.')
        if 'ответственный' in text or 'секретар' in text:
            if not outputs:
                context = json.loads(next(m['content'].split(': ',1)[1] for m in reversed(messages) if m['role']=='system' and m['content'].startswith('Текущий серверный контекст')))
                return call('get_document_project', {'projectId': context['projectId']})
            if names[-1] == 'get_document_project':
                p = outputs[-1]
                fields = {'responsible': 'Иванов', 'effectiveDate': '2026-12-01'} if 'ответственный' in text else {'secretary': 'Петрова Анна Сергеевна'}
                return call('update_document_fields', {'projectId': p['projectId'], 'expectedVersion': p['version'], 'fields': fields})
            if names[-1] == 'update_document_fields': return call('validate_document_project', {'projectId': outputs[-1]['projectId']})
            return done('Известные реквизиты сохранены. Остальные поля заполните в форме.')
        if 'создай' in text or 'приказ' in text:
            if not outputs: return call('list_templates', {})
            return Completion(message=ModelMessage(content=json.dumps({'text':'Выберите подходящий модуль.', 'answerType':'document', 'suggestedTemplateIds':[t['templateId'] for t in outputs[-1]]}, ensure_ascii=False)), total_tokens=100)
        return done('Нет подтверждённого источника для нормативного вывода.', 'normative')


runner.make_provider = lambda _: BrowserTestProvider()
app = main.app
