import hashlib
import json
from pathlib import Path

from .models import Principal, UploadMetadata
from .service import KnowledgeError, KnowledgeService


def import_case_sources(service: KnowledgeService):
    """Idempotent import of the exact synthetic originals supplied by the user.

    Stable document IDs + content-derived edition IDs preserve links across
    installations. No effective dates, edition labels or active status inferred.
    """
    root = Path(__file__).parent / 'sources'
    principal = Principal(id='system:bundled-synthetic-case', role='knowledge_admin')
    for entry in json.loads((root / 'manifest.json').read_text()):
        content = (root / entry['file']).read_bytes()
        if hashlib.sha256(content).hexdigest() != entry['sha256']:
            raise KnowledgeError('bundled_source_integrity_error', 500)
        with service.db() as db:
            exists = db.execute('SELECT 1 FROM knowledge_documents WHERE id=?', (entry['id'],)).fetchone()
            imported = db.execute('SELECT 1 FROM knowledge_versions WHERE document_id=? AND checksum=?', (entry['id'], entry['sha256'])).fetchone()
        if imported:
            continue
        metadata = UploadMetadata(title=entry['title'], category=entry['category'], description=entry['description'], materialNature='synthetic')
        mime = 'application/pdf' if entry['file'].endswith('.pdf') else 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
        service.upload(principal, metadata, content, entry['originalFilename'], mime,
                       document_id=entry['id'] if exists else None, new_document_id=entry['id'])
