CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_fts_ru USING fts5(
 section_id UNINDEXED, version_id UNINDEXED, title, section_number, heading, text,
 tokenize='unicode61 remove_diacritics 2', prefix='2 3 4'
);
INSERT OR IGNORE INTO knowledge_migrations VALUES (2);
