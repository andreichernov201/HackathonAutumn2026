# Контракт документов

`DocumentProject` — единый серверный объект с постоянным `projectId`, `templateId`, технической `templateVersion` (SHA-256 исходника), `fields`, `status`, `version`, датами, `validation`, `preview` и `artifacts`. `generated` означает только наличие файла, не официальное утверждение.

`DocumentTemplate.sourceStatus`: `ready` для проверенного обработчиком модуля рабочей группы, `awaiting_schema` для остальных шести исходников, `awaiting_review` после админ-загрузки. `registryStatus` пока `unverified`. Исходные файлы — синтетические материалы кейса, не реестр утверждённых модулей.

`POST /api/document-projects` принимает `{ "templateId": "working-group-order", "title": "..." }`. `PATCH` принимает `{ "expectedVersion": 1, "fields": { "purpose": "..." }, "title": "..." }`; `fields` — частичное обновление. `POST .../preview` принимает `{ "fields": {...} }` и возвращает реактивный серверный предпросмотр без записи. Проверка возвращает ошибки с кодами и привязкой к полям. Генерация блокируется при неполном наборе полей и смене версии источника.

`GET /api/document-tools` выдаёт разрешённые имена, REST маршруты, JSON Schema входа и выхода. `POST /api/document-tools/{name}/invoke` принимает `{ "arguments": {...} }` и использует тот же сервис и права. В реестре нет необратимых операций; загрузка и подтверждение источника доступны только администратору через отдельный API.

Вход: `POST /api/session/login` с `username` (`user`/`admin`) и `password`. Ответ содержит `csrfToken`; cookie HttpOnly устанавливается сервером. Для `POST` и `PATCH` передавайте `X-CSRF-Token`. Скачивание требует cookie и проверки владельца проекта и артефакта.
