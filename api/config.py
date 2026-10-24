"""Session settings shared by every API, including future model endpoints."""
import os
import secrets

DEVELOPMENT_SECRET = 'local-development-only-change-me'


def session_secret():
    mode = os.getenv('REGULA_ENV', 'development')
    if mode not in ('development', 'production'):
        raise RuntimeError('REGULA_ENV must be development or production')
    value = os.getenv('REGULA_SESSION_SECRET', '')
    if not value and mode == 'development':
        # Local launches are safe without a reusable, publicly known signing key.
        return secrets.token_urlsafe(48)
    if len(value) < 32 or value in (DEVELOPMENT_SECRET, 'replace-with-long-random-secret'):
        raise RuntimeError('REGULA_SESSION_SECRET must be a private random secret of at least 32 characters')
    if mode == 'production' and os.getenv('REGULA_SECURE_COOKIE') != '1':
        raise RuntimeError('Production requires HTTPS and REGULA_SECURE_COOKIE=1')
    return value
