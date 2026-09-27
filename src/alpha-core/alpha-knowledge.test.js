import test from 'node:test';
import assert from 'node:assert/strict';

import {
  buildAlphaKnowledgeContext,
  selectAlphaKnowledge,
} from './alpha-knowledge.js';


test('knowledge context always confirms that Alpha is male', () => {
  const context = buildAlphaKnowledgeContext('Привет');

  assert.match(context, /Альфа — мужчина/);
  assert.match(context, /мужском роде/);
});


test('knowledge selection finds Mercatus facts', () => {
  const records = selectAlphaKnowledge(
    'Что можно делать в Меркатос?',
  );
  const ids = records.map((record) => record.id);

  assert.ok(ids.includes('mercatus.role'));
  assert.ok(ids.includes('mercatus.features'));
});


test('network surface adds Portal knowledge', () => {
  const records = selectAlphaKnowledge(
    'Привет, где я сейчас?',
    {
      context: {
        surface: 'network',
      },
    },
  );

  assert.ok(
    records.some((record) => {
      return record.domain === 'portal';
    }),
  );
});


test('knowledge map does not contain product addresses', () => {
  const context = buildAlphaKnowledgeContext(
    'Расскажи про всю экосистему',
    {
      limit: 20,
    },
  );

  assert.doesNotMatch(
    context,
    /https?:|\.app\b|\.com\b/i,
  );
});
