---
name: remotewebostv-runner-check
description: Use when diagnosing or verifying RemoteWebOSTV test-run execution, camera snapshots, OCR text conditions, cancellation, or persisted results. Not for standalone TV commands, general UI polish, or implementing a new visual-comparison method.
---

# Проверка раннера и OCR

Найди этап, на котором наблюдаемый результат расходится с сохранённым
состоянием. Все пути ниже заданы от корня репозитория. Правила работы
с настоящим ТВ дополняет `remotewebostv-tv-check`; для синтетических
проверок загружать его не нужно.

## Выбери границу сбоя

| Наблюдение | Владелец и узкая проверка |
|---|---|
| Команда, пауза, повтор, устаревший кадр | `apps/web/src/run-execution.ts`, `apps/web/src/run-execution.test.ts`, `apps/web/src/camera-snapshot.ts` |
| Порядок шагов, lease, остановка, перезапуск | `apps/api/src/test-runs/service.ts`, `apps/api/test/test-run-service.test.ts`, `apps/api/test/test-run-lease.test.ts` |
| JPEG, запись, квота, потерянные свидетельства | `apps/api/src/test-runs/artifacts.ts`, `apps/api/src/test-runs/repository.ts`, `apps/api/test/test-run-storage.test.ts` |
| OCR verdict и остановка после ошибки | `apps/api/test/test-run-ocr.test.ts`, `apps/api/src/test-runs/service.ts` |
| Ошибка worker, модели, timeout | `apps/api/src/ocr/recognizer.ts`, `apps/api/src/ocr/worker.py`, `apps/api/test/ocr-recognizer.test.ts` |
| API, история, отчёт показывают разное | `apps/api/test/test-run-routes.test.ts`, `apps/web/test/e2e/ocr-verification.spec.ts` |

Прочитай нужного владельца и его тест. До изменения зафиксируй ошибку,
неверный переход или failing assertion. Синтетический run ID и управляемые
барьеры позволяют проверить гонку без настоящего ТВ и случайных ожиданий.
Не запускай реальный кейс ради проверки отчёта или отображения снимка.

## Проверь последовательность

1. Сервер принимает advance для текущего item и фиксирует исход доставки.
   Браузер ждёт настроенную `pauseAfterMs` от получения подтверждения,
   получает свежий кадр и загружает его. Не добавляй вторую паузу,
   повтор команды или цикл распознавания для подавления сбоя.
2. Снимок сохраняется до результата проверки. Шаг с несколькими действиями
   сохраняет кадры действий; OCR условий шага относится к последнему
   действию. Описательный шаг получает один кадр без искусственной паузы.
3. Все `textConditions` проверяются на одном сохранённом кадре. Найди
   текущий `matchTextConditions` и правила нормализации; не дублируй matcher
   и не собирай успешный результат из разных кадров. Сопоставь SHA кадра,
   распознанные блоки, условия и сохранённый verdict.
4. Различай `failed` (текстовое условие не выполнено), `error` (технический
   сбой) и `needs_review` (выполнение без автоматического verdict).
   Геометрия экрана, совпадение текста и сравнение с эталоном — разные
   проверки. Наличие последнего не предполагай без реализации.
5. После отмены, logout или рестарта проверь сохранённый итог, отсутствие
   следующей команды и игнорирование позднего OCR/кадра. Reload отчёта
   не должен возобновлять исполнение или включать камеру.

## Проверка результата

Запусти выбранный тест напрямую через `pnpm --filter <package> exec vitest
run <file>`; для сквозного сценария используй существующую Playwright fixture
с синтетическими ТВ и JPEG. Успех mock recognizer не доказывает работу
PaddleOCR. Для реального worker проверь доступность Python и моделей,
конфигурацию recognizer и передачу нужных env в тестовый процесс;
не устанавливай другой runtime в качестве случайного обхода ошибки.

При изменении persistence/verdict проверь путь от загрузки JPEG через
хранилище до API и отчёта, включая повторное чтение. Реальные кадры и
приватные сценарии остаются вне Git. Для синтетического стенда изолируй
cookies от пользовательской сессии: один другой порт этого не обеспечивает.

Спецификации: `docs/superpowers/specs/2026-10-15-camera-runner-design.md`
и более позднее уточнение `docs/superpowers/specs/2026-10-18-ocr-step-verification-design.md`.
В `docs/test-runs.md` есть описание до появления OCR; его фраза об отсутствии
OCR не отменяет текущую реализацию. Сообщи конкретный этап сбоя, пройденные
проверки и отдельно то, что осталось непроверенным на настоящем устройстве.
