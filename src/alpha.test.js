import test from 'node:test';
import assert from 'node:assert/strict';

import { askAlpha, extractAlphaAnswer } from './alpha.js';


test('askAlpha sends a message to NVIDIA chat completions', async () => {
  const calls = [];

  const answer = await askAlpha(
    'Что такое Аллод?',
    {
      apiKey: 'test-key',
      model: 'nvidia/test-model',
      fallbackModels: [],
      async fetch(url, request) {
        calls.push({
          url,
          body: JSON.parse(request.body),
        });

        return {
          ok: true,
          status: 200,
          async json() {
            return {
              choices: [
                {
                  message: {
                    content: 'Ответ Альфы',
                  },
                },
              ],
            };
          },
        };
      },
    },
  );

  assert.equal(answer, 'Ответ Альфы');
  assert.equal(calls.length, 1);
  assert.equal(
    calls[0].url,
    'https://integrate.api.nvidia.com/v1/chat/completions',
  );
  assert.equal(
    calls[0].body.model,
    'nvidia/test-model',
  );
  assert.equal(
    calls[0].body.messages.at(-1).content,
    'Что такое Аллод?',
  );
});


test('askAlpha asks for a message when the input is empty', async () => {
  const client = {
    async predict() {
      throw new Error('predict should not be called');
    },
  };

  const answer = await askAlpha('   ', { client });
  assert.equal(
    answer,
    'Напиши вопрос или просто несколько слов для Альфы.',
  );
});


test('extractAlphaAnswer reads text from a Gradio response', () => {
  const result = {
    data: ['Альфа на связи.'],
  };

  assert.equal(
    extractAlphaAnswer(result),
    'Альфа на связи.',
  );
});


test('askAlpha does not reveal provider details when API key is missing', async () => {
  const answer = await askAlpha('Что такое Зион?', {
    apiKey: '',
  });

  assert.equal(
    answer,
    'Альфа временно не отвечает. Попробуй еще раз через несколько секунд.',
  );
  assert.doesNotMatch(answer, /NVIDIA|Hugging|API/i);
});
