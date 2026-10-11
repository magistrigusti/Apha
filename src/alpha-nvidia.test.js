import test from 'node:test';
import assert from 'node:assert/strict';

import {
  askAlpha,
  chatWithAlpha,
} from './alpha-nvidia.js';


function createJsonResponse(
  status,
  body,
) {
  return {
    ok: status >= 200 && status < 300,
    status,
    async json() {
      return body;
    },
  };
}


test('chatWithAlpha sends the shared Alpha Core persona to NVIDIA', async () => {
  const calls = [];

  const result = await chatWithAlpha(
    'Что такое Mercatus?',
    {
      apiKey: 'test-key',
      model: 'nvidia/test-model',
      fallbackModels: [],
      chatHistory: [
        {
          role: 'user',
          content: 'Привет',
        },
        {
          role: 'assistant',
          content: 'Привет. Я рядом.',
        },
      ],
      async fetch(url, request) {
        calls.push({
          url,
          request,
          body: JSON.parse(request.body),
        });

        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content:
                  'Mercatus — рыночный и экономический контур экосистемы.',
              },
            },
          ],
        });
      },
    },
  );

  assert.equal(
    result.answer,
    'Mercatus — рыночный и экономический контур экосистемы.',
  );
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://integrate.api.nvidia.com/v1/chat/completions',
  );
  assert.equal(
    calls[0].request.headers.Authorization,
    'Bearer test-key',
  );
  assert.equal(calls[0].body.model, 'nvidia/test-model');
  assert.equal(calls[0].body.messages[0].role, 'system');
  assert.match(
    calls[0].body.messages[0].content,
    /Альфа всегда друг и живой собеседник/,
  );
  assert.match(
    calls[0].body.messages[0].content,
    /привет друг давай знакомиться я дима/,
  );
  assert.match(
    calls[0].body.messages[0].content,
    /Альфа — мужчина/,
  );
  assert.match(
    calls[0].body.messages[0].content,
    /Mercatus — рыночный и экономический контур/,
  );
  assert.doesNotMatch(
    calls[0].body.messages[0].content,
    /Рђ|Рќ|Рў|prototype/i,
  );
  assert.deepEqual(
    calls[0].body.messages.slice(-3),
    [
      {
        role: 'user',
        content: 'Привет',
      },
      {
        role: 'assistant',
        content: 'Привет. Я рядом.',
      },
      {
        role: 'user',
        content: 'Что такое Mercatus?',
      },
    ],
  );
});


test('chatWithAlpha tries a fallback model when primary model is unavailable', async () => {
  const models = [];

  const result = await chatWithAlpha(
    'Как начать играть?',
    {
      apiKey: 'test-key',
      model: 'nvidia/bad-model',
      fallbackModels: ['nvidia/good-model'],
      async fetch(_url, request) {
        const body = JSON.parse(request.body);
        models.push(body.model);

        if (body.model === 'nvidia/bad-model') {
          return createJsonResponse(404, {
            error: {
              message: 'model not found',
            },
          });
        }

        return createJsonResponse(200, {
          choices: [
            {
              message: {
                content:
                  'Начни с портала Allodium и следуй подсказкам Альфы.',
              },
            },
          ],
        });
      },
    },
  );

  assert.deepEqual(
    models,
    ['nvidia/bad-model', 'nvidia/good-model'],
  );
  assert.equal(
    result.answer,
    'Начни с портала Allodium и следуй подсказкам Альфы.',
  );
});


test('askAlpha does not reveal provider details when API key is missing', async () => {
  const answer = await askAlpha(
    'Ты работаешь?',
    {
      apiKey: '',
    },
  );

  assert.equal(
    answer,
    'Альфа временно не отвечает. Попробуй еще раз через несколько секунд.',
  );
  assert.doesNotMatch(answer, /NVIDIA|Hugging|API/i);
});


test('chatWithAlpha asks for a message when the input is empty', async () => {
  const result = await chatWithAlpha('   ');

  assert.equal(
    result.answer,
    'Напиши вопрос или просто несколько слов для Альфы.',
  );
});


test('environment keys select separate credentials for primary and fallback', async (t) => {
  const settings = {
    ALPHA_API_KEY: 'primary-test-key',
    ALPHA_API_FALLBACKS: 'fallback-test-key',
    NVIDIA_MODEL: 'test/primary',
    NVIDIA_MODEL_FALLBACKS: 'test/fallback',
  };
  const previous = Object.fromEntries(
    Object.keys(settings).map((key) => [key, process.env[key]]),
  );
  t.after(() => {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });
  Object.assign(process.env, settings);
  const calls = [];
  const result = await chatWithAlpha('Привет', {
    async fetch(_url, request) {
      calls.push({
        model: JSON.parse(request.body).model,
        authorization: request.headers.Authorization,
      });
      return calls.length === 1
        ? createJsonResponse(401, { error: { message: 'invalid key' } })
        : createJsonResponse(200, {
          choices: [{ message: { content: 'Я рядом.' } }],
        });
    },
  });
  assert.equal(result.answer, 'Я рядом.');
  assert.deepEqual(calls, [
    { model: 'test/primary', authorization: 'Bearer primary-test-key' },
    { model: 'test/fallback', authorization: 'Bearer fallback-test-key' },
  ]);
});


test('empty fallback key reuses primary and never appends retired models', async () => {
  const calls = [];
  await chatWithAlpha('Привет', {
    apiKey: 'primary-test-key',
    fallbackApiKey: '',
    model: 'test/primary',
    fallbackModels: ['test/fallback'],
    async fetch(_url, request) {
      calls.push({
        model: JSON.parse(request.body).model,
        authorization: request.headers.Authorization,
      });
      return createJsonResponse(503, { error: { message: 'unavailable' } });
    },
  });
  assert.deepEqual(calls, [
    { model: 'test/primary', authorization: 'Bearer primary-test-key' },
    { model: 'test/fallback', authorization: 'Bearer primary-test-key' },
  ]);
});


test('authorization failure does not retry the same key on another model', async () => {
  let calls = 0;
  await chatWithAlpha('Привет', {
    apiKey: 'invalid-test-key',
    fallbackApiKey: '',
    fallbackModels: ['test/fallback'],
    async fetch() {
      calls++;
      return createJsonResponse(401, { error: { message: 'invalid key' } });
    },
  });
  assert.equal(calls, 1);
});
