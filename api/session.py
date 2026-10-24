"""Keep device identity independent of the shorter knowledge maintenance grant."""
import os

SESSION_MAX_AGE = 60 * 60 * 24 * 365


def write_session_cookie(response, signer, data):
    response.set_cookie(
        'regula_session', signer.dumps(data), max_age=SESSION_MAX_AGE,
        httponly=True, secure=os.getenv('REGULA_SECURE_COOKIE') == '1', samesite='lax',
    )
