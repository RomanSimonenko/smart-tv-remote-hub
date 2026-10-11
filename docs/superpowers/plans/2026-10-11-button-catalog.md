# Button Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Общий каталог всех 28 действий пульта, repeat LG и безопасный native hold Samsung.

**Architecture:** Метаданные принадлежат contracts, перевод протокольных команд — адаптерам. Сервер владеет нативным удержанием конкретного ТВ; UI управляет жестом, но не отвечает один за гарантированное завершение. Существующие обычные команды, Wink и питание сохраняются.

**Tech Stack:** TypeScript, Zod, Fastify, React, Vitest, Playwright; без новых зависимостей.

**Spec:** `docs/superpowers/specs/2026-10-11-button-catalog-design.md`

## Execution results — 2026-10-11

Tasks 1–4 implemented inline. Catalog has 28 actions (26 ordinary buttons plus Wink/power). New hold routes reuse command-routes admission/auth/limiter instead of duplicating a route module. Native capability is optional and per button; Samsung now supports six actions (UP/DOWN/LEFT/RIGHT/VOLUME_UP/VOLUME_DOWN), LG repeats six actions. Server owns hold cleanup independently of UI.

### Approved extension: Samsung arrows and volume

The user approved all six native actions above. The adapter derives its advertised capability and admission list from the catalog. Other actions remain single-click; LG repeat and server cleanup budgets are unchanged. Regression tests cover exact Press/Release frames, unsupported actions, keyboard release, blur, settings and unmount for all six. Only RIGHT has physical-TV confirmation; this extension sends no commands to a physical TV. Earlier RIGHT-only task descriptions below record the initial implementation scope.

Verification: contracts 258, web 314, Tizen 106, webOS 136, protocol-probe 60 tests passed; final API run 434 passed. Typecheck, production build, `git diff --check` and 32 unified UI browser tests passed. Deterministic regression tests caught and fixed full-cache replay eviction, expired-receipt admission, and cancellation before deferred Press. Independent review completed; no physical TV commands sent during implementation. No commit/push/PR authorized in this execution.

Docker production image rebuilt successfully; existing application container is Healthy, with data volumes preserved. The checklists below retain the original execution sequence; commit steps remain intentionally unexecuted.

## Global Constraints

- Все 28 действий текущего пульта сохраняются, раскладка не меняется.
- LG: repeat только UP/DOWN/LEFT/RIGHT/VOLUME_UP/VOLUME_DOWN, 400 мс до повтора и 200 мс между повторами; занятые интервалы пропускаются.
- Samsung: native объявляется покнопочно; первоначально RIGHT, проверенный пользователем. Остальные кнопки сохраняют одиночное нажатие до отдельной проверки.
- Питание и Wink не приобретают удержание. Старые API и подтверждение выключения сохраняются.
- Никаких команд физическим ТВ без отдельного согласования. Посторонние незакоммиченные правки сохраняются.

## Review Focus

1. Release приходит раньше завершения Press: после завершения записи Press немедленно отправляется Release.
2. Потеря вкладки/сессии: сервер ограничивает срок удержания и освобождает кнопку независимо от UI.
3. Два пользователя или два ТВ: владелец одного удержания не может освободить чужое.
4. Повтор запроса Press/Release: не вызывает повторного нажатия или освобождения новой операции.
5. Потеря сокета после Press: результат unknown, автоматического повторного Press нет.

## Task 1: Каталог без изменения поведения

**Files:** create `packages/contracts/src/tv-actions.ts` and its test; modify `packages/contracts/src/index.ts`, `apps/web/src/pages/Remote.tsx`; test `apps/web/src/pages/Remote.test.tsx`.

**Interfaces:** export `tvActionCatalog`, `TvActionId`, `getTvAction(id: TvActionId)`. Запись: id, label, group, kind (`button|app|power`), keyboardKeys, holdByPlatform (`none|repeat|native`). Обычные id совпадают с BasicTvButton; специальные id — `wink`, `power`. Группы: numeric, navigation, volume, channel, color, app, power. Политика LG задаётся один раз в каталоге; native определяется также runtime-возможностями.

- [x] Написать тесты: точное множество 26 BasicTvButton плюс wink/power, уникальность, LG repeat только для шести названных кнопок, специальные действия none.
- [ ] Запустить `pnpm --filter @remote-webos-tv/contracts test`, убедиться в ожидаемом RED.
- [ ] Реализовать каталог; перевести подписи, группы и клавиатурные привязки Remote на него. Иконки и CSS оставить в UI. Схему обычных команд не расширять питанием/Wink.
- [ ] Запустить тесты contracts и `pnpm --filter @remote-webos-tv/web exec vitest run src/pages/Remote.test.tsx`; сохранить проверку повторов LG fake timers: 399 мс нет повтора, 400 мс повтор, ещё 200 мс следующий; busy не накапливает очередь.
- [ ] Проверить diff; отдельный коммит только файлов задачи после разрешения пользователя на фиксацию.

## Task 2: Samsung native transport

**Files:** modify `packages/tv-adapter/src/index.ts`, `packages/tizen/src/samsung-adapter.ts`; tests в существующем наборе `packages/tizen/test` (точный файл выбрать по тестам sendButton).

