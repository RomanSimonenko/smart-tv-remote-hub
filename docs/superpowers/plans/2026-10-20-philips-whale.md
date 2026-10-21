# Philips Whale Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подключить Philips Whale через IP и PIN, сохранять авторизацию и управлять базовым пультом.

**Architecture:** Новый пакет Philips реализует TvAdapter и HTTPS/Digest. Общий сервис операций получает необязательный PIN challenge; веб-интерфейс передаёт PIN защищённому API. Существующие шифрование credentials, реестр устройств и маршруты команд переиспользуются.

**Tech Stack:** TypeScript, Node.js >=22.12, node:https/node:crypto, Fastify, Zod, SQLite, React, Vitest, Playwright; pnpm 11.15.1. Новые внешние зависимости не требуются для текущего решения.

**Spec:** [Philips Whale design](../specs/2026-10-20-philips-whale-design.md), согласованный пользователем флоу IP → PIN → сохранение ключа → пульт.

## Global Constraints

- Платформа `whale`, пользовательское название «Philips Whale», пакет `packages/philips`.
- HTTPS 1926, `/6/`; только существующая RFC1918 IPv4-валидация; redirects запрещены.
- PIN — ровно четыре ASCII-цифры, ведущий ноль сохраняется.
- Base64 от байтов HMAC-SHA1, не от hex-текста.
- Ключ и fingerprint шифруются существующим cipher; PIN не сохраняется и не журналируется.
- API version не подставляется вместо версии Whale OS.
- Приложения, входы, текст, указатель, удержание и питание не входят.
- LG/Samsung и пользовательские данные сохраняются. Docker volumes не удалять.
- Реальные команды ТВ — только в согласованном объёме; UI проверяется встроенным браузером.

## Review Focus

- Ведущий ноль PIN и повторная отправка: одна попытка подтверждения с исходной строкой.
- Выход сессии во время repair сохранённого ТВ: отменяется только принадлежащая сессии операция; старый ключ остаётся.
- Поздний grant после отмены/удаления: нет записи ключа или восстановления удалённого ТВ.
- Изменение TLS-сертификата на прежнем IP: явная ошибка, без автоматического доверия.
- Добавление Whale в существующую БД: сохраняются default, порядок, credentials и история запусков.

---

## Подготовка базы и структура файлов

Текущий main отстаёт от origin/main на пять коммитов OCR. Они затрагивают runtime,
API, контракты прогонов, сборку и стили — часть будущих точек интеграции.
В checkout есть несвязанные пользовательские правки. Не делать reset/stash/pull
поверх них. При исполнении использовать using-git-worktrees: отдельный checkout
от проверенного origin/main, перенести только спецификацию/план и применимые
пользовательские инструкции. Не копировать секреты и runtime-данные.

Новые единицы: `packages/philips/src/{index,transport,digest,protocol,philips-adapter}.ts`,
`apps/api/src/tv/pairing-pin.ts`, `apps/web/src/components/TvPairingPin.tsx`.
Остальные изменения — в существующих владельцах, перечисленных ниже.
Перед правкой общего символа выполнить graft callers и проверить всех потребителей.

### Task 1: Контракты платформы и безопасная миграция

**Files:** contracts `tv.ts`, `tv-setup.ts`, `tv-actions.ts`, `test-runs.ts`, `index.ts`;
API `tv/repository.ts`, `storage/migrations.ts`; тесты contracts `tv-setup.test.ts`,
`tv-actions.test.ts`, `test-runs.test.ts`, API `database.test.ts`, `tv-device-repository.test.ts`.

**Interfaces:** `TvPlatform` включает `whale`; `TvTransport` включает `https:1926`.
`TvOperation.challenge?: { type: 'pin'; expiresAt: number }` разрешён только
при running и внутри deadline операции. `submitTvPinSchema` принимает strict
`{ pin: string }` с `/^[0-9]{4}$/`. `holdByPlatform` — Record<TvPlatform,TvHoldMode>.

