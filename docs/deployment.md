# Развёртывание Regula AI на VPS

Целевая машина: Ubuntu 26.04, 2 vCPU, 4 GB RAM, 60 GB NVMe. Образы собирает GitHub Actions, сервер только скачивает и запускает их. API, SQLite и будущая домашняя модель не публикуются на внешних портах. Перед действиями на машине проверьте, что IP действительно принадлежит нужному VPS и известен отпечаток его SSH host key.

## Что уже защищено, а что ещё требуется

- `deploy/compose.yaml` закрепляет API и web по **digest**, использует внешний именованный том для SQLite, оригиналов и DOCX, проверки готовности, `restart: unless-stopped`, ограничения памяти/CPU и ротацию Docker-логов. Приложение стартует после перезагрузки при включённом `docker.service`.
- Production добавляет Caddy с автоматическим TLS. Сайт и пользовательский API доступны без входа и пароля. В production документация FastAPI выключена; административные изменения базы знаний требуют отдельного ключа оператора.
- Без домена production **не включать**. Staging слушает только `127.0.0.1:8080` и доступен через SSH-туннель. HTTP на публичном IP не используется. Для staging `REGULA_SECURE_COOKIE=0` допустим только потому, что HTTP проходит внутри туннеля и не выходит в публичную сеть.
- CSRF обязателен для изменений, cookie `HttpOnly`, `SameSite=Lax`, в production `Secure`. Случайный `REGULA_SESSION_SECRET` обязателен; слабые/известные значения API отклоняет.

## 1. Однократная подготовка Ubuntu

