CREATE TABLE IF NOT EXISTS knowledge_migrations (version INTEGER PRIMARY KEY);
CREATE TABLE IF NOT EXISTS knowledge_documents (
 id TEXT PRIMARY KEY, title TEXT NOT NULL, category TEXT NOT NULL,
 description TEXT NOT NULL, owner TEXT, access_level TEXT NOT NULL,
 material_nature TEXT NOT NULL, created_at TEXT NOT NULL, updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS knowledge_versions (
 id TEXT PRIMARY KEY, document_id TEXT NOT NULL REFERENCES knowledge_documents(id),
 version_label TEXT, effective_from TEXT, effective_until TEXT, status TEXT NOT NULL,
 status_evidence TEXT, checksum TEXT NOT NULL, filename TEXT NOT NULL,
 file_type TEXT NOT NULL, page_count INTEGER, created_at TEXT NOT NULL,
 indexed_at TEXT, warnings TEXT NOT NULL, extractor TEXT NOT NULL,
 UNIQUE(document_id, checksum)
);
CREATE TABLE IF NOT EXISTS knowledge_sections (
 id TEXT PRIMARY KEY, version_id TEXT NOT NULL REFERENCES knowledge_versions(id),
 parent_id TEXT REFERENCES knowledge_sections(id), section_number TEXT,
 heading TEXT NOT NULL, locator TEXT NOT NULL, text TEXT NOT NULL,
 table_json TEXT, page_start INTEGER, page_end INTEGER, position INTEGER NOT NULL,
 confidence TEXT NOT NULL, UNIQUE(version_id, position)
);
CREATE TABLE IF NOT EXISTS knowledge_chunks (
 id TEXT PRIMARY KEY, section_id TEXT NOT NULL REFERENCES knowledge_sections(id),
 text TEXT NOT NULL, search_metadata TEXT NOT NULL,
 embedding_status TEXT NOT NULL DEFAULT 'not_configured'
);
CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts USING fts5(
 section_id UNINDEXED, version_id UNINDEXED, title, section_number, heading, text,
 tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);
CREATE TABLE IF NOT EXISTS knowledge_audit (
 id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, action TEXT NOT NULL,
 document_id TEXT, version_id TEXT, created_at TEXT NOT NULL, detail TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS knowledge_version_document ON knowledge_versions(document_id);
CREATE INDEX IF NOT EXISTS knowledge_section_version ON knowledge_sections(version_id, position);
CREATE INDEX IF NOT EXISTS knowledge_chunk_section ON knowledge_chunks(section_id);
INSERT OR IGNORE INTO knowledge_migrations VALUES (1);