- [ ] Добавить тесты: `0123` принимается без преобразования; числа, пробелы,
  Unicode-цифры, лишние поля и длина !=4 отвергаются; terminal challenge запрещён;
  старые операции без challenge читаются; Whale hold mode равен none;
  старые и Whale-отчёты используют одну схему платформы.
- [ ] Запустить contracts tests, подтвердить падения на новых случаях.
- [ ] Расширить канонические схемы и экспорты. Заменить дублирующий enum отчётов.
  Добавить следующую миграцию относительно актуального origin/main: новый
  CHECK платформ без редактирования прежних миграций; сохранить sequence,
  позиции, tv_id, default и зашифрованные строки.
- [ ] В тесте старой БД с LG/Samsung и историей сравнить все строки до/после,
  добавить Whale, перезапустить хранилище и перечитать default/историю.
- [ ] Выполнить `pnpm --filter @remote-webos-tv/contracts test` и
  `pnpm --filter @remote-webos-tv/api test -- test/database.test.ts test/tv-device-repository.test.ts`.
  Ожидается PASS. Зафиксировать только файлы задачи.

### Task 2: Транспорт Philips и адаптер

**Files:** новый `packages/philips/` по структуре tizen (package.json, tsconfig,
src и test); корневые package.json, pnpm-lock.yaml, Dockerfile и CI build wiring,
если там явный список пакетов; apps/api/package.json.

**Interfaces:** `PairingRequest.requestPin?: (challenge: {expiresAt:number}) => Promise<string>`
в tv-adapter; `createPhilipsAdapter(options): TvAdapter` с host, allowPairingPrompt,
requestTimeoutMs и инъекциями HTTP/clock/id для тестов. Credential v1:
`{version:1,clientId:string,authKey:string,certificateFingerprint:string}`.
Транспорт `request({method,path,body?,credential?,signal}): Promise<{status,body}>`;
TLS fingerprint фиксируется до отправки тела и проверяется на каждом соединении.

- [ ] Зафиксировать обезличенную структуру настоящего WWW-Authenticate challenge
  и сертификатный формат read-only запросом; не выводить nonce/key/id.
  Проверить алгоритм и qop перед реализацией Digest; неожиданные значения
  отклонять, не угадывать. Прочитать актуальный producer AES-CBC metadata.
- [ ] Добавить падающие тесты в `test/{digest,transport,philips-adapter}.test.ts`:
  фиксированный HMAC-вектор с raw bytes; Digest URI/nc/stale nonce;
  запрет redirects/смены origin; TLS mismatch до credentials/body;
  bounded response, abort, timeout, отсутствие повторной доставки команды.
- [ ] Реализовать node:https транспорт без глобального TLS bypass и без
  автоматического повтора side-effect POST после сетевой неопределённости.
  Начальный 401 challenge без выполнения команды допускает один Digest resend;
  stale challenge обрабатывается ограниченно, не образуя цикл.
- [ ] Добавить тесты pairing request/grant: HTTP 200 с INVALID_PIN/TIMEOUT/
  CONCURRENT_PAIRING не успех; malformed/неизвестные ответы диагностируются;
  отмена не вызывает grant; reconnect никогда не вызывает PIN.
- [ ] Реализовать адаптер: metadata, credential validation, pair, powerstate
  snapshot, prepareRemote, один POST кнопки, disconnect с отменой запросов.
  Метаданные расшифровывать строго; отсутствие модели — явное общее имя,
  повреждение — диагностируемая ошибка. Не расшифровывать серийный номер.
- [ ] Таблица кнопок: существующий BasicTvButton-каталог (навигация, цифры,
  громкость, каналы, цвета) имеет однозначные jointSPACE-соответствия.
  Прочие TvButton без однозначной семантики возвращают UNSUPPORTED_CAPABILITY.
  Проверить RIGHT→CursorRight и каждый элемент таблицы параметризованным тестом.
