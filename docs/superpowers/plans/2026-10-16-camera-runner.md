# Запуск тест-кейса со снимками — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Выполнять сохранённый кейс на выбранном ТВ, сохранять свежие кадры и открывать постоянный отчёт.

**Architecture:** Сервер владеет неизменяемым снимком сценария, порядком переходов, блокировкой ТВ и хранением. Браузер владеет MediaStream и захватом кадра. Следующая команда разрешена только после сохранения предыдущего свидетельства; повтор сетевого запроса не повторяет команду.

**Tech Stack:** TypeScript, Zod, Fastify, SQLite, React, Vitest; существующие адаптеры ТВ и Docker volume. Новые зависимости не требуются.

**Spec:** `docs/superpowers/specs/2026-10-15-camera-runner-design.md` (согласовано пользователем 2026-10-16).

## Global Constraints

- Порядок: команда → подтверждённая доставка → pauseAfterMs → свежий кадр → сохранение.
- Описательный шаг получает один кадр; шаг с действиями — один кадр после каждого действия.
- Конечный статус завершённой последовательности — «Требуется проверка»; автоматического вердикта нет.
- Реальный ТВ используется только после явного начала запуска пользователем.
- Реальные сценарии и кадры не попадают в репозиторий.
- Сохранять текущие локальные изменения; не переносить из макета ошибочные галочки успешной проверки.
- Дизайн: общая оболочка и токены; камера слева, параметры/шаги справа; внутренние прокрутки; уведомления вне видео; существующий feedback камеры 44 px.

## Review Focus

- Потерянный ответ на команду: повтор запроса читает результат, не отправляет команду повторно (Task 3).
- Остановка во время команды/сохранения: фактическая доставка и уже сохранённые кадры остаются в отчёте (Tasks 2–3).
- Logout, закрытие вкладки, рестарт сервера: нет автоматического возобновления и вечной блокировки (Task 3).
- Ошибки диска, повреждённый кадр и превышение квоты: дальнейшие команды прекращаются (Task 2).
- Изменение кейса и несохранённые правки: запуск использует одну сохранённую версию (Tasks 1, 5).

## Task 1: Контракты и готовность кейса

**Files:** modify `packages/contracts/src/test-cases.ts`, `packages/contracts/src/index.ts`, `apps/api/src/test-cases/repository.ts`, `apps/api/src/storage/migrations.ts`; create `packages/contracts/src/test-runs.ts`; tests in existing contracts/test and API storage suites.

**Interfaces:** `TestCaseDraft.status` = `draft | ready`, отсутствующий входной статус нормализуется в `draft`; старые записи мигрируют в `draft`. `TestRun` хранит case snapshot, tvId/platform/display name, run UUID, timestamps, status `running | needs_review | stopped | error`, ordered evidence items and structured failure. Каждый item содержит stepId, optional actionId, ordinal, command delivery outcome, capture/save times and camera label; публичные данные не содержат файловых путей.

- [x] Добавить тесты: старые записи читаются; ready требует непустые steps; draft допускает пустые steps; запуск требует хотя бы один шаг; неизвестные поля/повтор UUID отклоняются.
- [x] Выполнить contracts и API storage tests; зафиксировать ожидаемые падения.
- [x] Добавить схемы, экспорт и миграцию статуса; repository читает/сохраняет статус вместо literal draft.
- [x] Выполнить соответствующие suites и typecheck contracts/API.

## Task 2: Постоянные отчёты и файлы

**Files:** create `apps/api/src/test-runs/repository.ts`, `apps/api/src/test-runs/artifacts.ts`, `apps/api/test/test-run-storage.test.ts`; modify migrations/config/runtime as needed.

