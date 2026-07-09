import {
  ALPHA_EMPTY_QUESTION_MESSAGE,
  ALPHA_HTTP_UNAVAILABLE_MESSAGE,
  ALPHA_NO_ANSWER_MESSAGE,
} from './alpha-core/alpha-persona.js';
import { chatWithAlpha } from './alpha-nvidia.js';


const ALLOWED_METHODS = 'POST, OPTIONS';


function setCorsHeaders(res) {
  const origin =
    process.env.ALPHA_CORS_ORIGIN ?? '*';

  res.setHeader(
    'Access-Control-Allow-Origin',
    origin,
  );
  res.setHeader(
    'Access-Control-Allow-Methods',
    ALLOWED_METHODS,
  );
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type',
  );
  res.setHeader('Vary', 'Origin');
}


function normalizeBody(body) {
  if (!body) {
    return {};
  }

  if (typeof body === 'string') {
    try {
      return JSON.parse(body);
    } catch {
      return { message: body };
    }
  }

  if (typeof body === 'object') {
    return body;
  }

  return {};
}


function readQuestion(body) {
  for (const key of [
    'message',
    'question',
    'msg',
  ]) {
    const value = body[key];
    if (
      typeof value === 'string'
      && value.trim()
    ) {
      return value.trim();
    }
  }

  return '';
}


function readChatHistory(body) {
  return Array.isArray(body.chatHistory)
    ? body.chatHistory
    : [];
}


function normalizeAlphaResult(result) {
  if (typeof result === 'string') {
    return {
      answer: result,
      chatHistory: [],
    };
  }

  return {
    answer:
      typeof result?.answer === 'string'
        ? result.answer
        : ALPHA_NO_ANSWER_MESSAGE,
    chatHistory: Array.isArray(result?.chatHistory)
      ? result.chatHistory
      : [],
  };
}


export async function handleAlphaHttpRequest(
  req,
  res,
  options = {},
) {
  setCorsHeaders(res);

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'POST') {
    res.setHeader('Allow', ALLOWED_METHODS);
    return res.status(405).json({
      ok: false,
      error: 'Method Not Allowed',
    });
  }

  const body = normalizeBody(req.body);
  const question = readQuestion(body);

  if (!question) {
    return res.status(400).json({
      ok: false,
      answer: ALPHA_EMPTY_QUESTION_MESSAGE,
      error: 'Missing message',
    });
  }

  try {
    const ask =
      options.askAlpha ?? chatWithAlpha;
    const result = await ask(question, {
      chatHistory: readChatHistory(body),
      context: body.context ?? {},
    });
    const normalized =
      normalizeAlphaResult(result);

    return res.status(200).json({
      ok: true,
      answer: normalized.answer,
      chatHistory: normalized.chatHistory,
    });
  } catch (error) {
    console.error('[Alpha API]', error);

    return res.status(502).json({
      ok: false,
      answer: ALPHA_HTTP_UNAVAILABLE_MESSAGE,
      error: 'Alpha unavailable',
    });
  }
}