- [ ] Запустить `pnpm --filter @remote-webos-tv/philips test` и typecheck пакета;
  ожидается PASS. Обновить wiring сборки и зафиксировать файлы задачи.

### Task 3: Ожидание PIN и жизненный цикл операции

**Files:** tv-adapter `src/index.ts`; API `tv/{pairing-pin,service,operation,device-registry}.ts`;
тесты `tv-pairing-pin.test.ts`, `tv-service.test.ts`, `tv-lifecycle.test.ts`,
`tv-device-registry.test.ts`, `session-expiry.test.ts`.

**Interfaces:** `TvService.submitPin(id:string,pin:string,owner:string):TvOperation`;
`TvService.cancelOwnedPairing(owner:string):Promise<void>`.
`pairing-pin.ts` владеет единственным deferred PIN: request(challenge,signal),
submit и cleanup. Время — scheduler/now сервиса; expiresAt public epoch,
ожидание ограничено monotonic deadline. Секретный протокольный state остаётся в адаптере.

- [ ] Написать падающие тесты с fake scheduler/deferred: publish challenge,
  submit `0123`, два submit → один resolver, expiry, cancel, close, удаление,
  чужой owner, старый operation id и late grant без записи repository.
- [ ] Передавать requestPin в adapter.pair только для явного pair/repair.
  Для pair/repair сохранять owner из авторизованного запроса; убрать challenge
  до продолжения grant и во всех terminal return paths.
- [ ] Сохранение оставить после snapshot и текущих check(context); тестировать
  сбой cipher/repository и сохранение старого credential при неуспешном repair.
- [ ] Расширить revoke: отменять принадлежащее сессии pairing даже у сохранённого
  ТВ, не разрывая соединения другой активной сессии. Не менять семантику power/hold.
- [ ] Запустить перечисленные API-тесты; сначала новые падают, затем PASS.
  Проверить LG/Samsung сценарии без callback. Зафиксировать файлы задачи.

### Task 4: Защищённый API и runtime

**Files:** API `tv/routes.ts`, `tv/rate-limit.ts`, `runtime.ts`, auth policy/logger
(точный владелец определяется из `app.ts`), API `tv-pairing-routes.test.ts`,
`tv-platform-runtime.test.ts`, `logging.test.ts`.

**Interfaces:** `POST /api/tvs/:tvId/operations/:id/pin` → 202 TvOperation;
400 malformed, 401 revoked session, 403 wrong owner/CSRF, 404 unknown operation,
409 consumed/expired/not-waiting, 429 admission limit. Legacy `/api/tv` route,
если зарегистрирован тем же механизмом, получает те же проверки.

- [ ] Добавить route-тесты полного IP→challenge→submit→available через fake
  Philips; неавторизованный запрос никогда не вызывает service.submitPin.
  Повторный/конкурентный submit не повторяет grant; отмена не сохраняет ключ.
- [ ] Использовать действующие session/CSRF/admission механизмы. Протянуть owner
  для всех ручных pair/repair; route не возвращает protocol auth state.
- [ ] Добавить Philips в factory исчерпывающим switch без fallback на LG для
  неизвестной платформы. Ошибки PIN/TLS/protocol проецировать конкретно и безопасно.
- [ ] В logging.test проверить отсутствие PIN, credentials, auth headers и тела
  grant в success/failure diagnostic outputs. Убедиться, что redaction не
  снижает полезность существующих кодов ошибок.
- [ ] Запустить новые route/runtime/logging tests и существующие tv-routes,
  tv-device-routes, tv-command-routes; ожидается PASS. Зафиксировать файлы задачи.

### Task 5: Ввод PIN в существующем UI

**Files:** web `components/TvPairingPin.tsx`, `pages/{AddTv,TvSetup}.tsx`, `api.ts`,
`tv-presentation.tsx`, соответствующие tests; contracts labels при необходимости.
Shared style менять только при отсутствии подходящего существующего класса.

