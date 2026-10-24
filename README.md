# Regula AI

Продолжение PR #1: главный экран и демочат сохранены, раздел «Документы» стал самостоятельным редактором на React и FastAPI. Проекты хранятся на сервере. Есть каталог семи модулей из синтетического кейса, поиск, создание и дублирование проектов, форма, серверный предпросмотр, проверка, версии и скачивание DOCX. Чат и редактор открывают один `projectId`.

Для модуля «Распоряжение о создании рабочей группы» действует полный путь: заполнение полей → проверка → генерация из **копии предоставленного исходного DOCX** → скачивание → правка и новая версия. Генератор удаляет гриф утверждения, подсказки, номера примечаний и пометку «МОДУЛЬНЫЙ ДОКУМЕНТ», сохраняет области даты, номера и ЭП. Техническая версия файла определяется SHA-256; официальный статус и редакция в реестре не подтверждены. Номер, подпись, виза и карточка ИИС ДО не создаются. Для остальных шести модулей исходные DOCX загружены в каталог, схемы ещё не реализованы.

## Запуск

```sh
cp .env.example .env
# Замените все три значения в .env на свои секреты и пароли.
docker compose up --build
```

Откройте http://127.0.0.1:8080, раздел «Документы». Вход `user` или `admin` с паролем из `.env`. Данные лежат в Docker volume `regula_data`. OpenAPI: http://127.0.0.1:8080/api/docs и `/api/openapi.json`.

Локальная разработка:

```sh
python3 -m venv .venv
.venv/bin/pip install -r api/requirements.txt
REGULA_SESSION_SECRET=local-dev-secret REGULA_USER_PASSWORD=user REGULA_ADMIN_PASSWORD=admin .venv/bin/uvicorn api.main:app --reload --port 8000
npm ci
npm run dev
```

Vite перенаправляет `/api` на FastAPI. Тесты: `.venv/bin/python -m pytest -q api/tests`; сборка: `npm run build`.

## API

| Действие | Маршрут |
| --- | --- |
| Каталог и модуль | `GET /api/document-templates`, `GET /api/document-templates/{id}` |
| Создать и перечислить проекты | `POST /api/document-projects`, `GET /api/document-projects` |
| Открыть, изменить, предпросмотреть | `GET /api/document-projects/{id}`, `PATCH /api/document-projects/{id}`, `POST /api/document-projects/{id}/preview` |
| Проверить и сформировать | `POST /api/document-projects/{id}/validate`, `POST /api/document-projects/{id}/generate` |
| Версии и файл | `GET /api/document-projects/{id}/versions`, `GET /api/document-projects/{id}/artifacts/{artifactId}/download` |
| Реестр инструментов для AI | `GET /api/document-tools`, `POST /api/document-tools/{name}/invoke` |
| Админ-загрузка новой версии | `POST /api/document-templates/{id}/source`, затем `/approve` после проверки |

`PATCH` требует `expectedVersion` и возвращает `409 version_conflict` при конкурентной правке. Все действия проходят через `DocumentsService`, в том числе вызовы через реестр инструментов. Запросы и скачивание проверяют владельца. Реестр выдаёт разрешённые имена и JSON Schema аргументов; произвольный код от LLM не исполняется. Вход выдаёт подписанную HttpOnly cookie, изменения требуют CSRF-токен. Это локальная авторизация для прототипа; перед общедоступным развёртыванием нужны корпоративная идентификация, HTTPS и аудит.

Типы и клиент для фронтенда: `src/features/documents/types.ts`, `src/features/documents/api.ts`. Подробности: `docs/documents-api.md`. Qwen и RAG ещё не подключены. Исключение п. 1.3 Методических рекомендаций автоматически не применяется: актуальность утверждённого модуля в реестре не проверена.
