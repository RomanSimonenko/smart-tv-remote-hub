# Test Cases Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking. Execution method awaits user review.

**Goal:** Владелец создаёт и сохраняет черновики тест-кейсов и редактирует шаги в БЛЮДЦЕ lab.

**Architecture:** Общие Zod-контракты, SQLite-репозиторий с атомарной проверкой версии, защищённые Fastify-маршруты и React-список/редактор. Использовать существующие HTTP-защиту, API-клиент, диалоги и токены. Не перестраивать управление телевизорами.

**Tech Stack:** TypeScript, Zod 4, better-sqlite3, Fastify 5, React 19, Vitest, Playwright.

**Spec:** ../specs/2026-10-12-test-cases-design.md

## Global Constraints

- Название 1–200 символов после trim; описание до 10000; группа до 100.
- Не более 200 шагов, текст шага 1–2000 после trim; UUID кейса и шагов.
- Шаги given/when/then, порядок внутри блока; одинаковые ID шагов запрещены.
- Пустые шаги разрешены только как отсутствие шагов в черновике, пустой текст существующего шага запрещён.
- Версия с 1, только положительное целое; изменение атомарно увеличивает её.
- Состояние только «Черновик». Импорта, выполнения, удаления кейсов и команд ТВ нет.
- Приватные данные отсутствуют в исходниках, журналах и QA-артефактах.
- Сохранить текущие несвязанные изменения бренда; не коммитить и не отправлять без запроса пользователя.

## Review Focus

1. Два открытых редактора: устаревшая версия не перезаписывает новую (задачи 1–3).
2. Повторное нажатие сохранения или неясный сетевой исход не создаёт молча дубликат (задачи 1–3).
3. Запоздавший ответ при переходе/выходе не подменяет открытый кейс (задача 3).
4. Истечение сессии при правках не инициирует команды или автоматическую повторную запись (задачи 2–3).
5. Недоступная база, повреждённая схема или данные дают явную ошибку без успешного уведомления (задачи 1–3).

## Решения интерфейсов

TestCaseStep = { id: string; kind: 'given'|'when'|'then'; text: string }.
TestCaseDraft = { title: string; description: string; group: string; steps: TestCaseStep[] }.
TestCase = TestCaseDraft & { id: string; version: number; createdAt: number; updatedAt: number; status: 'draft' }.
CreateTestCase = TestCaseDraft & { id: string }; клиент выдаёт UUID до первой записи.
UpdateTestCase = TestCaseDraft & { version: number }.

GET /api/test-cases → { cases: TestCase[] }; GET /api/test-cases/:id → TestCase.
POST /api/test-cases → 201 TestCase; повтор того же id с тем же нормализованным
содержимым возвращает сохранённую версию без дубликата; другое содержимое → 409.
PUT /api/test-cases/:id → 200 TestCase, несовпадение версии → 409 VERSION_CONFLICT.
404 NOT_FOUND, 400 BAD_REQUEST; ошибки имеют существующий apiErrorSchema.
Сетевой сбой при создании сохраняет id и правки для явного повторного сохранения.

### Task 1: Контракты и постоянное хранение

**Files:** Create packages/contracts/src/test-cases.ts, packages/contracts/test/test-cases.test.ts,
apps/api/src/test-cases/repository.ts, apps/api/test/test-case-storage.test.ts.
Modify packages/contracts/src/index.ts, apps/api/src/storage/migrations.ts,
apps/api/src/storage/database.ts и существующие тесты миграций.

**Interfaces:** Экспортировать testCaseStepSchema, testCaseDraftSchema,
createTestCaseSchema, updateTestCaseSchema, testCaseSchema, testCasesResponseSchema
и перечисленные выше типы. createTestCaseRepository(sqlite, {now}) →
{ list(): TestCase[]; read(id): TestCase | undefined; create(input): TestCase;
update(id,input): TestCase }. Ошибки TestCaseConflictError/TestCaseNotFoundError.
Идентификатор кейса приходит в create; часы now инъецируются для детерминированных тестов.

- [ ] Написать тесты схем: trim, пустое имя, пределы 200/201, 10000/10001,
100/101, 200/201 шагов, текст 2000/2001, неверные kind/UUID, дубли id, версия 0.
- [ ] Запустить `pnpm --filter @remote-webos-tv/contracts test`; убедиться в падении новых тестов до реализации.
- [ ] Реализовать схемы и экспорты.
- [ ] Написать тесты хранения: create/read/reopen, версия 1→2, устаревшее обновление,
404, повтор создания без дубля, конфликт id с другим содержимым, сохранение порядка.
- [ ] Добавить миграцию 7: test_cases(id PRIMARY KEY,title,description,group_name,
steps_json,version,created_at,updated_at); проверку схемы при запуске. Сохранить
существующий backup-before-upgrade. UPDATE с WHERE id AND version в транзакции.
Проверять сохранённые данные общей схемой, не превращать повреждение в пустой список.
- [ ] Проверить апгрейд v6 с синтетическим профилем/ТВ и повреждённую v7.
- [ ] Запустить `pnpm --filter @remote-webos-tv/api test -- test/test-case-storage.test.ts`
и существующие тесты database/migrations; все должны пройти.

### Task 2: Защищённое API

**Files:** Create apps/api/src/test-cases/routes.ts, apps/api/test/test-case-routes.test.ts.
Modify apps/api/src/app.ts, apps/api/src/runtime.ts.

**Interfaces:** registerTestCaseRoutes(app, repository): void;
AppDependencies.testCases?: TestCaseRepository. Runtime передаёт репозиторий
после открытия базы. Отсутствие auth при подключённом репозитории — ошибка запуска,
как для профиля. API использует контракты задачи 1.

