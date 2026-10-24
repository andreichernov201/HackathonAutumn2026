import hashlib
import json
import shutil
import sqlite3
import zipfile
from datetime import date, datetime, timezone
from io import BytesIO
from pathlib import Path
from uuid import uuid4

from .models import Artifact, DocumentProject, FieldSpec, Template, Validation, ValidationIssue
from .working_group import render as render_working_group

TEMPLATE_ID = 'working-group-order'
SOURCE_DIR = Path(__file__).parent / 'templates' / 'sources'
CATALOG = [
    (TEMPLATE_ID, 'Распоряжение о создании рабочей группы', 'Распоряжение', 'working-group-order.docx'),
    ('project-committee-order', 'Распоряжение о создании проектного комитета', 'Распоряжение', 'project-committee-order.docx'),
    ('internal-audit-order', 'Распоряжение о проведении внутреннего аудита процессов', 'Распоряжение', 'internal-audit-order.docx'),
    ('system-commissioning-order', 'Приказ о вводе в эксплуатацию информационной системы', 'Приказ', 'system-commissioning-order.docx'),
    ('records-officers-order', 'Приказ о назначении ответственных за делопроизводство', 'Приказ', 'records-officers-order.docx'),
    ('handover-order', 'Приказ о приеме и передаче дел и имущества', 'Приказ', 'handover-order.docx'),
    ('local-act-order', 'Приказ об утверждении и введении в действие локального документа', 'Приказ', 'local-act-order.docx'),
]
FIELDS = [
    FieldSpec(key='organization', label='Наименование организации', section='Основание и предмет'),
    FieldSpec(key='purpose', label='Цель создания группы', section='Основание и предмет', multiline=True),
    FieldSpec(key='subject', label='Предмет работы (одинаков в заголовке и пункте 1)', section='Основание и предмет'),
    FieldSpec(key='chair', label='Руководитель: должность, подразделение, инициалы и фамилия', section='Состав'),
    FieldSpec(key='secretary', label='Секретарь: должность, подразделение, инициалы и фамилия', section='Состав'),
    FieldSpec(key='members', label='Члены группы: должности, подразделения, инициалы и фамилии', section='Состав', multiline=True),
    FieldSpec(key='deadline', label='Конечная дата работы группы', section='Задача и результат', inputType='date'),
    FieldSpec(key='tasks', label='Конкретные действия группы (начните с глагола)', section='Задача и результат', multiline=True),
    FieldSpec(key='result', label='Итоговый документ или результат', section='Задача и результат'),
    FieldSpec(key='recipient', label='Адресат результата (в дательном падеже)', section='Задача и результат'),
    FieldSpec(key='termination', label='Событие завершения работы группы', section='Завершение и контроль'),
    FieldSpec(key='control', label='Контролирующее лицо: должность, подразделение, инициалы и фамилия', section='Завершение и контроль'),
    FieldSpec(key='signer', label='Подписант: инициалы и фамилия', section='Подписант и карточка'),
    FieldSpec(key='signerAuthority', label='Основание полномочий подписанта для проверки', section='Подписант и карточка'),
    FieldSpec(key='department', label='Подразделение-исполнитель', section='Подписант и карточка'),
    FieldSpec(key='executor', label='Ответственный исполнитель', section='Подписант и карточка'),
    FieldSpec(key='accessLevel', label='Уровень доступа', section='Подписант и карточка'),
    FieldSpec(key='attachments', label='Приложения при наличии', section='Подписант и карточка', required=False, multiline=True),
]

def now(): return datetime.now(timezone.utc).isoformat()