**Interfaces:** `createTestRunRepository(sqlite, {now})` exposes create/read/list/update with compare-and-set transition; `createArtifactStore({dataDir,maxBytes})` exposes save/read/recover. Файлы располагаются под dataDir; имена только из проверенных UUID. Snapshot upload = JPEG binary, максимум 5 MiB; image dimensions проверяются по JPEG header, максимум 4096×4096. Квота новых кадров по умолчанию 1 GiB, конфигурируется `RUN_ARTIFACT_MAX_BYTES`; старые отчёты не удаляются. Размер, идентичность и SHA-256 сохраняются в БД. Повтор того же кадра возвращает сохранённый результат; другой content для той же identity — 409.

- [x] Написать тесты immutable case snapshot, stable ordering/pagination, upload retry, conflicting retry, invalid JPEG, payload/quota limits, disk failure and restart recovery.
- [x] Запустить tests и подтвердить падения.
- [x] Реализовать temporary file → atomic rename → transaction; при неуспехе записать конкретный failure stage. На старте удалить временные файлы и согласовать dangling files/rows; committed missing artifact — явная ошибка.
- [x] Выполнить storage tests, проверить отсутствие публичной static-раздачи кадров.

## Task 3: Серверное исполнение и владение ТВ

**Files:** create `apps/api/src/test-runs/service.ts`, `apps/api/src/test-runs/routes.ts`, `apps/api/test/test-run-service.test.ts`, `apps/api/test/test-run-routes.test.ts`; modify `apps/api/src/tv/service.ts`, command/power/device/routes, `app.ts`, `runtime.ts`.

**Interfaces:** service methods `start`, `read`, `advance`, `saveSnapshot`, `heartbeat`, `stop`, `fail`, `close`. Все mutation requests имеют UUID; start idempotent по run UUID и сохранённым параметрам. `advance(runId,itemId)` выполняет только ожидаемый item; команда фиксируется как pending до отправки, повтор не исполняет pending/unknown снова. При `sent` сервер задаёт captureNotBefore после pauseAfterMs. Upload доступен только для ожидаемого item после этой границы.

**API:** `POST /api/test-runs` {id,caseId,version,tvId}; `GET /api/test-runs?before=…&limit=…` (default 25, max 100, stable timestamp/id cursor); `GET /api/test-runs/:id`; `POST .../:id/advance` {itemId}; `POST .../:id/heartbeat`; `POST .../:id/stop`; `POST .../:id/failure` {stage,code}; `PUT .../:id/items/:itemId/snapshot` binary JPEG with validated capture metadata headers; `GET .../:id/items/:itemId/snapshot`. Все пути требуют session; mutations используют существующую CSRF-защиту и mutation rate limit. Ошибки: 400 invalid, 404 missing, 409 conflict/busy, 413 size, 422 unsupported, 503 storage. Диагностика без кадров/текстов кейсов/секретов в логах.

**Lifecycle:** heartbeat каждые 5 s, lease 20 s; допустимая пауза действия расширяет expiry до captureNotBefore + 20 s. Таймеры и clock инъецируются. Upload timeout 10 s; frame timeout 5 s. Lease loss/session revocation/shutdown прерывают будущие команды; восстановленные running записи становятся error. На уровне TvService хранить lease запуска; manual commands/holds/power/connect/forget/delete отвергаются во время lease, чтение статуса разрешено. Runner передаёт lease token внутреннему вызову; HTTP не может выбрать этот token.

- [x] Написать deterministic tests порядка, двух стартов/вкладок, всех command outcomes, остановки в каждой фазе, heartbeat expiry, revocation и restart; использовать deferred promises/fake clock без sleeps.
- [x] Добавить API tests auth/CSRF, route aliases, ручных команд/holds/power/delete во время запуска, повторов advance/upload после потери ответа.
- [x] Запустить tests и подтвердить отсутствие нужного поведения.
- [x] Реализовать state machine, owner-level lease, routes и runtime cleanup. Перед изменением методов TvService проследить их callers и sibling paths.
- [x] Запустить API suites и typecheck; убедиться, что обычный пульт вне запуска сохраняет прежнее поведение.

## Task 4: Свежий кадр существующей камеры

**Files:** modify `apps/web/src/components/Webcam.tsx`, `Webcam.test.tsx`; create `apps/web/src/camera-snapshot.ts` and tests.

