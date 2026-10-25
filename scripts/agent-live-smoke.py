"""Opt-in paid smoke against DeepSeek V4 Pro, always using a disposable database."""
import os
import tempfile
from pathlib import Path
from uuid import uuid4

if os.getenv('REGULA_LIVE_AI_SMOKE') != '1' or not os.getenv('DEEPSEEK_API_KEY'):
    raise SystemExit('Set REGULA_LIVE_AI_SMOKE=1 and DEEPSEEK_API_KEY to enable paid synthetic smoke.')

from api.agent.config import AISettings
from api.agent.models import ChatRequest
from api.agent.runner import AgentRunner
from api.knowledge.seed import import_case_sources
from api.knowledge.service import KnowledgeService
from api.service import DocumentsService
from api import main

with tempfile.TemporaryDirectory(prefix='regula-live-ai-') as root:
    main.service = documents = DocumentsService(Path(root))
    main.knowledge_service = knowledge = KnowledgeService(Path(root), documents.db_path)
    import_case_sources(knowledge)
    agent = AgentRunner(documents, knowledge, main.tool_registry, AISettings.from_env())
    user = {'deviceId': str(uuid4()), 'csrf': 'smoke-local-only'}
    for message in ('Когда присваивается регистрационный номер распоряжению?', 'Создай приказ о вводе информационной системы в эксплуатацию. Ответственный Иванов. Дата ввода 1 декабря 2026 года.'):
        result = agent.run(ChatRequest(conversationId=uuid4(), requestId=uuid4(), message=message, syntheticOnlyAcknowledged=True), user)
        assert not result.message, result.message
        if message.startswith('Когда'):
            assert result.sources and any('2.1' in c.locator for c in result.sources)
        else:
            assert result.documentProjectId
            project = documents.get(user['deviceId'], result.documentProjectId)
            assert project.templateId == 'system-commissioning-order'
            assert project.fields.get('effectiveDate') == '2026-12-01'
        # Metrics only: no model text, reasoning, credentials or document content.
        print('PASS', result.usage)
