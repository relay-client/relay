# План переименования Relay → `<name>`

Локальную часть можно выполнить инструментом: [инструкция автоматизации](RENAMING.md).
Предварительный просмотр: `node scripts/rename-project.mjs --name callwing`.
Имя `callwing` здесь только пример; до запуска с `--apply` проект не переименовывается.

Общий план, не зависит от выбранного имени. Обозначения:

- `<name>` — новое имя в нижнем регистре (бинарь, домен, репозиторий): `callwing`
- `<Name>` — отображаемое имя: `Callwing`
- `<NAME>` — префикс переменных окружения: `CALLWING_`
- `<org>` — организация на GitHub: зонтичный бренд для нескольких продуктов (API-клиент, позже клиент БД),
  поэтому не обязана совпадать с `<name>`
- `<name>.dev` ниже означает домен продукта (`--domain` у скрипта). При зонтичном бренде это
  `<name>.<org>.dev` или `<org>.dev/<name>`, если отдельный `<name>.dev` занят

Исходная позиция: пользователей нет, поэтому переезд делается **разом**, без промежуточного
релиза, без миграции данных и без поддержки старых имён. Всё, что было `relay`, просто становится
`<name>`.

---

## Фаза 0. Проверить и занять имя (1 вечер)

- [ ] Товарные знаки, классы 9 и 42 (ПО и SaaS):
  - [ ] USPTO: https://tmsearch.uspto.gov
  - [ ] EUIPO: https://euipo.europa.eu/eSearch
  - [ ] WIPO Global Brand DB: https://branddb.wipo.int
- [ ] Поиск в вебе по `"<name>"`, `<name> app`, `<name> api`: в той же нише ничего быть не должно
- [ ] Зарегистрировать и занять:
  - [ ] домен `<name>.dev` через Cloudflare Registrar, автопродление включить
  - [ ] организацию GitHub `<org>`
  - [ ] ник `<name>` в X, Bluesky и Reddit (хотя бы зарезервировать)
- [ ] Почта: в Cloudflare Email Routing на `<name>.dev` завести адрес `releases@<name>.dev` → личный ящик
- [ ] Выбрать логотип, собрать исходники: SVG знака, `appicon.png` 1024, иконки для расширения

## Фаза 1. Ребрендинг в коде (одна ветка, один PR)

Около 6000 вхождений `relay` в 520 файлах. Менять **скриптом по категориям** и вычитывать дифф, а не
слепым `sed s/relay/<name>/g`: внутри есть слова вроде `relayGitignoreEntries` и тестовые хосты.

### Идентичность и сборка
- [ ] Путь Go-модуля: `github.com/relay-client/relay/apps/desktop` → `github.com/<org>/<name>/apps/desktop`
  (`go.mod`, все импорты, `go.work`)
- [ ] `apps/desktop/wails.json`: `name`, `productName`, `outputfilename`, `info.companyName`
- [ ] `Makefile`: `APP_NAME`, `UPDATE_REPO`, `LDFLAGS`, пути `build/bin/relay*`
- [ ] macOS: `build/darwin/Info.plist` и `Info.dev.plist`: `CFBundleIdentifier`
  `com.relayclient.relay` → `dev.<name>.app`, `CFBundleName`, `CFBundleExecutable`; `make-dmg.sh`
- [ ] Windows: `build/windows/info.json`, `package-msix.ps1` (Identity Name и Publisher в манифесте MSIX),
  `installer/` (NSIS: имя продукта, папка установки, ярлыки), `icon.ico`
- [ ] Иконки: `appicon.png`, `.icns`, `.ico`; `scripts/gen-appicon.mjs`, `scripts/gen-installer-assets.mjs`
- [ ] `.github/workflows/release.yml`: `GO_MODULE`, `UPDATE_REPOSITORY`, имена ассетов
  `relay-*` → `<name>-*`, `Relay.app`, `relay-msix.pfx`, заголовок DMG
- [ ] `scripts/make-latest-json.py`: имена ассетов

### Рантайм приложения
- [ ] Папка данных: `filepath.Join(dir, "Relay")` в `internal/api/store.go` → `<Name>`
- [ ] Keychain: `requestStoreKeyService = "Relay"` и `--label` в `internal/api/secure_store.go`
- [ ] Апдейтер: `githubRepo`, `bundleArchiveName`, шаблон имени MSIX, временные `relay-update-*`,
  тексты ошибок в `internal/api/updater*.go`
