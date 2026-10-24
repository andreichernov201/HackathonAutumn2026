import hashlib
import json
import re
import sqlite3
from contextlib import contextmanager
from datetime import date, datetime, timezone
from pathlib import Path
from uuid import UUID, uuid4, uuid5

from .extract import EXTRACTOR, extract
from .text import stem, stem_text
from .models import (
    CitationArg, CitationVerification, DocumentPage, KnowledgeCitation,
    KnowledgeDocument, KnowledgeSection, KnowledgeVersion, ListArgs, Principal,
    SearchArgs, SearchHit, SearchPage, SectionPage, SectionSummary, UploadMetadata, VersionPage,
)


def now():
    return datetime.now(timezone.utc).isoformat()


class KnowledgeError(Exception):
    def __init__(self, code: str, status: int = 422):
        self.code, self.status = code, status


class KnowledgeService:
    """HTTP and AI tools share this permission-enforcing application service."""

    def __init__(self, root: Path, db_path: Path):
        self.root = root / 'knowledge'
        self.root.mkdir(parents=True, exist_ok=True, mode=0o700)
        self.db_path = db_path
        with self.db() as db:
            db.executescript((Path(__file__).parent / 'migrations/001_knowledge.sql').read_text())
            if not db.execute('SELECT 1 FROM knowledge_migrations WHERE version=2').fetchone():
                db.executescript((Path(__file__).parent / 'migrations/002_russian_search.sql').read_text())
                for row in db.execute('SELECT id FROM knowledge_versions').fetchall():
                    self._index(db, row['id'])

    @contextmanager
    def db(self):
        db = sqlite3.connect(self.db_path, timeout=15)
        db.row_factory = sqlite3.Row
        db.create_function('casefold', 1, lambda value: value.casefold(), deterministic=True)
        db.execute('PRAGMA foreign_keys=ON')
        try:
            with db:
                yield db
        finally:
            db.close()

    @staticmethod
    def acl(principal: Principal):
        return ('1=1', []) if principal.role == 'knowledge_admin' else ("d.access_level='internal'", [])

    @staticmethod
    def require_admin(principal: Principal):
        if principal.role != 'knowledge_admin':
            raise KnowledgeError('knowledge_admin_required', 403)

    def _document_row(self, db, principal, document_id):
        acl, params = self.acl(principal)
        row = db.execute(f'SELECT d.* FROM knowledge_documents d WHERE d.id=? AND {acl}', [str(document_id), *params]).fetchone()
        if row is None:
            raise KnowledgeError('knowledge_document_not_found', 404)
        return row

    def _version_row(self, db, principal, version_id):
        row = db.execute('SELECT * FROM knowledge_versions WHERE id=?', (str(version_id),)).fetchone()
        if row is None:
            raise KnowledgeError('knowledge_version_not_found', 404)
        self._document_row(db, principal, row['document_id'])
        return row

    @staticmethod
    def _version(row):
        return KnowledgeVersion(
            id=row['id'], documentId=row['document_id'], versionLabel=row['version_label'],
            effectiveFrom=row['effective_from'], effectiveUntil=row['effective_until'],
            status=row['status'], statusEvidence=row['status_evidence'], checksum=row['checksum'],
            filename=row['filename'], fileType=row['file_type'], pageCount=row['page_count'],
            createdAt=row['created_at'], indexedAt=row['indexed_at'],
            extractionWarnings=json.loads(row['warnings']), extractor=row['extractor'],
            originalUrl=f"/api/knowledge/versions/{row['id']}/original",
        )

    def _document(self, db, row, version=None):
        version = version or db.execute('SELECT * FROM knowledge_versions WHERE document_id=? ORDER BY created_at DESC, id LIMIT 1', (row['id'],)).fetchone()
        return KnowledgeDocument(
            id=row['id'], title=row['title'], category=row['category'], description=row['description'],
            owner=row['owner'], accessLevel=row['access_level'], materialNature=row['material_nature'],
            createdAt=row['created_at'], updatedAt=row['updated_at'], latestVersion=self._version(version),
        )

    @staticmethod
    def _filters(args, principal):
        where, params = KnowledgeService.acl(principal)
        for field, column in [('category', 'd.category'), ('status', 'v.status'), ('fileType', 'v.file_type')]:
            if value := getattr(args, field, None):
                where += f' AND {column}=?'
                params.append(value)
        if args.status == 'active':
            today = date.today().isoformat()
            where += ' AND v.effective_from<=? AND (v.effective_until IS NULL OR v.effective_until>=?)'
            params += [today, today]
        return where, params

    def list_knowledge_documents(self, principal: Principal, args: ListArgs) -> DocumentPage:
        where, params = self._filters(args, principal)
        if args.q and args.q.strip():
            where += " AND instr(casefold(d.title || ' ' || d.description || ' ' || COALESCE(d.owner,'')), ?) > 0"
            params.append(args.q.strip().casefold())
        order = {'title': 'd.title COLLATE NOCASE ASC', 'createdAt': 'd.created_at DESC', 'updatedAt': 'd.updated_at DESC'}[args.sort]
        with self.db() as db:
            base = f'FROM knowledge_documents d JOIN knowledge_versions v ON v.document_id=d.id WHERE {where}'
            total = db.execute(f'SELECT COUNT(DISTINCT d.id) {base}', params).fetchone()[0]
            rows = db.execute(f'SELECT DISTINCT d.* {base} ORDER BY {order}, d.id LIMIT ? OFFSET ?', [*params, args.limit, args.offset]).fetchall()
            items = []
            for row in rows:
                version = db.execute(f'SELECT v.* {base} AND d.id=? ORDER BY v.created_at DESC, v.id LIMIT 1', [*params, row['id']]).fetchone()
                items.append(self._document(db, row, version))
        return DocumentPage(items=items, total=total, limit=args.limit, offset=args.offset)

    def get_knowledge_document(self, principal: Principal, document_id: UUID | str) -> KnowledgeDocument:
        with self.db() as db:
            return self._document(db, self._document_row(db, principal, document_id))

    def list_knowledge_versions(self, principal: Principal, document_id: UUID | str, limit=100, offset=0) -> VersionPage:
        with self.db() as db:
            self._document_row(db, principal, document_id)
            total = db.execute('SELECT COUNT(*) FROM knowledge_versions WHERE document_id=?', (str(document_id),)).fetchone()[0]
            rows = db.execute('SELECT * FROM knowledge_versions WHERE document_id=? ORDER BY created_at DESC, id LIMIT ? OFFSET ?', (str(document_id), limit, offset)).fetchall()
        return VersionPage(items=[self._version(row) for row in rows], total=total, limit=limit, offset=offset)

    @staticmethod
    def _summary(row):
        return SectionSummary(
            id=row['id'], documentVersionId=row['version_id'], parentId=row['parent_id'],
            sectionNumber=row['section_number'], heading=row['heading'], locator=row['locator'],
            pageStart=row['page_start'], pageEnd=row['page_end'], position=row['position'],
            locatorConfidence=row['confidence'],
        )

    def sections(self, principal: Principal, version_id: UUID | str, limit=1000, offset=0) -> SectionPage:
        with self.db() as db:
            self._version_row(db, principal, version_id)
            total = db.execute('SELECT COUNT(*) FROM knowledge_sections WHERE version_id=?', (str(version_id),)).fetchone()[0]
            rows = db.execute('SELECT * FROM knowledge_sections WHERE version_id=? ORDER BY position LIMIT ? OFFSET ?', (str(version_id), limit, offset)).fetchall()
        return SectionPage(items=[self._summary(row) for row in rows], total=total, limit=limit, offset=offset)

    def _citation(self, db, row, version, document, excerpt=None):
        original = f"/api/knowledge/versions/{version['id']}/original"
        if row['page_start']:
            original += f"#page={row['page_start']}"
        locators = [row['locator']]
        parent_id = row['parent_id']
        while parent_id:
            parent = db.execute('SELECT locator,parent_id FROM knowledge_sections WHERE id=?', (parent_id,)).fetchone()
            locators.insert(0, parent['locator'])
            parent_id = parent['parent_id']
        locator = ' / '.join(locators)
        return KnowledgeCitation(
            id=row['id'], documentId=document['id'], versionId=version['id'], sectionId=row['id'],
            title=document['title'], locator=locator, excerpt=excerpt if excerpt is not None else row['text'][:12000],
            sourceReference=f"/#knowledge/sections/{row['id']}", originalUrl=original,
            versionLabel=version['version_label'], status=version['status'], checksum=version['checksum'],
            materialNature=document['material_nature'],
        )

    def get_knowledge_section(self, principal: Principal, section_id: UUID | str) -> KnowledgeSection:
        with self.db() as db:
            row = db.execute('SELECT * FROM knowledge_sections WHERE id=?', (str(section_id),)).fetchone()
            if row is None:
                raise KnowledgeError('knowledge_section_not_found', 404)
            version = self._version_row(db, principal, row['version_id'])
            document = self._document_row(db, principal, version['document_id'])
            return KnowledgeSection(**self._summary(row).model_dump(), text=row['text'], table=json.loads(row['table_json']) if row['table_json'] else None, source=self._citation(db, row, version, document))

    @staticmethod
    def _fts_query(query):
        query = query.strip()
        if query.startswith('"') and query.endswith('"'):
            terms = re.findall(r'[\w]+', query, re.UNICODE)
            return '"' + ' '.join(terms) + '"' if terms else None
        terms = re.findall(r'\d+(?:\.\d+)+|[\w]+', query.lower(), re.UNICODE)
        stop = {'кто', 'когда', 'какие', 'какой', 'должен', 'должны', 'для', 'при', 'это', 'как', 'что', 'где', 'или', 'про', 'the'}
        terms = list(dict.fromkeys(t for t in terms if len(t) > 1 and t not in stop or t.isdigit()))[:30]
        # FTS syntax is constructed from tokens only; SQL and FTS operators are never accepted.
        return ' OR '.join('"' + (stem(term) if not any(c.isdigit() for c in term) else term) + '"*' for term in terms) or None

    def search_knowledge(self, principal: Principal, args: SearchArgs) -> SearchPage:
        query = self._fts_query(args.q)
        if not query:
            return SearchPage(items=[], total=0, limit=args.limit, offset=args.offset, message='Нет подтверждённого основания: уточните поисковую фразу.')
        where, params = self._filters(args, principal)
        if args.versionId:
            where += ' AND v.id=?'
            params.append(str(args.versionId))
        if not args.includeTemplates and args.category != 'template':
            where += " AND d.category!='template'"
        index = 'knowledge_fts' if args.q.strip().startswith('"') and args.q.strip().endswith('"') else 'knowledge_fts_ru'
        base = f'''FROM {index}
            JOIN knowledge_sections s ON s.id={index}.section_id
            JOIN knowledge_versions v ON v.id=s.version_id
            JOIN knowledge_documents d ON d.id=v.document_id
            WHERE {index} MATCH ? AND {where}'''
        with self.db() as db:
            total = db.execute('SELECT COUNT(*) ' + base, [query, *params]).fetchone()[0]
            rows = db.execute(f'SELECT s.*, bm25({index},0,0,6,8,4,1) AS rank ' + base + ' ORDER BY rank, s.id LIMIT ? OFFSET ?', [query, *params, args.limit, args.offset]).fetchall()
            items = []
            for row in rows:
                version = self._version_row(db, principal, row['version_id'])
                document = self._document_row(db, principal, version['document_id'])
                # Snippet remains an exact substring; no generated or HTML-marked text.
                tokens = re.findall(r'\w+', args.q.lower())
                positions = [row['text'].lower().find(t) for t in tokens if len(t) > 2]
                start = max(0, min((p for p in positions if p >= 0), default=0) - 100)
                snippet = row['text'][start:start+500]
                items.append(SearchHit(section=self._summary(row), citation=self._citation(db, row, version, document, snippet), snippet=snippet, score=-row['rank']))
        return SearchPage(items=items, total=total, limit=args.limit, offset=args.offset, message=None if total else 'Нет подтверждённого основания в доступных материалах. Попробуйте другую фразу.')

    def verify_citation(self, principal: Principal, args: CitationArg) -> CitationVerification:
        section = self.get_knowledge_section(principal, args.sectionId)
        source = section.source
        if source.documentId != str(args.documentId) or source.versionId != str(args.versionId):
            return CitationVerification(verified=False, reason='source_mismatch')
        self.original(principal, args.versionId)
        if args.excerpt not in section.text:
            return CitationVerification(verified=False, reason='excerpt_not_found')
        source.excerpt = args.excerpt
        return CitationVerification(verified=True, reason='exact_excerpt', citation=source)

    @staticmethod
    def audit(db, principal, action, document_id, version_id, detail):
        db.execute('INSERT INTO knowledge_audit VALUES (?,?,?,?,?,?,?)', (str(uuid4()), principal.id, action, document_id, version_id, now(), json.dumps(detail, ensure_ascii=False)))

    def upload(self, principal: Principal, metadata: UploadMetadata, content: bytes, filename: str, mime: str, document_id=None, *, new_document_id=None) -> KnowledgeDocument:
        self.require_admin(principal)
        filename = Path(filename.replace('\\', '/')).name[:200]
        file_type = filename.rsplit('.', 1)[-1].lower()
        try:
            extracted = extract(content, file_type, mime)
        except ValueError as exc:
            raise KnowledgeError(str(exc)) from exc
        digest = hashlib.sha256(content).hexdigest()
        new_document = document_id is None
        document_id = str(document_id or new_document_id or uuid4())
        version_id = str(uuid5(UUID(document_id), digest))
        path = self.root / f'{version_id}.{file_type}'
        timestamp = now()
        created_file = False
        try:
            with self.db() as db:
                if not new_document:
                    old = self._document_row(db, principal, document_id)
                    # An edition cannot silently change classification, ACL or provenance.
                    if (old['category'], old['access_level'], old['material_nature']) != (metadata.category, metadata.accessLevel, metadata.materialNature):
                        raise KnowledgeError('version_metadata_mismatch')
                if db.execute('SELECT 1 FROM knowledge_versions WHERE document_id=? AND checksum=?', (document_id, digest)).fetchone():
                    raise KnowledgeError('duplicate_version', 409)
                if new_document:
                    db.execute('INSERT INTO knowledge_documents VALUES (?,?,?,?,?,?,?,?,?)', (document_id, metadata.title, metadata.category, metadata.description, metadata.owner, metadata.accessLevel, metadata.materialNature, timestamp, timestamp))
                else:
                    db.execute('UPDATE knowledge_documents SET updated_at=? WHERE id=?', (timestamp, document_id))
                db.execute('INSERT INTO knowledge_versions VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)', (version_id, document_id, metadata.versionLabel, metadata.effectiveFrom.isoformat() if metadata.effectiveFrom else None, metadata.effectiveUntil.isoformat() if metadata.effectiveUntil else None, metadata.status, metadata.statusEvidence, digest, filename, file_type, extracted.page_count, timestamp, None, json.dumps(extracted.warnings, ensure_ascii=False), EXTRACTOR))
                ids = [str(uuid5(UUID(version_id), f'section:{i}')) for i in range(len(extracted.sections))]
                for i, section in enumerate(extracted.sections):
                    db.execute('INSERT INTO knowledge_sections VALUES (?,?,?,?,?,?,?,?,?,?,?,?)', (ids[i], version_id, ids[section.parent] if section.parent is not None else None, section.number, section.heading, section.locator, section.text, json.dumps(section.table, ensure_ascii=False) if section.table else None, section.page_start, section.page_end, i, section.confidence))
                self._index(db, version_id)
                with path.open('xb') as stream:
                    created_file = True
                    stream.write(content)
                path.chmod(0o600)
                self.audit(db, principal, 'upload_version', document_id, version_id, {'checksum': digest, 'filename': filename, 'status': metadata.status, 'evidence': metadata.statusEvidence})
        except sqlite3.IntegrityError as exc:
            if created_file:
                path.unlink(missing_ok=True)
            raise KnowledgeError('version_conflict', 409) from exc
        except Exception:
            if created_file:
                path.unlink(missing_ok=True)
            raise
        return self.get_knowledge_document(principal, document_id)

    @staticmethod
    def _index(db, version_id):
        # Rebuild only derived data. Frozen source sections and IDs never change.
        db.execute('DELETE FROM knowledge_fts WHERE version_id=?', (version_id,))
        db.execute('DELETE FROM knowledge_fts_ru WHERE version_id=?', (version_id,))
        db.execute('DELETE FROM knowledge_chunks WHERE section_id IN (SELECT id FROM knowledge_sections WHERE version_id=?)', (version_id,))
        rows = db.execute('SELECT s.*,d.title FROM knowledge_sections s JOIN knowledge_versions v ON v.id=s.version_id JOIN knowledge_documents d ON d.id=v.document_id WHERE s.version_id=?', (version_id,)).fetchall()
        for row in rows:
            db.execute('INSERT INTO knowledge_fts VALUES (?,?,?,?,?,?)', (row['id'], version_id, row['title'], row['section_number'] or '', row['heading'], row['text']))
            db.execute('INSERT INTO knowledge_fts_ru VALUES (?,?,?,?,?,?)', (row['id'], version_id, stem_text(row['title']), row['section_number'] or '', stem_text(row['heading']), stem_text(row['text'])))
            for start in range(0, len(row['text']), 1600):
                chunk_id = str(uuid5(UUID(row['id']), f'chunk:{start}'))
                db.execute('INSERT INTO knowledge_chunks VALUES (?,?,?,?,?)', (chunk_id, row['id'], row['text'][start:start+1800], json.dumps({'versionId': version_id, 'start': start, 'locator': row['locator']}, ensure_ascii=False), 'not_configured'))
        db.execute('UPDATE knowledge_versions SET indexed_at=? WHERE id=?', (now(), version_id))

    def reindex(self, principal: Principal, version_id: UUID | str) -> KnowledgeVersion:
        self.require_admin(principal)
        with self.db() as db:
            version = self._version_row(db, principal, version_id)
            self._index(db, str(version_id))
            self.audit(db, principal, 'reindex', version['document_id'], str(version_id), {})
            return self._version(self._version_row(db, principal, version_id))

    def original(self, principal: Principal, version_id: UUID | str):
        with self.db() as db:
            version = self._version_row(db, principal, version_id)
        path = self.root / f"{version['id']}.{version['file_type']}"
        if not path.is_file() or hashlib.sha256(path.read_bytes()).hexdigest() != version['checksum']:
            raise KnowledgeError('source_integrity_error', 409)
        return path, version['filename'], version['file_type']
