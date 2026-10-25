"""Additive tables in the existing SQLite database, including a durable execution journal.

A started mutation is never replayed after a crash. Reasoning is private server-side
transcript data, never returned by the history/status endpoints or application logs.
"""
import json
import time
from uuid import uuid4
from fastapi import HTTPException


class ChatStore:
    def __init__(self, documents):
        self.documents = documents
        with documents.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS ai_conversations (
                id TEXT NOT NULL, owner TEXT NOT NULL, project_id TEXT,
                source TEXT, PRIMARY KEY(owner,id));
            CREATE TABLE IF NOT EXISTS ai_requests (
                id TEXT NOT NULL, owner TEXT NOT NULL, conversation_id TEXT NOT NULL,
                digest TEXT NOT NULL, created REAL NOT NULL, state TEXT NOT NULL,
                result TEXT, PRIMARY KEY(owner,id));
            CREATE INDEX IF NOT EXISTS ai_requests_conversation ON ai_requests(owner,conversation_id,created);
            CREATE TABLE IF NOT EXISTS ai_turns (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, conversation_id TEXT NOT NULL,
                request_id TEXT NOT NULL, transcript TEXT NOT NULL, public_user TEXT NOT NULL,
                public_result TEXT NOT NULL, created REAL NOT NULL);
            CREATE INDEX IF NOT EXISTS ai_turns_conversation ON ai_turns(owner,conversation_id,created);
            CREATE TABLE IF NOT EXISTS ai_tool_runs (
                owner TEXT NOT NULL, request_id TEXT NOT NULL, fingerprint TEXT NOT NULL,
                name TEXT NOT NULL, state TEXT NOT NULL, result TEXT,
                PRIMARY KEY(owner,request_id,fingerprint));
            CREATE TABLE IF NOT EXISTS ai_confirmations (
                id TEXT PRIMARY KEY, owner TEXT NOT NULL, conversation_id TEXT NOT NULL,
                project_id TEXT NOT NULL, project_version INTEGER NOT NULL,
                expires REAL NOT NULL, consumed INTEGER NOT NULL DEFAULT 0);
            ''')

    def claim(self, owner, request, digest, settings):
        rid, cid = str(request.requestId), str(request.conversationId)
        with self.documents.db() as db:
            db.execute('BEGIN IMMEDIATE')
            prior = db.execute('SELECT * FROM ai_requests WHERE owner=? AND id=?', (owner, rid)).fetchone()
            if prior:
                if prior['digest'] != digest:
                    raise HTTPException(409, 'idempotency_key_reused')
                if prior['result']:
                    return json.loads(prior['result'])
                # Do not replay uncertain work, including after process restart.
                raise HTTPException(409, 'request_in_progress' if time.time() - prior['created'] < settings.request_timeout + 30 else 'request_interrupted_check_project')
            busy = db.execute("SELECT created FROM ai_requests WHERE owner=? AND conversation_id=? AND state='running' ORDER BY created DESC LIMIT 1", (owner, cid)).fetchone()
            if busy and time.time() - busy['created'] < settings.request_timeout + 30:
                raise HTTPException(409, 'conversation_busy')
            count = db.execute('SELECT COUNT(*) FROM ai_requests WHERE owner=? AND created>?', (owner, time.time()-3600)).fetchone()[0]
            global_count = db.execute('SELECT COUNT(*) FROM ai_requests WHERE created>?', (time.time()-3600,)).fetchone()[0]
            if count >= settings.requests_per_hour or global_count >= settings.requests_per_hour * 10:
                raise HTTPException(429, 'chat_rate_limited')
            db.execute('INSERT OR IGNORE INTO ai_conversations(owner,id) VALUES (?,?)', (owner, cid))
            db.execute('INSERT INTO ai_requests VALUES (?,?,?,?,?,?,NULL)', (rid, owner, cid, digest, time.time(), 'running'))

    def context(self, owner, cid):
        with self.documents.db() as db:
            row = db.execute('SELECT project_id,source FROM ai_conversations WHERE owner=? AND id=?', (owner, cid)).fetchone()
        return dict(row) if row else {'project_id': None, 'source': None}

    def update_context(self, owner, cid, project_id=None, source=None):
        with self.documents.db() as db:
            if project_id:
                db.execute('UPDATE ai_conversations SET project_id=? WHERE owner=? AND id=?', (project_id, owner, cid))
            if source:
                db.execute('UPDATE ai_conversations SET source=? WHERE owner=? AND id=?', (json.dumps(source, ensure_ascii=False), owner, cid))

    def history(self, owner, cid, max_chars):
        with self.documents.db() as db:
            rows = db.execute('SELECT transcript FROM ai_turns WHERE owner=? AND conversation_id=? ORDER BY created DESC LIMIT 12', (owner, cid)).fetchall()
        selected, used = [], 0
        for row in rows:
            if used + len(row['transcript']) > max_chars:
                break  # Whole turns only: tool calls/results must never be orphaned.
            selected.insert(0, json.loads(row['transcript']))
            used += len(row['transcript'])
        return [message for turn in selected for message in turn]

    def finish(self, owner, request, result, transcript):
        public = result.model_dump_json()
        with self.documents.db() as db:
            db.execute('BEGIN IMMEDIATE')
            db.execute('UPDATE ai_requests SET state=?,result=? WHERE owner=? AND id=?', ('done', public, owner, str(request.requestId)))
            # Failed/incomplete tool cycles are not usable model history.
            db.execute('INSERT INTO ai_turns VALUES (?,?,?,?,?,?,?,?)', (str(uuid4()), owner, str(request.conversationId), str(request.requestId), json.dumps(transcript, ensure_ascii=False), request.message, public, time.time()))

    def tool_start(self, owner, rid, fingerprint, name):
        with self.documents.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT state,result FROM ai_tool_runs WHERE owner=? AND request_id=? AND fingerprint=?', (owner, rid, fingerprint)).fetchone()
            if row:
                return json.loads(row['result']) if row['result'] else {'error': 'tool_execution_uncertain'}
            db.execute('INSERT INTO ai_tool_runs VALUES (?,?,?,?,?,NULL)', (owner, rid, fingerprint, name, 'running'))
        return None

    def tool_finish(self, owner, rid, fingerprint, result):
        with self.documents.db() as db:
            db.execute('UPDATE ai_tool_runs SET state=?,result=? WHERE owner=? AND request_id=? AND fingerprint=?', ('done', json.dumps(result, ensure_ascii=False), owner, rid, fingerprint))

    def confirmation(self, owner, cid, project):
        with self.documents.db() as db:
            row = db.execute('SELECT id FROM ai_confirmations WHERE owner=? AND conversation_id=? AND project_id=? AND project_version=? AND consumed=0 AND expires>?', (owner, cid, project.projectId, project.version, time.time())).fetchone()
            token = row['id'] if row else str(uuid4())
            if not row:
                db.execute('INSERT INTO ai_confirmations VALUES (?,?,?,?,?,?,0)', (token, owner, cid, project.projectId, project.version, time.time()+900))
        return {'id': token, 'projectId': project.projectId, 'projectVersion': project.version}

    def consume_confirmation(self, owner, cid, token):
        with self.documents.db() as db:
            db.execute('BEGIN IMMEDIATE')
            row = db.execute('SELECT * FROM ai_confirmations WHERE id=? AND owner=? AND conversation_id=? AND consumed=0 AND expires>?', (str(token), owner, cid, time.time())).fetchone()
            if not row:
                raise HTTPException(409, 'confirmation_expired')
            db.execute('UPDATE ai_confirmations SET consumed=1 WHERE id=?', (str(token),))
        return dict(row)

    def status(self, owner, cid, rid):
        with self.documents.db() as db:
            row = db.execute('SELECT state FROM ai_requests WHERE owner=? AND id=? AND conversation_id=?', (owner, rid, cid)).fetchone()
            if not row:
                raise HTTPException(404, 'request_not_found')
            tools = [dict(x) for x in db.execute('SELECT name,state FROM ai_tool_runs WHERE owner=? AND request_id=? ORDER BY rowid', (owner, rid))]
        return {'state': row['state'], 'tools': tools}

    def public_history(self, owner, cid):
        with self.documents.db() as db:
            rows = db.execute('SELECT request_id,public_user,public_result FROM ai_turns WHERE owner=? AND conversation_id=? ORDER BY created LIMIT 100', (owner, cid)).fetchall()
        return [{'requestId': r['request_id'], 'message': r['public_user'], 'result': json.loads(r['public_result'])} for r in rows]
