import test from 'node:test';
import assert from 'node:assert/strict';

import {
  prepareTelegramForPolling,
  startAlphaBotRuntime,
  startPollingAlphaBot,
  startWebhookAlphaBot,
} from './telegram-runtime.js';


test('prepareTelegramForPolling ничего не удаляет без webhook', async () => {
  const calls = [];
  const bot = {
    telegram: {
      async getWebhookInfo() {
        return { url: '' };
      },
      async deleteWebhook() {
        calls.push('delete');
      },
    },
  };

  const result = await prepareTelegramForPolling(
    bot,
  );

  assert.deepEqual(result, {
    removedWebhook: false,
    webhookUrl: '',
  });
  assert.deepEqual(calls, []);
});


test('prepareTelegramForPolling снимает старый webhook', async () => {
  const calls = [];
  const bot = {
    telegram: {
      async getWebhookInfo() {
        return {
          url: 'https://example.com/api/telegram',
        };
      },
      async deleteWebhook(options) {
        calls.push(options);
      },
    },
  };

  const result = await prepareTelegramForPolling(
    bot,
  );

  assert.deepEqual(result, {
    removedWebhook: true,
    webhookUrl: 'https://example.com/api/telegram',
  });
  assert.deepEqual(calls, [
    { drop_pending_updates: false },
  ]);
});


test('startPollingAlphaBot запускает bot.launch после подготовки', async () => {
  const calls = [];
  const bot = {
    telegram: {
      async getWebhookInfo() {
        calls.push('getWebhookInfo');
        return { url: '' };
      },
      async deleteWebhook() {
        calls.push('deleteWebhook');
      },
    },
    async launch() {
      calls.push('launch');
    },
  };

  const result = await startPollingAlphaBot({
    bot,
  });

  assert.equal(result.bot, bot);
  assert.deepEqual(calls, [
    'getWebhookInfo',
    'launch',
  ]);
});


test('startWebhookAlphaBot registers the Render webhook without polling', async () => {
  const calls = [];
  const bot = {
    telegram: {
      async setWebhook(url, options) {
        calls.push([url, options]);
      },
    },
    async launch() {
      calls.push(['launch']);
    },
  };

  const result = await startWebhookAlphaBot({
    bot,
    publicUrl: 'https://alpha-bot.onrender.com',
    secretToken: 'secret',
  });

  assert.equal(result.mode, 'webhook');
  assert.equal(
    result.webhookUrl,
    'https://alpha-bot.onrender.com/api/telegram',
  );
  assert.deepEqual(calls, [[
    'https://alpha-bot.onrender.com/api/telegram',
    {
      drop_pending_updates: false,
      secret_token: 'secret',
    },
  ]]);
});


test('startAlphaBotRuntime uses webhook mode on Render', async () => {
  const calls = [];
  const bot = {
    telegram: {
      async setWebhook(url) {
        calls.push(['setWebhook', url]);
      },
    },
    async launch() {
      calls.push(['launch']);
    },
  };

  const result = await startAlphaBotRuntime({
    bot,
    publicUrl: 'https://alpha-bot.onrender.com',
  });

  assert.equal(result.mode, 'webhook');
  assert.deepEqual(calls, [[
    'setWebhook',
    'https://alpha-bot.onrender.com/api/telegram',
  ]]);
});