class DocumentsService:
    def __init__(self, root: Path):
        self.root = root
        root.mkdir(parents=True, exist_ok=True)
        (root / 'templates').mkdir(exist_ok=True)
        self.db_path = root / 'documents.sqlite3'
        with self.db() as db:
            db.executescript('''
            CREATE TABLE IF NOT EXISTS templates (id TEXT PRIMARY KEY, version TEXT, status TEXT NOT NULL, filename TEXT, sha TEXT, mapping TEXT);
            CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, owner TEXT NOT NULL, template_id TEXT NOT NULL, template_version TEXT, title TEXT NOT NULL, fields TEXT NOT NULL, status TEXT NOT NULL, version INTEGER NOT NULL, created TEXT NOT NULL, updated TEXT NOT NULL);
            CREATE TABLE IF NOT EXISTS artifacts (id TEXT PRIMARY KEY, project_id TEXT NOT NULL, owner TEXT NOT NULL, project_version INTEGER NOT NULL, created TEXT NOT NULL, filename TEXT NOT NULL, sha TEXT NOT NULL);
            ''')
            for template_id, _, _, filename in CATALOG:
                source = SOURCE_DIR / filename
                digest = hashlib.sha256(source.read_bytes()).hexdigest()
                stored = root / 'templates' / f'{digest}.docx'
                if not stored.exists(): shutil.copyfile(source, stored)
                status = 'ready' if template_id == TEMPLATE_ID else 'awaiting_schema'
                version = f'sha256:{digest}'
                db.execute('INSERT OR IGNORE INTO templates VALUES (?,?,?,?,?,?)', (template_id, version, status, filename, digest, None))
                if template_id == TEMPLATE_ID:
                    db.execute("UPDATE templates SET version=?, status='ready', filename=?, sha=? WHERE id=? AND status='awaiting_source'", (version, filename, digest, template_id))

    def db(self):
        db = sqlite3.connect(self.db_path)
        db.row_factory = sqlite3.Row
        return db

    def template(self, template_id: str) -> Template | None:
        metadata = next((item for item in CATALOG if item[0] == template_id), None)
        if not metadata: return None
        with self.db() as db:
            row = db.execute('SELECT * FROM templates WHERE id=?', (template_id,)).fetchone()
        note = ('Исходный синтетический DOCX загружен. Схема заполнения проверена по модулю и методическим рекомендациям.' if template_id == TEMPLATE_ID else 'Исходный синтетический DOCX загружен; схема полей и генератор ещё не подготовлены.')
        return Template(templateId=template_id, title=metadata[1], kind=metadata[2], templateVersion=row['version'], sourceStatus=row['status'], registryStatus='unverified', sourceFilename=row['filename'], sourceSha256=row['sha'], fields=FIELDS if template_id == TEMPLATE_ID else [], note=note)

    def list_templates(self): return [self.template(item[0]) for item in CATALOG]

    def create(self, owner: str, template_id: str, title: str):
        template = self.template(template_id)
        if not template: raise ValueError('template_not_found')
        if template.sourceStatus != 'ready': raise ValueError('template_schema_not_ready')
        project_id, ts = str(uuid4()), now()
        with self.db() as db:
            db.execute('INSERT INTO projects VALUES (?,?,?,?,?,?,?,?,?,?)', (project_id, owner, template_id, template.templateVersion, title.strip() or 'Новый проект распоряжения', '{}', 'draft', 1, ts, ts))
        return self.get(owner, project_id)

    def _validation(self, fields: dict[str,str], template: Template, project_version: str | None) -> Validation:
        issues = [ValidationIssue(code='required', field=spec.key, message=f'Заполните поле «{spec.label}»') for spec in template.fields if spec.required and not fields.get(spec.key, '').strip()]
        if fields.get('deadline'):
            try: date.fromisoformat(fields['deadline'])
            except ValueError: issues.append(ValidationIssue(code='invalid_date', field='deadline', message='Укажите корректную дату срока'))
        if template.sourceStatus != 'ready': issues.append(ValidationIssue(code='source_not_ready', message='Схема исходного DOCX не готова'))
        if project_version != template.templateVersion: issues.append(ValidationIssue(code='template_version_changed', message='Версия исходного модуля изменилась. Создайте новый проект из текущей версии.'))
        total = sum(spec.required for spec in template.fields)
        return Validation(ready=not issues, completed=total-sum(issue.code == 'required' for issue in issues), total=total, issues=issues)

    def _project(self, row):
        template = self.template(row['template_id'])
        fields = json.loads(row['fields'])
        with self.db() as db:
            artifacts = [Artifact(artifactId=a['id'], projectVersion=a['project_version'], createdAt=a['created'], filename=a['filename'], sha256=a['sha']) for a in db.execute('SELECT * FROM artifacts WHERE project_id=? ORDER BY created DESC', (row['id'],))]
        sections = self.preview(fields)
        return DocumentProject(projectId=row['id'], templateId=row['template_id'], templateVersion=row['template_version'], title=row['title'], fields=fields, status=row['status'], version=row['version'], createdAt=row['created'], updatedAt=row['updated'], sourceStatus=template.sourceStatus, validation=self._validation(fields, template, row['template_version']), artifacts=artifacts, preview=sections)

    def preview(self, fields: dict[str,str]):
        def v(key): return fields.get(key, '').strip() or '…'
        deadline = fields.get('deadline', '')
        try:
            parsed = date.fromisoformat(deadline)
            deadline = f'«{parsed.day:02d}» {("января", "февраля", "марта", "апреля", "мая", "июня", "июля", "августа", "сентября", "октября", "ноября", "декабря")[parsed.month-1]} {parsed.year} г.'
        except ValueError: deadline = '…'
        return [
            {'section':'Реквизиты', 'label':'Организация', 'value':v('organization')},
            {'section':'Заголовок', 'label':'Распоряжение', 'value':f'О создании рабочей группы по {v("subject")}'},
            {'section':'Преамбула', 'label':'Основание', 'value':f'В целях {v("purpose")},'},
            {'section':'Пункт 1', 'label':'Создание и состав', 'value':f'Создать рабочую группу по {v("subject")} в составе: руководитель — {v("chair")}; секретарь — {v("secretary")}; члены — {v("members")}'},
            {'section':'Пункт 2', 'label':'Срок, задача, результат', 'value':f'Рабочей группе до {deadline} {v("tasks")} и представить {v("result")} {v("recipient")}'},
            {'section':'Пункты 3–4', 'label':'Постоянные положения модуля', 'value':'Руководитель организует работу и распределяет задачи. Секретарь оформляет результаты заседаний и хранит материалы.'},
            {'section':'Пункт 5', 'label':'Завершение деятельности', 'value':f'Рабочая группа прекращает деятельность после {v("termination")}'},
            {'section':'Пункт 6', 'label':'Контроль', 'value':f'Контроль за исполнением возложить на {v("control")}'},
            {'section':'Подписант', 'label':'В исходном модуле указан заместитель Председателя Организации', 'value':v('signer')},
        ]

    def get(self, owner: str, project_id: str):
        with self.db() as db:
            row = db.execute('SELECT * FROM projects WHERE id=? AND owner=?', (project_id, owner)).fetchone()
        return self._project(row) if row else None

    def list_projects(self, owner: str):
        with self.db() as db:
            rows = db.execute('SELECT * FROM projects WHERE owner=? ORDER BY updated DESC', (owner,)).fetchall()
        return [self._project(row) for row in rows]

    def patch(self, owner: str, project_id: str, expected: int, fields: dict[str,str], title: str | None):
        allowed = {f.key for f in FIELDS}
        if any(key not in allowed or not isinstance(value,str) or len(value)>4000 for key,value in fields.items()): raise ValueError('invalid_fields')
        with self.db() as db:
            row = db.execute('SELECT * FROM projects WHERE id=? AND owner=?', (project_id, owner)).fetchone()
            if not row: return None
            if row['version'] != expected: raise ValueError('version_conflict')
            merged = {**json.loads(row['fields']), **fields}
            next_title = title.strip() if title is not None else row['title']
            if merged != json.loads(row['fields']) or next_title != row['title']:
                result = db.execute('UPDATE projects SET fields=?, title=?, status=?, version=version+1, updated=? WHERE id=? AND owner=? AND version=?', (json.dumps(merged, ensure_ascii=False), next_title, 'draft', now(), project_id, owner, expected))
                if result.rowcount != 1: raise ValueError('version_conflict')
        return self.get(owner, project_id)

    def _check_docx(self, content: bytes):
        if len(content)>10_000_000 or not content.startswith(b'PK'): raise ValueError('invalid_docx')
        try:
            with zipfile.ZipFile(BytesIO(content)) as archive:
                if sum(item.file_size for item in archive.infolist()) > 50_000_000 or len(archive.infolist()) > 2000: raise ValueError('invalid_docx')
            from docx import Document
            Document(BytesIO(content))
        except Exception as exc: raise ValueError('invalid_docx') from exc

    def install_source(self, content: bytes, filename: str, version: str, mapping: dict | None = None):
        if not filename.lower().endswith('.docx'): raise ValueError('invalid_docx')
        self._check_docx(content)
        # A test render checks the known structural anchors before an admin can review.
        sample = {spec.key:'Тест' for spec in FIELDS}
        sample['deadline']='2026-12-31'
        try: render_working_group(content, sample)
        except Exception as exc: raise ValueError('source_structure_changed') from exc
        digest = hashlib.sha256(content).hexdigest()
        (self.root/'templates'/f'{digest}.docx').write_bytes(content)
        with self.db() as db:
            db.execute('UPDATE templates SET version=?, status=?, filename=?, sha=?, mapping=NULL WHERE id=?', (f'sha256:{digest}', 'awaiting_review', filename, digest, TEMPLATE_ID))
        return self.template(TEMPLATE_ID)

    def approve_source(self):
        with self.db() as db:
            row = db.execute('SELECT * FROM templates WHERE id=?', (TEMPLATE_ID,)).fetchone()
            if row['status'] != 'awaiting_review': raise ValueError('source_not_uploaded')
            db.execute("UPDATE templates SET status='ready' WHERE id=?", (TEMPLATE_ID,))
        return self.template(TEMPLATE_ID)

    def generate(self, owner: str, project_id: str):
        project = self.get(owner, project_id)
        if not project: return None
        if not project.validation.ready: raise ValueError('validation_failed')
        if project.status == 'generated' and any(item.projectVersion == project.version for item in project.artifacts):
            return project
        with self.db() as db:
            template = db.execute('SELECT * FROM templates WHERE id=?', (project.templateId,)).fetchone()
        source = (self.root/'templates'/f"{template['sha']}.docx").read_bytes()
        content = render_working_group(source, project.fields)
        artifact_id = str(uuid4())
        (self.root/'artifacts').mkdir(exist_ok=True)
        path = self.root/'artifacts'/f'{artifact_id}.docx'
        path.write_bytes(content)
        digest = hashlib.sha256(content).hexdigest()
        filename = f'proekt-rasporyazheniya-v{project.version}.docx'
        try:
            with self.db() as db:
                result = db.execute("UPDATE projects SET status='generated' WHERE id=? AND owner=? AND version=?", (project_id, owner, project.version))
                if result.rowcount != 1: raise ValueError('version_conflict')
                db.execute('INSERT INTO artifacts VALUES (?,?,?,?,?,?,?)', (artifact_id, project_id, owner, project.version, now(), filename, digest))
        except Exception:
            path.unlink(missing_ok=True)
            raise
        return self.get(owner, project_id)

    def artifact(self, owner: str, project_id: str, artifact_id: str):
        with self.db() as db:
            row = db.execute('SELECT * FROM artifacts WHERE id=? AND project_id=? AND owner=?', (artifact_id, project_id, owner)).fetchone()
        return (self.root/'artifacts'/f'{artifact_id}.docx', row['filename']) if row else None