**Interfaces:** optional `pressButton(button: TvButton, signal: AbortSignal): Promise<void>` и `releaseButton(button: TvButton, signal: AbortSignal): Promise<void>`; optional `nativeHoldButtons: readonly TvButton[]` адаптера. Первоначально только RIGHT. Старый sendButton остаётся Click. LG не реализует эти методы.

- [ ] Добавить RED-тесты точных пакетов: Press/Release KEY_RIGHT, без Click, прежний sendButton остаётся Click; неподдерживаемые кнопки отклоняются до отправки.
- [ ] Запустить `pnpm --filter @remote-webos-tv/tizen test` и увидеть RED.
- [ ] Расширить существующий sendKey параметром Cmd, переиспользовать его обработку доставки/ошибок. Release использует отдельный живой сигнал, не отменённый сигнал Press.
- [ ] Проверить отказ до записи и unknown после записи, разрыв сокета, callback/error гонки; запустить весь набор tizen.
- [ ] Проверить diff; фиксация отдельно от других задач при разрешении.

## Task 3: Серверное владение удержанием

**Files:** create `apps/api/src/tv/hold.ts`, `apps/api/src/tv/hold-routes.ts` и тесты; modify `apps/api/src/tv/service.ts`, `apps/api/src/app.ts`, `packages/contracts/src/tv-command.ts`, `packages/contracts/src/index.ts`.

**Interfaces:** новая схема `TvHoldRequest = {id: UUID; button: BasicTvButton; phase: 'press'|'release'}`; POST `${prefix}/holds` для existing legacy и per-TV prefixes. Ответ использует текущие outcome sent/rejected/unknown. Состояние enabled remote получает optional `nativeHoldButtons`. Отсутствующее поле = пустое множество. Внутренний метод сервиса `hold(input: TvHoldRequest, owner: string, signal: AbortSignal): Promise<TvCommandResult>`.

- [ ] Написать RED-тесты всех пяти Review Focus случаев с управляемыми promise barriers и scheduler; не использовать реальные sleeps. Дополнительно: malformed UUID/button, чужая сессия, неавторизованный запрос, unavailable, неподдерживаемая кнопка, параллельная обычная команда.
- [ ] Запустить соответствующие новые API/contracts тесты, убедиться в RED.
- [ ] Реализовать по одному владельцу hold на ТВ, общий с обычными командами gate. Release обходит только gate собственной операции, но не auth/CSRF/ownership. Срок удержания 5 секунд от принятия Press; это защитный предел, не обещание поддержки долгих действий. Завершённые идентификаторы хранить ограниченно (до 256, TTL 60 секунд), повторное использование с другой кнопкой отклонять.
- [ ] При раннем Release дождаться завершения записи Press и затем отправить Release. Отзыв сессии, deadline, shutdown и disconnect инициируют cleanup; его отдельный бюджет 2 секунды. Ошибка cleanup остаётся unknown; новый Press блокируется до закрытия сомнительного транспорта. Старый id после cleanup не может снять новое удержание.
- [ ] Маршрут переиспользует существующие auth/CSRF, admission/rate-limit и per-TV resolution. Не создавать незащищённый release endpoint. Отмена HTTP не отменяет обязанность cleanup.
- [ ] Запустить contracts/API tests и `pnpm typecheck`; проверить все return paths и отсутствие токенов в логах.
- [ ] Проверить diff; фиксация при разрешении.

## Task 4: Жест удержания в веб-пульте

**Files:** modify `apps/web/src/api.ts`, `apps/web/src/pages/Remote.tsx`; create `apps/web/src/useTvHold.ts` and test; modify `apps/web/src/pages/Remote.test.tsx`, `apps/web/test/e2e/unified-remote-ui.spec.ts`.

**Interfaces:** `api.holdTvButton(input: TvHoldRequest, csrfToken: string, signal: AbortSignal, tvId?: TvId)`; `useTvHold` owns client gesture id and starts/releases through that API. Remote selects native only when catalog and runtime both permit it; LG repeat remains existing mechanism.

- [ ] RED: pointerdown/up and keyboarddown/up produce one Press and one Release with same id; browser key-repeat produces no extra Press/Click. Early release, pointercancel, blur, hidden, unmount, TV switch and settings modal all release owner. Unsupported native has no hidden repeat fallback.
- [ ] Запустить web tests и увидеть RED.
- [ ] Реализовать hook; удерживаемая кнопка остаётся доступной для отпускания при busy. Pointer capture и suppressedClick исключают дополнительный Click. Не дублировать интервалы/списки кнопок вне каталога.
- [ ] Проверить ошибки Press/Release: не объявлять физическое исполнение по одной успешной записи пакета; unknown остаётся видимым. Сохранить текущую область сообщений без сдвига пульта/камеры.
- [ ] Запустить `pnpm --filter @remote-webos-tv/web test`, `pnpm typecheck`, собрать web и прогнать `unified-remote-ui.spec.ts` на свежей сборке. Проверить все 28 действий и неизменную геометрию на synthetic fixtures.
- [ ] Запустить итоговый `pnpm test` и `git diff --check`, проверить diff на посторонние изменения. После успешных проверок обновить Docker существующим compose, не удаляя тома. Физические проверки остальных Samsung-кнопок запросить отдельно.

## Execution handoff

План предлагается выполнить в этой сессии последовательно; альтернативно — отдельными субагентами с проверкой каждого этапа. Перед реализацией пользователь проверяет план и выбирает способ выполнения. Push/PR/merge этим документом не разрешаются.
