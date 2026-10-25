from uuid import UUID
from fastapi import APIRouter, Depends, HTTPException
from .config import AISettings
from .models import ChatRequest, ChatResult
from .runner import AgentRunner, TOOL_LABELS
from .store import ChatStore


def build_chat_router(documents, knowledge, registry, actor, mutation, provider_factory=None):
    router = APIRouter(prefix='/api', tags=['assistant'])

    def settings():
        try:
            return AISettings.from_env()
        except ValueError:
            raise HTTPException(503, 'ai_configuration_error') from None

    @router.get('/chat/config')
    def configuration(user=Depends(actor)):
        config = settings()
        return {'configured': config.configured, 'provider': config.provider, 'model': config.model,
                'processing': 'cloud' if config.provider == 'deepseek' else 'local', 'syntheticOnly': True}

    @router.post('/chat', response_model=ChatResult)
    def chat(body: ChatRequest, user=Depends(mutation)):
        config = settings()
        provider = provider_factory(config) if provider_factory else None
        return AgentRunner(documents(), knowledge(), registry(), config, provider).run(body, user)

    @router.get('/chat/{conversation_id}/requests/{request_id}')
    def status(conversation_id: UUID, request_id: UUID, user=Depends(actor)):
        result = ChatStore(documents()).status(user['deviceId'], str(conversation_id), str(request_id))
        for step in result['tools']:
            step['label'] = TOOL_LABELS.get(step['name'], step['name'])
        return result

    @router.get('/chat/{conversation_id}/history')
    def history(conversation_id: UUID, user=Depends(actor)):
        return ChatStore(documents()).public_history(user['deviceId'], str(conversation_id))

    return router
