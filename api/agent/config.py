import os
from dataclasses import dataclass, field
from urllib.parse import urlparse


def integer(name, default, low, high):
    try:
        value = int(os.getenv(name, str(default)))
    except ValueError:
        raise ValueError('invalid_ai_configuration') from None
    if not low <= value <= high:
        raise ValueError('invalid_ai_configuration')
    return value


@dataclass(frozen=True)
class AISettings:
    provider: str = 'deepseek'
    api_key: str = field(default='', repr=False)
    model: str = 'deepseek-v4-pro'
    base_url: str = 'https://api.deepseek.com'
    max_tool_steps: int = 16
    request_timeout: int = 90
    max_output_tokens: int = 4096
    max_model_calls: int = 12
    max_total_tokens: int = 80000
    max_context_chars: int = 100000
    requests_per_hour: int = 30
    thinking: bool = True

    @classmethod
    def from_env(cls):
        provider = os.getenv('AI_PROVIDER', 'deepseek')
        if provider not in ('deepseek', 'local_qwen'):
            raise ValueError('invalid_ai_provider')
        local = provider == 'local_qwen'
        model = os.getenv('QWEN_MODEL', '') if local else os.getenv('DEEPSEEK_MODEL', 'deepseek-v4-pro')
        url = os.getenv('QWEN_BASE_URL', 'http://127.0.0.1:8001/v1') if local else os.getenv('DEEPSEEK_BASE_URL', 'https://api.deepseek.com')
        parsed = urlparse(url)
        # Never send a DeepSeek secret to a configurable third-party host.
        if (not local and (model != 'deepseek-v4-pro' or parsed.scheme != 'https' or parsed.hostname != 'api.deepseek.com')) or parsed.username or parsed.password or parsed.query or parsed.fragment:
            raise ValueError('invalid_ai_configuration')
        if local and (parsed.scheme not in ('http', 'https') or not parsed.hostname):
            raise ValueError('invalid_ai_configuration')
        return cls(provider=provider, api_key=os.getenv('QWEN_API_KEY' if local else 'DEEPSEEK_API_KEY', ''), model=model, base_url=url.rstrip('/'),
                   max_tool_steps=integer('AI_MAX_TOOL_STEPS', 16, 1, 64),
                   request_timeout=integer('AI_REQUEST_TIMEOUT', 90, 1, 300),
                   max_output_tokens=integer('AI_MAX_OUTPUT_TOKENS', 4096, 128, 16384),
                   max_model_calls=integer('AI_MAX_MODEL_CALLS', 12, 1, 32),
                   max_total_tokens=integer('AI_MAX_TOTAL_TOKENS', 80000, 1024, 500000),
                   max_context_chars=integer('AI_MAX_CONTEXT_CHARS', 100000, 4096, 200000),
                   requests_per_hour=integer('AI_REQUESTS_PER_HOUR', 30, 1, 1000),
                   thinking=os.getenv('AI_THINKING', '1') == '1')

    @property
    def configured(self):
        return bool(self.model and (self.api_key or self.provider == 'local_qwen'))