- [ ] Лог: `logFileName = "relay.log"`, префиксы `log.Printf("relay: ...")`
- [ ] Формат воркспейса: `relay.yml` → `<name>.yml`, `relay.workspace.yaml.v1` → `<name>.workspace.yaml.v1`,
  `.relay-local/` → `.<name>-local/` (`file_workspace_store.go`, `collection_files.go`)
- [ ] JSON Schema: `schemas/relay-workspace-yaml-v1.schema.json` → `<name>-...`, `$id` →
  `https://<name>.dev/schemas/...`, и действительно отдавать её с сайта
- [ ] HTTP: `User-Agent: Relay/<ver>` (executor, sse, websocket, socketio), заголовок `X-Relay-Mock-Example`
- [ ] CLI и MCP: имя бинаря (`<name> run`, `<name> mcp`, `<name> git-credential`), `serverInfo` в
  `mcp_server.go`, `"name": "Relay"` в `mcp.go`, JUnit suite `relay` в `cli.go`
- [ ] Переменные окружения: все `RELAY_*` → `<NAME>*`, включая `Makefile` (`RELAY_DISABLE_KEYCHAIN`),
  тесты, e2e, perf, CI
- [ ] Протокол cookie-sync: `"app": "relay"` в `cookie_sync.go` (и в расширении)
- [ ] Фронтенд: ключи localStorage `relay.*` → `<name>.*`, CSS-классы `relay-*`, все тексты UI
  со словом Relay, заголовок окна, меню «About»

### Браузерное расширение
- [ ] `apps/extension/manifest.json` и `manifest.firefox.json`: `name`, `description`, `default_title`,
  Firefox `browser_specific_settings.gecko.id`
- [ ] Иконки расширения, `popup.html`, `README.md`
- [ ] Ключ расширения (`extension.pem`, `RELAY_EXTENSION_KEY`): **оставить тот же**, чтобы не менялся
  extension ID, переименовать только переменную

### Сайт и документация
- [ ] `apps/web/site.constants.mjs`: `PRIMARY_DOMAIN = '<name>.dev'`, `SITE_NAME`, `GITHUB_OWNER`, `GITHUB_REPO`
- [ ] `apps/web/site.config.mjs`: `RELAY_SITE_URL` и `RELAY_SITE_BASE` → `<NAME>SITE_URL` и `<NAME>SITE_BASE`
- [ ] Все страницы `apps/web/src/content/docs/**`: название, команды CLI, пути
  `/Applications/Relay.app/...`, примеры MCP-конфигов
- [ ] Лендинг `src/pages/index.astro`, `og.png`, `favicon-32.png`, `apple-touch-icon.png`, `logo.png`;
  `scripts/gen-landing-images.mjs`
- [ ] Скриншоты в документации и README: перегенерировать (`RELAY_DOCS_SCREENSHOT_DIR`,
  `RELAY_README_SCREENSHOT`), иначе на них останется старое имя
- [ ] `README.md`, `CONTRIBUTING.md`, `SECURITY.md`, `CODE_OF_CONDUCT.md`, `docs/*.md`
- [ ] `CHANGELOG.md` и `changelog.md` на сайте: запись «Relay is now `<Name>`»; старые записи не трогать
- [ ] `apps/web/DOCS_COVERAGE.md`: поднять до нового тега

### Не трогать
- Ключ подписи обновлений `update-signing-key` и `.pub`: старый ключ продолжает работать
- Тестовые хосты `*.relay.test`: можно переименовать, но это косметика, делать последним
- Старые теги и релизы на GitHub: остаются как есть, со старыми именами файлов

### Проверка ветки
- [ ] `make check`, `go test -race ./...`, `npm run lint`, vitest, `npm run e2e` и `e2e:webkit`,
  `web:build` и `web:check-docs`
- [ ] Финальный grep: `grep -rIi relay --exclude-dir={node_modules,.git,dist}` должен показывать только
  то, что сознательно оставлено (CHANGELOG, тестовые хосты)
- [ ] Ручной прогон собранного `.app`: старт с нуля, создание воркспейса, `<name> mcp`, cookie-sync

## Фаза 2. День переезда

Порядок важен: сначала репозиторий и сервер, потом DNS, потом редиректы, потом релиз.

