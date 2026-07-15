import { createAlphaBot } from './alpha-bot-nvidia.js';


const DEFAULT_WEBHOOK_PATH = '/api/telegram';


function normalizeWebhookUrl(info) {
  if (!info || typeof info.url !== 'string') {
    return '';
  }

  return info.url.trim();
}


function normalizePublicUrl(value) {
  const url = String(value ?? '').trim();
  return url ? url.replace(/\/+$/, '') : '';
}


function getTelegramMode(options = {}) {
  const explicitMode = String(
    options.mode
      ?? process.env.ALPHA_TELEGRAM_MODE
      ?? '',
  ).trim().toLowerCase();

  if (explicitMode === 'webhook' || explicitMode === 'polling') {
    return explicitMode;
  }

  const renderUrl = normalizePublicUrl(
    options.publicUrl
      ?? process.env.ALPHA_PUBLIC_URL
      ?? process.env.RENDER_EXTERNAL_URL,
  );

  return renderUrl ? 'webhook' : 'polling';
}


function getWebhookUrl(options = {}) {
  const explicitUrl = normalizePublicUrl(
    options.webhookUrl
      ?? process.env.ALPHA_TELEGRAM_WEBHOOK_URL,
  );

  if (explicitUrl) {
    return explicitUrl;
  }

  const publicUrl = normalizePublicUrl(
    options.publicUrl
      ?? process.env.ALPHA_PUBLIC_URL
      ?? process.env.RENDER_EXTERNAL_URL,
  );

  if (!publicUrl) {
    throw new Error(
      'Webhook mode requires RENDER_EXTERNAL_URL, ALPHA_PUBLIC_URL or ALPHA_TELEGRAM_WEBHOOK_URL',
    );
  }

  const webhookPath = String(
    options.webhookPath
      ?? process.env.ALPHA_TELEGRAM_WEBHOOK_PATH
      ?? DEFAULT_WEBHOOK_PATH,
  ).trim();

  return new URL(webhookPath, `${publicUrl}/`).toString();
}


// ========== ПОДГОТОВКА POLLING РЕЖИМА ==========
export async function prepareTelegramForPolling(bot) {
  const info = await bot.telegram.getWebhookInfo();
  const webhookUrl = normalizeWebhookUrl(info);

  if (!webhookUrl) {
    return {
      removedWebhook: false,
      webhookUrl: '',
    };
  }

  await bot.telegram.deleteWebhook({
    drop_pending_updates: false,
  });

  return {
    removedWebhook: true,
    webhookUrl,
  };
}


// ========== ЗАПУСК БОТА ЧЕРЕЗ POLLING ==========
export async function startPollingAlphaBot(
  options = {},
) {
  const bot =
    options.bot ?? createAlphaBot(options);

  const state = await prepareTelegramForPolling(
    bot,
  );

  await bot.launch();

  return {
    bot,
    mode: 'polling',
    ...state,
  };
}


export async function startWebhookAlphaBot(
  options = {},
) {
  const bot =
    options.bot ?? createAlphaBot(options);
  const webhookUrl = getWebhookUrl(options);
  const secretToken = String(
    options.secretToken
      ?? process.env.TELEGRAM_WEBHOOK_SECRET
      ?? '',
  ).trim();
  const webhookOptions = {
    drop_pending_updates: false,
    ...(secretToken
      ? { secret_token: secretToken }
      : {}),
  };

  await bot.telegram.setWebhook(
    webhookUrl,
    webhookOptions,
  );

  return {
    bot,
    mode: 'webhook',
    webhookUrl,
    removedWebhook: false,
  };
}


export async function startAlphaBotRuntime(
  options = {},
) {
  if (getTelegramMode(options) === 'webhook') {
    return startWebhookAlphaBot(options);
  }

  return startPollingAlphaBot(options);
}
