"""Only HTTP inference lives here; no document or search business logic."""
import time
from typing import Protocol

import httpx
from pydantic import BaseModel, ConfigDict, Field, ValidationError

from .config import AISettings


class ProviderError(Exception):
    """Public error codes only. Never retain upstream bodies or credentials."""


class FunctionCall(BaseModel):
    name: str = Field(min_length=1, max_length=100)
    arguments: str = Field(max_length=32000)


class ModelToolCall(BaseModel):
    id: str = Field(min_length=1, max_length=200)
    type: str = 'function'
    function: FunctionCall


class ModelMessage(BaseModel):
    model_config = ConfigDict(extra='ignore')
    role: str = 'assistant'
    content: str | None = Field(default=None, max_length=64000)
    reasoning_content: str | None = Field(default=None, max_length=200000)
    tool_calls: list[ModelToolCall] | None = Field(default=None, max_length=16)


class Completion(BaseModel):
    message: ModelMessage
    total_tokens: int = Field(default=0, ge=0)
    finish_reason: str = 'stop'


class AIProvider(Protocol):
    def complete(self, messages: list[dict], tools: list[dict], timeout: float, max_tokens: int) -> Completion: ...


class CompatibleProvider:
    def __init__(self, settings: AISettings, transport=None):
        self.settings, self.transport = settings, transport

    def extra_body(self):
        return {}

    def complete(self, messages, tools, timeout, max_tokens):
        config = self.settings
        headers = {'Authorization': f'Bearer {config.api_key}'} if config.api_key else {}
        deadline = time.monotonic() + timeout
        try:
            # No HTTP retries: mutations are journaled by the runner, never replayed by the transport.
            with httpx.Client(timeout=httpx.Timeout(timeout, connect=min(10, timeout)), transport=self.transport, follow_redirects=False, trust_env=False) as client:
                with client.stream('POST', config.base_url + '/chat/completions', headers=headers,
                                   json={'model': config.model, 'messages': messages, 'tools': tools,
                                         'max_tokens': max_tokens, 'stream': False, **self.extra_body()}) as response:
                    if response.status_code == 429:
                        raise ProviderError('provider_rate_limited')
                    if response.status_code in (401, 403):
                        raise ProviderError('provider_auth_failed')
                    if response.status_code != 200:
                        raise ProviderError('provider_unavailable')
                    content = bytearray()
                    for chunk in response.iter_bytes():
                        if time.monotonic() >= deadline:
                            raise ProviderError('provider_timeout')
                        content.extend(chunk)
                        if len(content) > 2_000_000:
                            raise ProviderError('provider_invalid_response')
            import json
            body = json.loads(content)
            choice = body['choices'][0]
            result = Completion(message=ModelMessage.model_validate(choice['message']),
                                total_tokens=body.get('usage', {}).get('total_tokens', 0),
                                finish_reason=choice.get('finish_reason', 'stop'))
            if result.message.role != 'assistant' or any(c.type != 'function' for c in result.message.tool_calls or []):
                raise ProviderError('provider_invalid_response')
            return result
        except httpx.TimeoutException:
            raise ProviderError('provider_timeout') from None
        except httpx.HTTPError:
            raise ProviderError('provider_unavailable') from None
        except (ValueError, KeyError, IndexError, TypeError, ValidationError):
            raise ProviderError('provider_invalid_response') from None


class DeepSeekProvider(CompatibleProvider):
    def extra_body(self):
        return {'response_format': {'type': 'json_object'},
                'thinking': {'type': 'enabled' if self.settings.thinking else 'disabled'},
                **({'reasoning_effort': 'high'} if self.settings.thinking else {})}


class LocalQwenProvider(CompatibleProvider):
    """OpenAI-compatible endpoint. Tool/thinking compatibility must be qualified per deployment."""


def make_provider(settings):
    return (DeepSeekProvider if settings.provider == 'deepseek' else LocalQwenProvider)(settings)
