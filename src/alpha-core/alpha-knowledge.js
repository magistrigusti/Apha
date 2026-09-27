import {
  ALPHA_CORE_KNOWLEDGE,
  ALPHA_KNOWLEDGE_RECORDS,
  ALPHA_KNOWLEDGE_VERSION,
} from './knowledge-data.js';


const DEFAULT_KNOWLEDGE_LIMIT = 5;
const STOP_WORDS = new Set([
  'без',
  'был',
  'была',
  'быть',
  'вам',
  'вас',
  'вот',
  'для',
  'его',
  'как',
  'мне',
  'мой',
  'она',
  'они',
  'про',
  'так',
  'тебе',
  'твой',
  'что',
  'это',
]);
const TOKEN_ALIASES = new Map([
  ['алладиум', 'allodium'],
  ['алодиум', 'allodium'],
  ['аллодиум', 'allodium'],
  ['allodium', 'allodium'],
  ['mercatus', 'mercatus'],
  ['меркатос', 'mercatus'],
  ['меркатус', 'mercatus'],
  ['network', 'portal'],
  ['portal', 'portal'],
  ['нетворк', 'portal'],
  ['портал', 'portal'],
  ['website', 'site'],
  ['сайте', 'site'],
  ['сайта', 'site'],
  ['сайт', 'site'],
]);
const SURFACE_DOMAINS = new Map([
  ['allodium', 'allodium'],
  ['game', 'allodium'],
  ['mercatus', 'mercatus'],
  ['network', 'portal'],
  ['portal', 'portal'],
  ['site', 'site'],
  ['website', 'site'],
]);


function normalizeToken(token) {
  const normalized = token
    .toLowerCase()
    .replaceAll('ё', 'е');

  return TOKEN_ALIASES.get(normalized) ?? normalized;
}


function tokenize(value) {
  const matches = String(value ?? '')
    .toLowerCase()
    .replaceAll('ё', 'е')
    .match(/[a-zа-я0-9]{3,}/g) ?? [];

  return new Set(
    matches
      .map(normalizeToken)
      .filter((token) => !STOP_WORDS.has(token)),
  );
}


function getSurfaceDomain(context) {
  const surface = String(
    context?.surface ?? '',
  ).trim().toLowerCase();

  return SURFACE_DOMAINS.get(surface) ?? '';
}


function getRecordTokens(record) {
  return tokenize([
    record.domain,
    ...record.keywords,
    record.text,
  ].join(' '));
}


function scoreRecord(
  record,
  queryTokens,
  surfaceDomain,
) {
  const recordTokens = getRecordTokens(record);
  let score = surfaceDomain === record.domain ? 1 : 0;

  for (const token of queryTokens) {
    if (recordTokens.has(token)) {
      score += token === record.domain ? 5 : 2;
    }
  }

  return score;
}


function getKnowledgeLimit(options) {
  const value = Number.parseInt(
    String(options?.limit ?? DEFAULT_KNOWLEDGE_LIMIT),
    10,
  );

  if (!Number.isFinite(value) || value < 0) {
    return DEFAULT_KNOWLEDGE_LIMIT;
  }

  return value;
}


export function selectAlphaKnowledge(
  question,
  options = {},
) {
  const queryTokens = tokenize(question);
  const surfaceDomain = getSurfaceDomain(
    options.context,
  );
  const limit = getKnowledgeLimit(options);

  return ALPHA_KNOWLEDGE_RECORDS
    .map((record, index) => ({
      index,
      record,
      score: scoreRecord(
        record,
        queryTokens,
        surfaceDomain,
      ),
    }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => {
      return right.score - left.score
        || left.index - right.index;
    })
    .slice(0, limit)
    .map((entry) => entry.record);
}


function formatKnowledgeRecord(record) {
  return `- [${record.domain}; ${record.status}] ${record.text}`;
}


export function buildAlphaKnowledgeContext(
  question,
  options = {},
) {
  const selected = selectAlphaKnowledge(
    question,
    options,
  );
  const records = [
    ...ALPHA_CORE_KNOWLEDGE,
    ...selected,
  ];

  return [
    `Карта знаний Альфы: ${ALPHA_KNOWLEDGE_VERSION}.`,
    'Опирайся на факты ниже. Не называй внутренние ' +
      'идентификаторы, статусы или устройство базы.',
    ...records.map(formatKnowledgeRecord),
  ].join('\n');
}
