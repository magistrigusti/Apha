import test from 'node:test';
import assert from 'node:assert/strict';

import {
  ALPHA_WAITING_MESSAGE,
  registerAlphaBotHandlers,
} from './alpha-bot-nvidia.js';
import {
  ALPHA_TRANSIENT_FAILURE_MESSAGE,
} from './alpha-core/alpha-persona.js';


function createPrivateTextHarness(askAlpha) {
  let textHandler = null;
  const calls = [];
  const bot = {
    command() {},
    on(_filter, handler) {
      textHandler = handler;
    },
  };

  registerAlphaBotHandlers(bot, {
    askAlpha,
    sessionStore: new Map(),
  });

  const ctx = {
    message: {
      text: 'Привет, Альфа',
    },
    chat: {
      id: 101,
      type: 'private',
    },
    from: {
      id: 101,
    },
    async reply(text) {
      calls.push(['reply', text]);
      return { message_id: 55 };
    },
    telegram: {
      async editMessageText(
        chatId,
        messageId,
        inlineMessageId,
        text,
      ) {
        calls.push([
          'edit',
          chatId,
          messageId,
          inlineMessageId,
          text,
        ]);
      },
    },
  };

  return {
    calls,
    async sendText() {
      await textHandler(ctx);
    },
  };
}


test('Telegram shows a live Alpha message before the model answer', async () => {
  const harness = createPrivateTextHarness(
    async () => ({
      answer: 'Я здесь, брат. Рад тебя видеть.',
      chatHistory: [],
    }),
  );

  await harness.sendText();

  assert.deepEqual(harness.calls, [
    ['reply', ALPHA_WAITING_MESSAGE],
    [
      'edit',
      101,
      55,
      null,
      'Я здесь, брат. Рад тебя видеть.',
    ],
  ]);
});


test('Telegram replaces the waiting message when Alpha Core fails', async () => {
  const harness = createPrivateTextHarness(
    async () => {
      throw new Error('temporary model failure');
    },
  );

  const originalConsoleError = console.error;
  console.error = () => {};

  try {
    await harness.sendText();
  } finally {
    console.error = originalConsoleError;
  }

  assert.deepEqual(harness.calls, [
    ['reply', ALPHA_WAITING_MESSAGE],
    [
      'edit',
      101,
      55,
      null,
      ALPHA_TRANSIENT_FAILURE_MESSAGE,
    ],
  ]);
});
