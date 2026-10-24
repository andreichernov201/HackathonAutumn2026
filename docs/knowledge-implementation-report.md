# Отчёт о реализации базы знаний

Ветка: `feat/knowledge-base`. База PR: `feat/documents-service` (PR #2), который зависит от `feat/regula-demo-workspace` (PR #1). В ходе работы интегрирован свежий коммит `2b76f2d` сервиса документов: генераторы всех семи модулей сохранены. `main` на момент проверки ещё не содержал API, поэтому PR намеренно последовательный, а не с копией backend.

## Реально работает

- Автономный каталог, фильтры категории/статуса/формата, сортировка и пагинация.
- Локальная загрузка PDF, DOCX и TXT, безопасное хранение оригиналов и точный checksum.
- Извлечение глав/пунктов/таблиц и постоянные адреса конкретных источников.
- Полнотекстовый поиск FTS5 с русским стеммингом и точными фразами.
- Просмотрщик: дерево, исходный текст, таблицы, номера PDF-страниц, подсветка, оригинал, копирование ссылки.
- Новые редакции, сохранение прежних оригиналов/ссылок, выбор редакции, повторная индексация без переназначения пунктов.
- Один FastAPI, одна SQLite и общая сессия/CSRF с документами.
- Шесть типизированных AI-инструментов и проверка точной цитаты по редакции, пункту и checksum.
- Реальные citation-блоки в существующем чате и WorkspacePanel, переход к тому же пункту базы знаний.
- Демо-читатель / локальный администратор; restricted-материалы недоступны читателям через каталог, поиск, прямые URL и инструменты.
- Аудит загрузок/редакций/индексации, ограничения файлов и безопасные ошибки.

## Что импортировано

Три предоставленных оригинала включены в `api/knowledge/sources/` и импортируются при запуске: PDF Инструкции по ДОУ (51 страница), DOCX матрицы визирования и DOCX методических рекомендаций. SHA-256 и исходные имена зафиксированы в manifest. Все документы отмечены как синтетические учебные материалы с неподтверждённым статусом; редакции и даты не выдуманы.

Все семь присланных DOCX-модулей побайтово совпали с уже существующими `api/templates/sources/`. Существующий реестр и генераторы используются без второго нормативного импорта. Искусственные документы применялись только во временном стенде и тестах, в рабочую базу не включены.

## Проверки

- **18 тестов прошли**: исходный сервис документов/семь модулей, API базы знаний, извлечение, поиск, версии, неизменность ссылок и ACL.
- Тесты на реальных оригиналах: п. 2.1 рекомендаций — первый результат вопроса о присвоении номера; строка 6 внутренних документов — первый результат вопроса об ИТ-рабочей группе; обязательные отметки и условный ИТ-участник остаются исходным текстом.
- Структура PDF проверена на 51 странице; маркировка не смешивается с пунктами. Нумерованный список внутри п. 4.2 рекомендаций сохраняется внутри этого пункта, пропущенный в оригинале элемент 2 не придуман.
- TypeScript и production-сборка Vite прошли.
- В браузере проверены: пустое состояние, вход оператора на изолированном стенде, загрузка DOCX, таблица, копирование ссылки, просмотр п. 2.1 оригинала, передача источника в чат и обычный вопрос с реальным поиском матрицы.
- Docker/Compose локально не запускались: Docker отсутствует в окружении. В CI добавлены тесты Python и сборка API-образа, наряду с существующими frontend/Docker-проверками.

## Что пока не подключено

Qwen и серверный генеративный `/api/chat`, embeddings/векторный поиск, OCR, семантическая проверка применимости, сравнение редакций, корпоративный SSO, очередь обработки и фактическое согласование в ИИС ДО. Не выдаются за работающие. Базовый поиск не зависит от них.

Для разработчика Qwen: взять JSON Schema из `GET /api/knowledge/tools`, вызывать только разрешённые методы с проверенным серверным Principal, сохранять исходную редакцию, проверять цитаты через `verify_citation`, передавать текст источников как недоверенные tool-данные и возвращать совместимый `ChatResult`/`SourceReference`. Прямой SQL и команды из документов недопустимы.

## Запуск и API

Полная инструкция и таблица всех API: [knowledge-api.md](knowledge-api.md). Быстрый старт: скопировать `.env.example` в `.env`, задать случайный `REGULA_SESSION_SECRET`, при необходимости `REGULA_KNOWLEDGE_ADMIN_TOKEN`, затем `docker compose up --build`. Открыть `http://127.0.0.1:8080/#knowledge`. Локальная разработка: FastAPI на 8000 и `npm run dev` на 5173.

Проверки: `.venv/bin/python -m pytest -q api/tests` и `npm run build`. Вход читателя — демо, ключ оператора — обслуживание базы; это не корпоративная аутентификация.

## Изменённые файлы относительно API документов

- `.dockerignore`
- `.env.example`
- `.github/workflows/ci.yml`
- `README.md`
- `api/knowledge/__init__.py`
- `api/knowledge/extract.py`
- `api/knowledge/migrations/001_knowledge.sql`
- `api/knowledge/migrations/002_russian_search.sql`
- `api/knowledge/models.py`
- `api/knowledge/router.py`
- `api/knowledge/seed.py`
- `api/knowledge/service.py`
- `api/knowledge/sources/approval-matrix.docx`
- `api/knowledge/sources/manifest.json`
- `api/knowledge/sources/modular-guidance.docx`
- `api/knowledge/sources/records-instruction.pdf`
- `api/knowledge/text.py`
- `api/knowledge/tools.py`
- `api/main.py`
- `api/requirements.txt`
- `api/tests/test_case_corpus.py`
- `api/tests/test_knowledge.py`
- `compose.yaml`
- `docker/nginx.conf`
- `docs/architecture.md`
- `docs/knowledge-api.md`
- `docs/knowledge-implementation-report.md`
- `src/App.tsx`
- `src/components/ChatBlocks.tsx`
- `src/components/Composer.tsx`
- `src/components/ConversationView.tsx`
- `src/components/WelcomeView.tsx`
- `src/components/WorkspacePanel.tsx`
- `src/features/assistant/gateway.ts`
- `src/features/assistant/scenarios.ts`
- `src/features/assistant/types.ts`
- `src/features/documents/api.ts`
- `src/features/knowledge/KnowledgePage.tsx`
- `src/features/knowledge/KnowledgeViewer.tsx`
- `src/features/knowledge/UploadDialog.tsx`
- `src/features/knowledge/api.ts`
- `src/features/knowledge/knowledge.css`
- `src/features/knowledge/types.ts`
- `src/shared/http.ts`
- `src/styles.css`
