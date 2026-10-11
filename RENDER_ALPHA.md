# Альфа в Telegram на Render

Альфа использует один Alpha Core на NVIDIA и принимает сообщения Telegram через webhook.

```text
Telegram -> Render /api/telegram -> Alpha Core -> NVIDIA -> ответ
```

## Почему webhook

Бесплатный Render останавливает web service после периода без входящего трафика. Polling работает только пока процесс уже запущен и поэтому не может разбудить уснувший сервис. Webhook превращает каждое сообщение Telegram во входящий HTTP-запрос, который будит Render.

После пробуждения Альфа сразу пишет временную реплику про звёзды, а затем заменяет её полноценным ответом. Само пробуждение бесплатного Render может занять заметное время: пока процесс спит, код Альфы физически не выполняется.

## Переменные окружения

Обязательные:

- `ALPHA_BOT_TOKEN` - токен `@AlphaAllod_bot`.
- `ALPHA_API_KEY` - основной ключ NVIDIA NIM.
- `ALPHA_API_FALLBACKS` - отдельный ключ NVIDIA для резервных моделей. Если пустой, используется основной ключ.

Значения из `render.yaml`:

- `ALPHA_TELEGRAM_MODE=webhook`
- `NVIDIA_BASE_URL=https://integrate.api.nvidia.com/v1`
- `NVIDIA_MODEL=z-ai/glm-5.3-flash`
- `NVIDIA_MODEL_FALLBACKS=openai/gpt-oss-20b` - идентификаторы резервных моделей, не ключи.
- `NODE_VERSION=22`

Render автоматически предоставляет `RENDER_EXTERNAL_URL`. Альфа собирает адрес webhook как:

```text
${RENDER_EXTERNAL_URL}/api/telegram
```

Опционально можно добавить `TELEGRAM_WEBHOOK_SECRET`. Если он задан, Альфа проверяет заголовок Telegram перед обработкой сообщения.

## Деплой

1. Подключи репозиторий `magistrigusti/Apha_Friend-gamers-allodium` как Render Web Service или Blueprint.
2. Проверь `Build Command`: `npm install`.
3. Проверь `Start Command`: `npm start`.
4. Добавь `ALPHA_BOT_TOKEN`, `ALPHA_API_KEY` и, если нужен отдельный резервный ключ, `ALPHA_API_FALLBACKS`.
5. Запусти deploy последнего коммита.

В журнале успешного запуска должны появиться строки:

```text
[Server] Port ...
[Alpha Bot] Webhook: https://<service>.onrender.com/api/telegram
[Alpha Bot] Started in webhook mode!
```

## Локальная разработка

Локально оставь:

```text
ALPHA_TELEGRAM_MODE=polling
```

Не запускай локальный polling одновременно с production webhook: один Telegram-бот должен использовать только один способ получения обновлений.

## Проверка

После deploy отправь Альфе в личном чате:

```text
Альфа, ты на связи?
```

Ожидаемое поведение:

1. Если Render спал, Telegram-запрос будит сервис.
2. Альфа пишет: `Я на связи. Считаю звезды и собираю ответ...`
3. Временное сообщение заменяется ответом Alpha Core.