1. **GitHub**
   - [ ] Переименовать организацию `relay-client` → `<org>` или перенести репозиторий в заранее созданную
     `<org>`. Затем переименовать репозиторий `relay` → `<name>`
   - [ ] Проверить, что переехали секреты и vars (`DEPLOY_SSH_KEY`, `DEPLOY_KNOWN_HOSTS`, `DEPLOY_HOST`,
     сертификат MSIX). Переименовать vars `RELAY_SITE_URL` и `RELAY_SITE_BASE`
   - [ ] Environments (`production`, `github-pages`), ruleset для `main`, CodeQL
   - [ ] Description, Website, Topics, Social preview, ссылка в профиле организации
   - [ ] Локально: `git remote set-url origin https://github.com/<org>/<name>.git`
   - [ ] Если организацию переименовали, а не перенесли репозиторий: создать пустую `relay-client`
     обратно, чтобы имя не заняли
2. **Сервер документации**
   - [ ] Папка сайта `/srv/relayclient.dev` → `/srv/<name>.dev`, `SITE_ROOT` в `web-deploy.yml`,
     `environment.url`
   - [ ] nginx/caddy: `server_name <name>.dev www.<name>.dev`
   - [ ] TLS-сертификат для `<name>.dev`: .dev в HSTS preload, без HTTPS сайт не откроется вообще
3. **DNS в Cloudflare для `<name>.dev`**
   - [ ] `A @ → IP сервера`, `CNAME www → <name>.dev` (или `A`)
   - [ ] Режим прокси: если оранжевое облако, то SSL mode **Full (strict)**
   - [ ] Записи Email Routing (MX и SPF) уже есть после фазы 0
4. **Старый домен `relayclient.dev`**
   - [ ] 301 с сохранением пути: `https://relayclient.dev/* → https://<name>.dev/$1`
     (Cloudflare Redirect Rules или `return 301 https://<name>.dev$request_uri;` в nginx)
   - [ ] Продлить домен минимум на год: 301 переносит SEO-вес, а брошенный домен перекупят
5. **Релиз**
   - [ ] Сменить идентичность коммитов: `git config user.name "<Name>"`,
     `git config user.email releases@<name>.dev`
   - [ ] Тег `v3.0.0` из нового репозитория (переименование ломает CLI и пути, поэтому мажорная версия)
   - [ ] Проверить, что CI собрал все платформы и что `latest.json` и ассеты называются `<name>-*`
6. **Локальная машина**
   - [ ] Перенести свои данные: `~/Library/Application Support/Relay` → `.../<Name>`. Ключ из keychain
     (сервис `Relay`) переложить в сервис `<Name>` или пересоздать стор
   - [ ] Удалить `/Applications/Relay.app`, поставить новый `.app`
   - [ ] Переименовать свои воркспейсы: `relay.yml` → `<name>.yml`, поправить `.gitignore`
   - [ ] Обновить MCP-конфиги ассистентов: путь к бинарю и имя сервера
   - [ ] По желанию: переименовать папку проекта `~/GolandProjects/relay` и обновить заметки Claude
     (memory, CLAUDE.md)

## Фаза 3. Поисковики и анонс (в тот же день и неделю после)

- [ ] **Google Search Console**
  - [ ] Добавить доменный ресурс `<name>.dev`, подтвердить TXT-записью в Cloudflare
  - [ ] В ресурсе `relayclient.dev`: Settings → **Change of Address** → `<name>.dev`
    (работает только когда 301 уже включены)
  - [ ] Отправить `https://<name>.dev/sitemap-index.xml`, запросить индексацию главной и /docs/
- [ ] **Bing Webmaster Tools**: импорт сайта из GSC, **Site Move**, отправить sitemap
- [ ] **IndexNow**: в Cloudflare включить Crawler Hints (Bing, Yandex, Seznam и др. получат пинг сами)
- [ ] **Яндекс.Вебмастер**: добавить сайт, «Переезд сайта», sitemap
- [ ] Проверить на проде: `canonical`, `og:url`, `og:image`, `robots.txt` и sitemap указывают на `<name>.dev`
- [ ] Обновить внешние ссылки: свои посты, awesome-листы, AlternativeTo, Product Hunt, профили
- [ ] Карточки расширения в Chrome Web Store и Firefox AMO: имя, описание, скриншоты, новая версия
- [ ] Короткий анонс: Relay теперь `<Name>`, ссылка на новый сайт и репозиторий

## Фаза 4. Хвосты (через 6–12 месяцев)

- [ ] Посмотреть в GSC, что трафик переехал на новый домен
- [ ] Решить, продлевать ли `relayclient.dev` (дешевле продлевать, чем потерять редиректы)
- [ ] Организацию `relay-client` на GitHub не удалять никогда
