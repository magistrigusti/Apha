import test from 'node:test';
import assert from 'node:assert/strict';

import {
  handleTelegramWebhook,
  handleTelegramWebhookInBackground,
  registerTelegramWebhook,
} from './vercel-telegram.js';

function createResponse() {
  return {
    statusCode: 200,
    headers: {},
    jsonBody: null,
    ended: false,
    setHeader(name, value) {
      this.headers[name] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(body) {
      this.jsonBody = body;
      this.ended = true;
      return this;
    },
  };
}

test('handleTelegramWebhook отклоняет не POST запрос', async () => {
  const response = createResponse();

  await handleTelegramWebhook(
    { method: 'GET', headers: {}, body: {} },
    response,
    {},
  );

  assert.equal(response.statusCode, 405);
  assert.equal(response.headers.Allow, 'POST');
});

test('handleTelegramWebhook проверяет secret header', async () => {
  const response = createResponse();

  await handleTelegramWebhook(
    {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'wrong',
      },
      body: {},
    },
    response,
    {
      secretToken: 'right',
    },
  );

  assert.equal(response.statusCode, 401);
  assert.deepEqual(response.jsonBody, {
    ok: false,
    error: 'Unauthorized',
  });
});

test('handleTelegramWebhook передает update в bot.handleUpdate', async () => {
  const calls = [];
  const response = createResponse();
  const update = {
    update_id: 1,
    message: {
      text: 'привет',
    },
  };

  await handleTelegramWebhook(
    {
      method: 'POST',
      headers: {
        'x-telegram-bot-api-secret-token': 'secret',
      },
      body: update,
    },
    response,
    {
      secretToken: 'secret',
      bot: {
        async handleUpdate(nextUpdate, nextResponse) {
          calls.push([nextUpdate, nextResponse]);
        },
      },
    },
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(response.jsonBody, { ok: true });
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][0], update);
});

test('registerTelegramWebhook регистрирует webhook по текущему домену', async () => {
  const calls = [];
  const response = createResponse();

  await registerTelegramWebhook(
    {
      method: 'POST',
      headers: {
        host: 'apha-ai-v0-1.vercel.app',
        'x-forwarded-proto': 'https',
        'x-webhook-setup-token': 'setup-secret',
      },
    },
    response,
    {
      setupToken: 'setup-secret',
      secretToken: 'telegram-secret',
      webhookPath: '/api/telegram',
      bot: {
        telegram: {
          async setWebhook(url, options) {
            calls.push([url, options]);
            return true;
          },
        },
      },
    },
  );

  assert.equal(response.statusCode, 200);
  assert.deepEqual(calls, [[
    'https://apha-ai-v0-1.vercel.app/api/telegram',
    { secret_token: 'telegram-secret' },
  ]]);
});


test('background webhook acknowledges Telegram before Alpha finishes', async () => {
  let finishUpdate;
  const updateFinished = new Promise((resolve) => {
    finishUpdate = resolve;
  });
  const response = createResponse();
  const calls = [];
  const update = {
    update_id: 2,
    message: {
      text: 'Привет, Альфа',
    },
  };

  const processing = handleTelegramWebhookInBackground(
    {
      method: 'POST',
      headers: {},
      body: update,
    },
    response,
    {
      bot: {
        async handleUpdate(nextUpdate) {
          calls.push(nextUpdate);
          await updateFinished;
        },
      },
    },
  );

  assert.equal(response.ended, true);
  assert.deepEqual(response.jsonBody, { ok: true });
  assert.deepEqual(calls, [update]);

  finishUpdate();
  await processing;
});