**Interfaces:** `api.submitTvPin(tvId,id,{pin},csrfToken,signal):Promise<TvOperation>`;
`TvPairingPin` принимает operation, busy, onSubmit(pin), onCancel; код очищается
до ожидания ответа, на смене операции и unmount. Родитель владеет операцией.

- [ ] Прочитать актуальное ТЗ UI, PRODUCT и Impeccable/ui-ux-pro-max инструкции,
  применимые к форме. Сверить экран добавления/управления во встроенном браузере.
- [ ] Добавить падающие тесты: выбор Philips Whale без MAC; challenge появляется
  из status polling; inputMode numeric, ведущий ноль, Enter, двойной submit,
  countdown expiry без запроса, отмена, 401, INVALID_PIN и новый явный pair.
- [ ] Реализовать один общий PIN-компонент для добавления и repair; focus на
  появлении, labels/alert, таймер без live-announcement каждую секунду.
  Счётчик не сбрасывается при polling. Нет PIN в local/sessionStorage/URL.
- [ ] Подписи бренда и версии: Whale/Philips вместо webOS/LG; отсутствие версии
  не заменяется API 6.1.0. Питание, Wink и hold недоступны по capabilities.
- [ ] Проверить путь после pair: AddTv onReady срабатывает лишь после сохранённого
  устройства; reconnect не открывает PIN. Нет вложенных form и потери фокуса
  при каждом обновлении статуса.
- [ ] Запустить AddTv/TvSetup/PIN/presentation и соседние Remote/hold tests;
  ожидается PASS. Зафиксировать файлы задачи.

### Task 6: Сквозная проверка и работающий Docker

**Files:** новый web `test/e2e/whale-pairing.spec.ts`, синтетический транспорт
в API test/support, при необходимости docs/development.md.

**Interfaces:** fixture имитирует Philips request/grant/powerstate/key с
детерминированными clock/response barriers, без доступа к реальному LAN.

- [ ] E2E: IP→PIN `0123`→available→RIGHT; отмена и истечение срока; restart API
  с той же БД → reconnect без нового pair/request; repair failure сохраняет старый
  ключ. История принимает Whale, неподдерживаемые power/app не отправляют запрос.
- [ ] Запустить фокусные suites всех задач, `pnpm typecheck`, `pnpm build`.
  Устранить новые ошибки; прежние несвязанные сбои описать с точным основанием.
- [ ] Самопроверка diff: новые enum callers, ошибки 200/JSON, owner и revoke,
  single-delivery, TLS pinning, нет private данных или несвязанных правок.
- [ ] На изолированном браузерном стенде проверить обе темы, 1280 CSS px,
  Tab/Shift+Tab, hover, focus, disabled, PIN ошибки; запустить Impeccable detector
  вручную и подтвердить его находки. Сравнить с применимым утверждённым макетом.
- [ ] Пересобрать и перезапустить активный Docker без удаления volumes,
  защитить несохранённые правки перед reload, осмотреть фактическую страницу.
  Тестовый аккаунт не должен заменять cookie пользователя.
- [ ] Предложить физическое сопряжение из приложения: получить новый PIN от
  пользователя, подтвердить, проверить reconnect и одно отдельно согласованное
  нажатие. Не выдавать API Ok за проверку реакции экрана.
- [ ] Итоговый отчёт: что доступно, результаты свежих проверок, оставшиеся
  ограничения. Не push/merge без отдельного поручения.

## Самопроверка плана

Покрыты все разделы спецификации: протокол/credential/TLS — Task 2;
challenge/lifecycle — Task 3; routes/security — Task 4; платформа/БД/история —
Task 1; общий пульт и UI — Tasks 2/5; реальное приложение — Task 6.
Пять Review Focus имеют явные тесты в Tasks 1–4.
Нативное исполнение предпочтительно: задачи связаны общими интерфейсами,
один исполнитель последовательно отслеживает контракт PIN и отмены.
