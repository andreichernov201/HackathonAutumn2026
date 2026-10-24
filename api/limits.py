"""Bound the entire HTTP body before multipart parsing, including chunked uploads."""
from fastapi import HTTPException
from fastapi.responses import JSONResponse

MAX_REQUEST_BYTES = 22 * 1024 * 1024  # 20 MiB file plus multipart metadata/overhead.


class RequestSizeLimitMiddleware:
    def __init__(self, app, max_bytes=MAX_REQUEST_BYTES):
        self.app = app
        self.max_bytes = max_bytes

    async def __call__(self, scope, receive, send):
        if scope['type'] != 'http' or not scope['path'].startswith('/api/'):
            return await self.app(scope, receive, send)
        headers = dict(scope.get('headers', []))
        length = headers.get(b'content-length', b'')
        if length.isdigit() and int(length) > self.max_bytes:
            return await JSONResponse({'detail': 'invalid_file_size'}, status_code=413)(scope, receive, send)
        received = 0

        async def bounded_receive():
            nonlocal received
            message = await receive()
            if message['type'] == 'http.request':
                received += len(message.get('body', b''))
                if received > self.max_bytes:
                    raise HTTPException(413, 'invalid_file_size')
            return message

        await self.app(scope, bounded_receive, send)
