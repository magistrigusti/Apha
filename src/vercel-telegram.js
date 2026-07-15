import { getAlphaBot } from './alpha-bot-nvidia.js';


function readHeader(req, name) {
  return req.headers?.[name]
    ?? req.headers?.[
      name.toLowerCase()
    ]
    ?? null;
}


function normalizeSecretValue(value) {
  if (typeof value !== 'string') {
    return '';
  }

  return value
    .replace(/\\r\\n/g, '')
    .trim();
}


function resolveOrigin(req) {
  const protocol =
    readHeader(
      req,
      'x-forwarded-proto',
    )
    ?? 'https';
  const host =
    readHeader(
      req,
      'x-forwarded-host',
    )
    ?? readHeader(req, 'host');

  if (!host) {
    throw new Error(
      'Cannot resolve request host',
    );
  }

  return `${protocol}://${host}`;
}


export async function handleTelegramWebhook(
  req,
  res,
  options = {},
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  const secretToken =
    normalizeSecretValue(
      options.secretToken
      ?? process.env.TELEGRAM_WEBHOOK_SECRET
      ?? '',
    );
  const incomingSecret =
    normalizeSecretValue(
      readHeader(
        req,
        'x-telegram-bot-api-secret-token',
      ) ?? '',
    );

  if (
    secretToken
    && incomingSecret !== secretToken
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  const bot =
    options.bot ?? getAlphaBot();
  await bot.handleUpdate(
    req.body,
    res,
  );

  if (!res.writableEnded && !res.ended) {
    return res.status(200).json({
      ok: true,
    });
  }
}


export async function handleTelegramWebhookInBackground(
  req,
  res,
  options = {},
) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  const secretToken =
    normalizeSecretValue(
      options.secretToken
      ?? process.env.TELEGRAM_WEBHOOK_SECRET
      ?? '',
    );
  const incomingSecret =
    normalizeSecretValue(
      readHeader(
        req,
        'x-telegram-bot-api-secret-token',
      ) ?? '',
    );

  if (
    secretToken
    && incomingSecret !== secretToken
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  const bot = options.bot ?? getAlphaBot();

  res.status(200).json({ ok: true });

  try {
    await bot.handleUpdate(req.body);
  } catch (error) {
    const onError = options.onError
      ?? ((nextError) => {
        console.error(
          '[Alpha Telegram Webhook]',
          nextError,
        );
      });
    onError(error);
  }
}


export async function registerTelegramWebhook(
  req,
  res,
  options = {},
) {
  if (
    req.method !== 'GET'
    && req.method !== 'POST'
  ) {
    res.setHeader('Allow', 'GET, POST');
    return res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  const setupToken =
    normalizeSecretValue(
      options.setupToken
      ?? process.env.TELEGRAM_WEBHOOK_SETUP_TOKEN
      ?? '',
    );
  const incomingSetupToken =
    normalizeSecretValue(
      readHeader(
        req,
        'x-webhook-setup-token',
      )
      ?? req.query?.token
      ?? '',
    );

  if (
    setupToken
    && incomingSetupToken !== setupToken
  ) {
    return res.status(401).json({
      ok: false,
      error: 'Unauthorized',
    });
  }

  const secretToken =
    normalizeSecretValue(
      options.secretToken
      ?? process.env.TELEGRAM_WEBHOOK_SECRET
      ?? '',
    );
  const webhookPath =
    options.webhookPath
    ?? '/api/telegram';
  const origin =
    options.origin
    ?? resolveOrigin(req);
  const webhookUrl = new URL(
    webhookPath,
    origin,
  ).toString();

  const bot =
    options.bot ?? getAlphaBot();
  const result =
    await bot.telegram.setWebhook(
      webhookUrl,
      secretToken
        ? {
            secret_token: secretToken,
          }
        : undefined,
    );

  return res.status(200).json({
    ok: true,
    webhookUrl,
    result,
  });
}