**Interfaces:** `WebcamHandle.capture(signal): Promise<{blob:Blob,capturedAt:number,cameraLabel:string}>`; prop `onReadyChange(boolean)`; ref через существующий React-compatible механизм. capture вызывается только после серверной паузы; ждёт новый requestVideoFrameCallback, активный video track, положительные dimensions и успешный JPEG encode. Для браузера без frame callback — явная неподдерживаемая возможность, без выдачи старого кадра. Controls блокируются во время запуска; остановка потока делает ready=false и прекращает pending capture. Snapshot JPEG quality 0.9, уменьшается до 1920 px по длинной стороне.

- [x] Тесты нового frame, track ended, zero dimensions, timeout, abort, encode failure, unmount и повторного включения; существующий Remote не меняется.
- [x] Запустить tests, реализовать API захвата с cleanup timers/callbacks, повторно выполнить Webcam и capture suites.

## Task 5: Подготовка, выполнение, история и отчёт

**Files:** create `apps/web/src/pages/TestRunner.tsx`, `TestRuns.tsx`, `TestRunReport.tsx`, `apps/web/src/useTestRun.ts` и tests; modify api/Home/navigation-state/AppSidebar/TestCases/TestCaseEditor/style.css and their tests.

**Interfaces:** API client строго парсит run responses; hook исполняет advance → ожидание сервера → capture → upload, проверяя AbortSignal перед каждой фазой. Retry GET/upload допустим; неизвестная доставка не повторяется. Reload открывает отчёт без запуска камеры/команд. История хранит только runId. Навигация во время выполнения предлагает остановить запуск; unmount отменяет local work и best-effort stop, серверный lease остаётся гарантией при сетевом отказе.

- [x] Тесты Play в строке без открытия редактора, disabled reason пустого кейса, save-before-run без discard, readiness/version conflict, недоступной камеры/ТВ/команды.
- [x] Тесты double Start, stop/401/upload failure, последовательности из пяти synthetic snapshots, reload report, pagination и длинных описаний.
- [x] Реализовать readiness selector и запуск из списка/редактора. Переиспользовать общий unsaved-changes механизм, но для запуска предложить только сохранить или остаться.
- [x] Реализовать три состояния по `docs/design/mockups/2026-10-15-runner/01-runner-flow.png` и поправкам README; запуск через существующий Webcam, текущий item виден, Start/Stop вне прокрутки, кадры выбираются клавиатурой.
- [x] Выполнить web tests/typecheck; отчёт содержит конкретную причину остановки, времена и подпись «Снимок сохранён», без verdict галочек.

## Task 6: Полная проверка и работающий Docker preview

- [x] Выполнить `pnpm test`, `pnpm typecheck`, `pnpm build`, `pnpm test:docker`; не маскировать baseline failures.
- [x] Проверить synthetic browser camera + fake adapter end-to-end: пять кадров в правильном порядке; отказ камеры/хранилища; lease conflict; report после restart. Реальный ТВ автоматически не трогать.
- [x] Проверить diff: local changes сохранены, нет secrets/paths/real screenshots, все return paths cleanup, нет новых dependencies.
- [x] Пересобрать и перезапустить существующий Docker preview без удаления volumes. Перед reload проверить несохранённые правки вкладки.
- [x] Снять работающие preparation/execution/report/history при сопоставимом desktop viewport; сравнить с макетом и общими токенами. Проверить длинный список, фокус, scroll, collapsed sidebar и ошибки вне видео. Исправить расхождения, записать остаточные ограничения.
- [x] Отчитаться о реально выполненных проверках и доступности в preview. Реальный пятикадровый прогон остаётся ручной приёмкой после явного старта пользователем.

## Ручная приёмка — 2026-10-16

Пользователь сообщил в рабочем чате, что приёмка на реальном ТВ уже проведена.
Повторный аппаратный запуск агентом не выполнялся. Детальные измерения и сценарии
приёмки в этом сообщении не перечислены; дополнительные результаты не приписываются.