Официальная [инструкция Docker для Ubuntu](https://docs.docker.com/engine/install/ubuntu/) **включает Resolute 26.04 LTS**. На VPS проверьте `. /etc/os-release; echo "$UBUNTU_CODENAME"`: ожидается `resolute`. Прежде чем включать UFW, выясните действующий порт SSH (`ss -lntp | grep sshd`) и оставьте открытую администраторскую SSH-сессию.

```sh
sudo apt update
sudo apt install -y ca-certificates curl ufw python3 tar gzip git
sudo install -m 0755 -d /etc/apt/keyrings
sudo curl -fsSL https://download.docker.com/linux/ubuntu/gpg -o /etc/apt/keyrings/docker.asc
sudo chmod a+r /etc/apt/keyrings/docker.asc
sudo tee /etc/apt/sources.list.d/docker.sources >/dev/null <<EOF
Types: deb
URIs: https://download.docker.com/linux/ubuntu
Suites: $(. /etc/os-release && echo "${UBUNTU_CODENAME:-$VERSION_CODENAME}")
Components: stable
Architectures: $(dpkg --print-architecture)
Signed-By: /etc/apt/keyrings/docker.asc
EOF
sudo apt update
apt-cache policy docker-ce
sudo apt install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
sudo systemctl enable --now docker.service
docker compose version
```

Если на хосте уже работает Docker, сначала инвентаризируйте `docker ps`, `docker volume ls` и конфликтующие пакеты; не удаляйте их автоматически. Docker-порты могут обходить правила UFW, поэтому в Compose наружу выведен только Caddy, а staging привязан к loopback. Для SSH на 22:

```sh
sudo ufw allow 22/tcp
sudo ufw enable
sudo ufw status verbose
docker ps --format 'table {{.Names}}\t{{.Ports}}'
```

Если SSH использует другой порт, замените правило **до** `ufw enable`. После назначения домена и до первого production-деплоя выполните `sudo ufw allow 80/tcp; sudo ufw allow 443/tcp`. Не открывайте 8000, 8080, SQLite или порт домашней модели. При частых попытках входа можно включить `fail2ban` для SSH, сохранив собственный доступ.

## 2. Отдельный пользователь и ключ

На VPS от имени администратора:

```sh
sudo useradd --create-home --shell /bin/bash regula-deploy
sudo passwd -l regula-deploy
sudo install -d -o regula-deploy -g regula-deploy -m 0700 /home/regula-deploy/.ssh /home/regula-deploy/incoming
sudo touch /home/regula-deploy/.ssh/authorized_keys
sudo chown regula-deploy:regula-deploy /home/regula-deploy/.ssh/authorized_keys
sudo chmod 0600 /home/regula-deploy/.ssh/authorized_keys
sudo install -d -o root -g root -m 0700 /etc/regula /opt/regula /opt/regula/releases
```

Создайте отдельный ключ на **своём администраторском компьютере**, не в репозитории и не в чате: `ssh-keygen -t ed25519 -f ./regula-actions-deploy -C regula-actions-deploy`. В `authorized_keys` добавьте строку `restrict ssh-ed25519 AAAA... regula-actions-deploy` с содержимым **публичного** `.pub` ключа. `restrict` запрещает пересылку портов, агента и псевдотерминал. GitHub-hosted runner не имеет постоянного IP, поэтому `from=<IP>` обычно неприменим. Пользователь не входит в группу `docker` (она фактически даёт права root).

Из проверенной ветки репозитория на VPS установите root-owned скрипты и правило sudo:

```sh
sudo install -o root -g root -m 0755 deploy/regula-rollout /usr/local/sbin/regula-rollout
sudo install -o root -g root -m 0755 deploy/regula-backup /usr/local/sbin/regula-backup
printf '%s\n' 'regula-deploy ALL=(root) NOPASSWD: /usr/local/sbin/regula-rollout deploy *, /usr/local/sbin/regula-rollout rollback' | sudo tee /etc/sudoers.d/regula-deploy
sudo chmod 0440 /etc/sudoers.d/regula-deploy
sudo visudo -cf /etc/sudoers.d/regula-deploy
```

Перед установкой root-скриптов проверьте их в PR. `regula-rollout` принимает от `regula-deploy` только проверенные digest образов, сам загружает Compose и Caddyfile из коммита, который входит в `main`, и сохраняет файлы в root-owned каталоге. Это не позволяет подменить Compose через входящий каталог. Доступ пользователя `regula-deploy` ограничен записью во входящий каталог и этим sudo-правилом. Не заменяйте его членством в `docker`. Серверу нужен исходящий HTTPS-доступ к GitHub; deploy job передаёт короткоживущий `GITHUB_TOKEN` по SSH, которым скрипт читает закрытый репозиторий и GHCR. Токен хранится только во временных root-only файлах в `/run` на время выкладки и удаляется после неё. При недоступности GitHub выпуск не меняется.

## 3. Данные, домен и секреты сервера

Узнайте точное имя существующего volume (`docker volume ls` и `docker inspect`). Если действующие данные уже лежат в нём, впишите **это имя** в `REGULA_DATA_VOLUME`. Не создавайте пустой том с похожим именем вместо него. Для новой установки:

```sh
sudo docker volume create regula_data
sudo docker volume create regula_caddy_data
sudo docker volume create regula_caddy_config
sudo install -o root -g root -m 0600 deploy/regula.env.example /etc/regula/regula.env
```

Заполните `/etc/regula/regula.env` на VPS (через `sudoedit`): реальный `DOMAIN`, контактный `ACME_EMAIL`, `REGULA_SESSION_SECRET` и точные имена томов. Домен должен иметь A-запись на `171.22.130.63` до первой production-выкладки; проверьте `dig +short ваш-домен`. Секрет сессии создайте `python3 -c 'import secrets; print(secrets.token_urlsafe(48))'`. Для администрирования базы знаний отдельно задайте случайный `REGULA_KNOWLEDGE_ADMIN_TOKEN` или оставьте пустым, отключив изменения корпуса.

Настройте права: `sudo chown root:root /etc/regula/regula.env; sudo chmod 0600 /etc/regula/regula.env`. Файл не передаётся через GitHub Actions. Сохраните секрет сессии вне VPS в защищённом хранилище: его потеря инвалидирует существующие cookie.

## 4. GitHub Actions и первое обновление

В репозитории создайте environment **`production`** с разрешённой веткой `main` и, если тариф/настройки позволяют, обязательным одобрением проверяющего. Дайте workflow доступ к публикации GHCR (`GITHUB_TOKEN`, `packages: write` уже задано в workflow); пакетам разрешите доступ этому репозиторию. В GitHub Settings → Secrets and variables → Actions:

| Уровень | Имя | Содержание |
| --- | --- | --- |
| Environment `production` secret | `DEPLOY_SSH_KEY` | приватный ключ отдельного deploy-пользователя |
| Environment `production` secret | `DEPLOY_KNOWN_HOSTS` | проверенная строка SSH host key для `171.22.130.63` |
| Repository variable | `DEPLOY_ENABLED` | `true` только после готовности VPS, домена и секретов |

Отпечаток SSH-ключа получите через доверенную панель VPS/консоль провайдера и сравните с `ssh-keyscan -t ed25519 171.22.130.63`; сам `ssh-keyscan` без сравнения не подтверждает личность сервера. Приватный ключ в чате не отправляйте. Для приватных пакетов GHCR сервер получает короткоживущий `GITHUB_TOKEN` из job по SSH stdin, выполняет `docker login` и сразу `docker logout`; постоянный PAT на VPS не нужен. Если доступ `GITHUB_TOKEN` к пакету запрещён настройками GHCR, дайте пакету доступ к этому репозиторию; не делайте образы публичными ради обхода.

При успешном push в `main`: npm `ci`/build, pytest и одноразовый Docker/browser/smoke стенд проходят первыми; два образа публикуются с тегами `sha-<commit>`, их digest передаются deploy job. Сервер использует именно digest, не изменяемый тег. Compose-файлы и Caddyfile он берёт по тому же SHA из `main`, а не из каталога, доступного deploy-пользователю. В GitHub Actions проверьте jobs `build`, `api`, `docker`, `publish-api`, `publish-web`, `deploy`. Если `DEPLOY_ENABLED` не `true`, публикация есть, автоматического доступа к VPS нет. Если домен и секреты настроены уже после слияния PR, задайте `DEPLOY_ENABLED=true` и запустите Actions → CI → Run workflow для ветки `main`: выполнятся те же тесты, публикация по SHA и выкладка. Не запускайте `scripts/compose-smoke.py` на production: он создаёт проекты и загружает тестовый файл.

## Публичная демонстрация

Сайт и пользовательский API открываются без логина и пароля. `REGULA_ACCESS_USER`, `REGULA_ACCESS_HASH` и `REGULA_PUBLIC_DEMO` больше не используются текущим выпуском. HTTPS, Secure/HttpOnly cookies, CSRF и отключённая документация API сохраняются; `REGULA_KNOWLEDGE_ADMIN_TOKEN` управляет отдельным доступом оператора к изменениям корпуса.

При обновлении существующего VPS **до выкладки** установите обновлённый root-owned скрипт из проверенного checkout:

```sh
sudo install -o root -g root -m 0755 deploy/regula-rollout /usr/local/sbin/regula-rollout
```

Он ожидает HTTP 200 от публичного `/api/health` и распознаёт парольную проверку старых выпусков при откате. Старый установленный скрипт может ожидать 401 и откатить публичный выпуск как неготовый. Новый Caddyfile применяется при выкладке выпуска и пересоздании контейнера Caddy. Существующие переменные входа можно удалить из `/etc/regula/regula.env`, если откат к старым выпускам больше не нужен; старые выпуски могут требовать эти значения.

Проекты по-прежнему привязаны к подписанной сессии браузера, которая создаётся автоматически. Это demo-изоляция, не корпоративная авторизация. Откат к старому выпуску может вернуть парольную проверку.

## 5. Staging без домена

Для временного закрытого стенда создайте отдельные `REGULA_PROJECT=regula-stage`, `REGULA_DATA_VOLUME=regula_stage_data`, `REGULA_ENV=development`, `REGULA_SECURE_COOKIE=0` и отдельный случайный секрет в root-only `/etc/regula/staging.env`. Создайте `docker volume create regula_stage_data`. Используйте **те же опубликованные образы по digest** и файлы `deploy/compose.yaml`, `deploy/compose.staging.yaml`; пример после заполнения root-only `images.env`:

```sh
sudo docker compose --env-file /etc/regula/staging.env --env-file ./images.env \
  -f deploy/compose.yaml -f deploy/compose.staging.yaml up -d --no-build --wait
```

Откройте туннель с личного компьютера: `ssh -L 8080:127.0.0.1:8080 администратор@171.22.130.63`, затем `http://127.0.0.1:8080` в браузере. Staging volume не смешивается с production. Отсутствие домена не блокирует публикацию образов; production deploy включайте позже.

## 6. Откат, резервные копии и восстановление

При неуспехе проверки контейнеров или TLS скрипт пытается вернуть предыдущий digest и завершает job ошибкой. Ручной быстрый откат: `sudo /usr/local/sbin/regula-rollout rollback`. Текущий/предыдущий SHA и выпуск с digest лежат в `/opt/regula/current.sha`, `previous.sha`, `releases/<sha>/images.env`. Образы предыдущего выпуска не удаляются. После отката проверьте `docker compose ps` и `curl -I https://ваш-домен/` (для текущего публичного выпуска ожидается 200; старые закрытые выпуски могут вернуть 401). Откат образов **не откатывает схему БД**; перед несовместимой миграцией обязателен проверенный бэкап.

`regula-backup` останавливает web/API, делает SQLite backup API и архивирует все остальные файлы тома, включая исходные PDF/DOCX и сгенерированные артефакты; затем распаковывает копию и проверяет `PRAGMA integrity_check`. Запуск вручную: `sudo /usr/local/sbin/regula-backup`. Для ежедневного запуска:

```sh
sudo install -m 0644 deploy/regula-backup.service /etc/systemd/system/
sudo install -m 0644 deploy/regula-backup.timer /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now regula-backup.timer
systemctl list-timers regula-backup.timer
```

Архивы находятся в `/var/backups/regula`, контрольные SHA-256 рядом. Для offsite установите `restic`, настройте внешний репозиторий и root-only `/etc/regula/restic.env` с `RESTIC_REPOSITORY` и `RESTIC_PASSWORD_FILE`; храните файл пароля отдельно. Проверяйте `restic snapshots` и периодически делайте тестовое `restic restore` на **новый** том. Без подключённого и проверенного внешнего хранилища бэкап **не защищает от потери VPS**. Следите за свободным местом; старые архивы удаляйте только после подтверждённой offsite копии и политики хранения.

Для восстановления остановите сервисы, создайте **новый** том, распакуйте выбранный архив в его mountpoint, проверьте `sha256sum -c` и `PRAGMA integrity_check` у извлечённой БД. Укажите имя нового тома в `REGULA_DATA_VOLUME` и запустите сохранённый выпуск; старый том оставьте нетронутым до проверки поиска, оригиналов и DOCX. Восстанавливать поверх действующего volume нельзя.

## 7. Диагностика и будущая Qwen

`sudo systemctl status docker`, `sudo docker compose --project-directory /opt/regula/releases/$(cat /opt/regula/current.sha) --env-file /etc/regula/regula.env --env-file /opt/regula/releases/$(cat /opt/regula/current.sha)/images.env -f /opt/regula/releases/$(cat /opt/regula/current.sha)/compose.yaml -f /opt/regula/releases/$(cat /opt/regula/current.sha)/compose.production.yaml ps`, `sudo journalctl -u regula-backup.service` и логи нужного контейнера через `docker logs` помогают найти сбой. `/api/health` сообщает только статус; `/api/ready` проверяет доступность БД. Оба маршрута доступны снаружи без пароля и при готовом приложении возвращают 200. На локальном CI стенде `scripts/compose-smoke.py` проверяет HTTP, поиск п. 2.1/матрицы, 7 DOCX, 20 MiB файл и границы запроса в отдельном томе.

Домашний Windows+WSL2 RTX 4090 может в будущем поднять Qwen **только на Tailscale-адресе**, с исходящим соединением VPS по tailnet; публичные 8000/Ollama/vLLM порты не нужны. Зарезервированы `REGULA_QWEN_URL` и `REGULA_QWEN_TIMEOUT_SECONDS=8`. Сейчас модель не подключена: FTS, документы и сайт работают автономно, чат ясно сообщает отсутствие AI-анализа. При добавлении адаптера он должен использовать короткий timeout, отказ без блокировки FastAPI и не выполнять документные инструменты после сетевой ошибки. Настройка домашнего ПК и включение модели — отдельное действие после получения доступа.