- [ ] Написать тесты полного пути create→list→read→update; 400/404/409;
без cookie 401, без Origin/CSRF 403; ошибку репозитория без утечки текста кейса.
- [ ] Запустить `pnpm --filter @remote-webos-tv/api test -- test/test-case-routes.test.ts`;
подтвердить падение до регистрации маршрутов.
- [ ] Реализовать маршруты с общей auth-политикой; не добавлять их в публичные
исключения. Мутации ограничить 20 запросами/минуту на владельца по паттерну профиля.
Не логировать body. Сохранять существующие requestId и обработчик неожиданных ошибок.
- [ ] Добавить проверку 429, повтор создания, конфликт двух PUT одной версии,
отозванную сессию и отклонение неверного response schema.
- [ ] Повторить тест маршрутов и текущие auth/profile/http-policy тесты.

### Task 3: Список, редактор и защита правок

**Files:** Modify apps/web/src/api.ts, apps/web/src/pages/Home.tsx,
apps/web/src/components/AppSidebar.tsx, apps/web/src/style.css и их тесты.
Create apps/web/src/useTestCases.ts, apps/web/src/useTestCases.test.ts,
apps/web/src/pages/TestCases.tsx, apps/web/src/pages/TestCases.test.tsx,
apps/web/src/pages/TestCaseEditor.tsx, apps/web/src/pages/TestCaseEditor.test.tsx.
Reuse existing ConfirmDialog; при необходимости создать узкий UnsavedChangesDialog.

**Interfaces:** api.listTestCases(signal?), api.getTestCase(id,signal?),
api.createTestCase(input,csrfToken,signal?), api.updateTestCase(id,input,csrfToken,signal?).
Все ответы parse общими схемами. useTestCases(csrfToken,onSessionExpired)
владеет загрузкой/сохранением, ошибкой и отменой при unmount.
TestCases принимает cases/loading/error/onCreate/onOpen/onRetry;
TestCaseEditor принимает initialCase/onSave/onBack/onDirtyChange/saving/error,
onReloadConflict. Home хранит активный кейс и общий запрос выхода.

- [ ] Написать тесты списка: пустое состояние, поиск по имени/описанию,
фильтр группы, версии, отсутствие ложной готовности и работающей кнопки запуска.
- [ ] Написать тесты редактора: create/edit/save, блоки, выбор шага,
перемещение внутри блока, удаление, валидация, сохранение текста при ошибке.
- [ ] Запустить соответствующие Vitest-тесты; подтвердить падение до реализации.
- [ ] Реализовать API-методы и hook: AbortController для чтения, защита от
запоздавших ответов, один save одновременно; UUID создания сохраняется при повторе.
При 401 вызвать существующий session-expired flow, не повторять запись автоматически.
- [ ] Реализовать список/редактор по макетам 04/05 и токенам. Название/описание/
группа и текст шагов используют native controls; ошибки привязаны к полям.
Уведомление об успехе появляется после ответа. 409 предлагает явную перезагрузку
с подтверждением потери правок, без автоматического затирания формы.
- [ ] Подключить cases/editor в Home и cases в activeSection/onOpenTestCases.
Расширить существующий leave-guard на редактор, сохранив поведение профиля.
Диалог редактора: сохранить/выйти без сохранения/продолжить; ошибка save оставляет
диалог и правки. beforeunload активен при dirty; выход/переход блокируется во время save.
- [ ] Добавить тесты конфликтов, двойного save, потерянного ответа create,
устаревшего чтения, ошибки save в leave-dialog, отмены выхода и 401.
- [ ] Запустить `pnpm --filter @remote-webos-tv/web exec vitest run src/useTestCases.test.ts src/pages/TestCases.test.tsx src/pages/TestCaseEditor.test.tsx src/components/AppSidebar.test.tsx src/App.test.tsx`.

### Task 4: Сквозная и визуальная проверка

**Files:** Create apps/web/test/e2e/test-cases.spec.ts; update design-qa.md.

- [ ] Прочитать существующие e2e fixtures/config и добавить синтетический flow:
создать кейс, сохранить, reload, открыть, изменить порядок/текст, повторно сохранить.
Проверить поиск, несохранённые изменения и конфликт через второй API-клиент.
- [ ] Выполнить `pnpm --filter @remote-webos-tv/web exec playwright test test/e2e/test-cases.spec.ts`
с предусмотренным репозиторием запуском тестового сервера; никаких реальных ТВ.
- [ ] Выполнить `pnpm typecheck`, `pnpm build`, `pnpm -r test`, `git diff --check`.
Не исправлять несвязанные падения молча: записать причину и влияние.
- [ ] Пересобрать активное Docker-приложение существующим compose и override,
сохраняя его volume и конфигурацию. Не вносить локальные пути/порты в исходники.
- [ ] Осмотреть пустой список, синтетический заполненный список, редактор,
ошибку и оба состояния меню. Сравнить с макетами при сопоставимом viewport;
проверить узкое окно и фокус диалогов. Синтетические записи держать в отдельной
тестовой базе, не создавать и не удалять данные владельца ради скриншотов.
- [ ] Обновить design-qa.md с реальными результатами и оставшимися отличиями.
Просмотреть весь diff на контракты, приватность и несвязанные изменения.

## Самопроверка плана

Все требования согласованного этапа распределены по задачам 1–4. Изменение
профиля и управление ТВ остаются за своими владельцами. Создание получает
клиентский UUID для безопасного явного повтора после сетевой ошибки; это
уточнение контракта не добавляет запуск, импорт или удаление.
