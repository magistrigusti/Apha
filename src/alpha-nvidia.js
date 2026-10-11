import {
  ALPHA_CONFIG_FAILURE_MESSAGE,
  ALPHA_EMPTY_QUESTION_MESSAGE,
  ALPHA_NO_ANSWER_MESSAGE,
  ALPHA_RATE_LIMIT_MESSAGE,
  ALPHA_SYSTEM_PROMPT,
  ALPHA_TRANSIENT_FAILURE_MESSAGE,
} from './alpha-core/alpha-persona.js';
import {
  buildAlphaKnowledgeContext,
} from './alpha-core/alpha-knowledge.js';


const DEFAULT_NVIDIA_BASE_URL =
  'https://integrate.api.nvidia.com/v1';
const DEFAULT_NVIDIA_MODEL =
  'deepseek-ai/deepseek-v4.1-flash';
const DEFAULT_NVIDIA_MODEL_FALLBACKS = [
  'z-ai/glm-5.3-flash',
];
const DEFAULT_ALPHA_REQUEST_TIMEOUT_MS = 25000;
const DEFAULT_MAX_CONTEXT_MESSAGES = 8;
const DEFAULT_MAX_TOKENS = 420;
const DEFAULT_TEMPERATURE = 0.35;
const DEFAULT_TOP_P = 0.9;


function getNumberOption(
  value,
  fallback,
  validate,
) {
  const parsed = Number.parseFloat(String(value));

  if (
    Number.isFinite(parsed)
    && validate(parsed)
  ) {
    return parsed;
  }

  return fallback;
}


function getIntegerOption(
  value,
  fallback,
  validate,
) {
  const parsed = Number.parseInt(String(value), 10);

  if (
    Number.isFinite(parsed)
    && validate(parsed)
  ) {
    return parsed;
  }

  return fallback;
}


function getRequestTimeoutMs(options = {}) {
  return getIntegerOption(
    options.timeoutMs
      ?? process.env.ALPHA_REQUEST_TIMEOUT_MS,
    DEFAULT_ALPHA_REQUEST_TIMEOUT_MS,
    (value) => value > 0,
  );
}


function getMaxContextMessages(options = {}) {
  return getIntegerOption(
    options.maxContextMessages
      ?? process.env.ALPHA_MAX_CONTEXT_MESSAGES,
    DEFAULT_MAX_CONTEXT_MESSAGES,
    (value) => value >= 0,
  );
}


function getMaxTokens(options = {}) {
  return getIntegerOption(
    options.maxTokens
      ?? process.env.ALPHA_MAX_TOKENS,
    DEFAULT_MAX_TOKENS,
    (value) => value > 0,
  );
}


function getTemperature(options = {}) {
  return getNumberOption(
    options.temperature
      ?? process.env.ALPHA_TEMPERATURE,
    DEFAULT_TEMPERATURE,
    (value) => value >= 0 && value <= 2,
  );
}


function getTopP(options = {}) {
  return getNumberOption(
    options.topP
      ?? process.env.ALPHA_TOP_P,
    DEFAULT_TOP_P,
    (value) => value > 0 && value <= 1,
  );
}


function splitModels(value) {
  if (!value) {
    return [];
  }

  return String(value)
    .split(',')
    .map((model) => model.trim())
    .filter(Boolean);
}


function uniqueValues(values) {
  return [...new Set(values)];
}


function getNvidiaModels(options = {}) {
  const primaryModel =
    options.model
    ?? process.env.NVIDIA_MODEL
    ?? DEFAULT_NVIDIA_MODEL;
  const fallbackModels =
    options.fallbackModels
    ?? (process.env.NVIDIA_MODEL_FALLBACKS === undefined
      ? DEFAULT_NVIDIA_MODEL_FALLBACKS
      : splitModels(process.env.NVIDIA_MODEL_FALLBACKS));

  return uniqueValues([
    primaryModel,
    ...fallbackModels,
  ]);
}


function getNvidiaBaseUrl(options = {}) {
  return String(
    options.baseUrl
      ?? process.env.NVIDIA_BASE_URL
      ?? DEFAULT_NVIDIA_BASE_URL,
  ).replace(/\/+$/, '');
}


function getNvidiaApiKey(options = {}) {
  return String(
    options.apiKey
      ?? process.env.ALPHA_API_KEY
      ?? '',
  ).trim();
}


function getFallbackApiKey(options = {}) {
  return String(
    options.fallbackApiKey
      ?? process.env.ALPHA_MODEL_FALLBACKS
      ?? '',
  ).trim() || getNvidiaApiKey(options);
}


function normalizeChatHistory(chatHistory) {
  if (!Array.isArray(chatHistory)) {
    return [];
  }

  return chatHistory.flatMap((entry) => {
    if (!entry || typeof entry !== 'object') {
      return [];
    }

    const role = entry.role;
    if (role !== 'user' && role !== 'assistant') {
      return [];
    }

    const content =
      typeof entry.content === 'string'
        ? entry.content.trim()
        : '';

    if (!content) {
      return [];
    }

    return [{ role, content }];
  });
}


function buildFallbackChatHistory(
  chatHistory,
  question,
  answer,
) {
  return [
    ...normalizeChatHistory(chatHistory),
    {
      role: 'user',
      content: question,
    },
    {
      role: 'assistant',
      content: answer,
    },
  ];
}


function buildMessages(
  question,
  chatHistory,
  options = {},
) {
  const maxContextMessages =
    getMaxContextMessages(options);
  const recentHistory =
    normalizeChatHistory(chatHistory)
      .slice(-maxContextMessages);
  const knowledgeContext =
    buildAlphaKnowledgeContext(
      question,
      {
        context: options.context,
        limit: options.maxKnowledgeRecords,
      },
    );
  const systemPrompt = [
    ALPHA_SYSTEM_PROMPT,
    knowledgeContext,
  ].join('\n\n');

  return [
    {
      role: 'system',
      content: systemPrompt,
    },
    ...recentHistory,
    {
      role: 'user',
      content: question,
    },
  ];
}


function extractAnswer(data) {
  const content =
    data?.choices?.[0]?.message?.content;

  if (typeof content === 'string' && content.trim()) {
    return content.trim();
  }

  const text = data?.choices?.[0]?.text;
  if (typeof text === 'string' && text.trim()) {
    return text.trim();
  }

  return ALPHA_NO_ANSWER_MESSAGE;
}


function getErrorText(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  if (typeof error === 'string') {
    return error;
  }

  try {
    return JSON.stringify(error);
  } catch {
    return String(error ?? '');
  }
}


function readNvidiaError(data) {
  const error = data?.error;

  if (typeof error === 'string') {
    return error;
  }

  for (const key of ['message', 'detail']) {
    const value = error?.[key] ?? data?.[key];
    if (typeof value === 'string' && value.trim()) {
      return value.trim();
    }
  }

  return '';
}


function isConfigError(error) {
  const status = error?.status;
  return (
    error?.code === 'ALPHA_API_KEY_MISSING'
    || status === 401
    || status === 403
  );
}


function isRateLimitError(error) {
  return error?.status === 429;
}


function isModelFallbackError(error) {
  const status = error?.status;
  return (
    status === 400
    || status === 404
    || status === 410
    || status === 422
    || status === 500
    || status === 502
    || status === 503
    || status === 504
  );
}


function toPublicFailureMessage(error) {
  if (isConfigError(error)) {
    return ALPHA_CONFIG_FAILURE_MESSAGE;
  }

  if (isRateLimitError(error)) {
    return ALPHA_RATE_LIMIT_MESSAGE;
  }

  return ALPHA_TRANSIENT_FAILURE_MESSAGE;
}


async function requestNvidiaChat(
  model,
  messages,
  options = {},
) {
  const apiKey = getNvidiaApiKey(options);

  if (!apiKey) {
    const error = new Error('ALPHA_API_KEY is not set');
    error.code = 'ALPHA_API_KEY_MISSING';
    throw error;
  }

  const timeoutMs = getRequestTimeoutMs(options);
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, timeoutMs);

  try {
    const response = await (options.fetch ?? fetch)(
      `${getNvidiaBaseUrl(options)}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          model,
          messages,
          max_tokens: getMaxTokens(options),
          temperature: getTemperature(options),
          top_p: getTopP(options),
        }),
        signal: controller.signal,
      },
    );

    const data = await response
      .json()
      .catch(() => ({}));

    if (!response.ok) {
      const error = new Error(
        readNvidiaError(data)
          || `NVIDIA API ${response.status}`,
      );
      error.status = response.status;
      error.data = data;
      throw error;
    }

    return extractAnswer(data);
  } catch (error) {
    if (error?.name === 'AbortError') {
      const timeoutError = new Error(
        `NVIDIA API timeout after ${timeoutMs}ms`,
      );
      timeoutError.status = 504;
      throw timeoutError;
    }

    throw error;
  } finally {
    clearTimeout(timeoutId);
  }
}


async function askNvidia(
  question,
  chatHistory,
  options = {},
) {
  const messages = buildMessages(
    question,
    chatHistory,
    options,
  );
  const models = getNvidiaModels(options);
  let lastError = null;

  for (const [index, model] of models.entries()) {
    const apiKey = index === 0
      ? getNvidiaApiKey(options)
      : getFallbackApiKey(options);
    try {
      return await requestNvidiaChat(
        model,
        messages,
        { ...options, apiKey },
      );
    } catch (error) {
      lastError = error;
      console.error(
        '[Alpha NVIDIA]',
        model,
        getErrorText(error),
      );

      const canTrySeparateKey = index === 0
        && Boolean(getFallbackApiKey(options))
        && getFallbackApiKey(options) !== apiKey;
      const shouldStop = isConfigError(error)
        ? !canTrySeparateKey
        : isRateLimitError(error) || !isModelFallbackError(error);

      if (shouldStop) {
        break;
      }
    }
  }

  throw lastError ?? new Error('NVIDIA API failed');
}


export async function chatWithAlpha(
  message,
  options = {},
) {
  const question = String(message ?? '').trim();
  const chatHistory = normalizeChatHistory(
    options.chatHistory,
  );

  if (!question) {
    return {
      answer: ALPHA_EMPTY_QUESTION_MESSAGE,
      chatHistory,
    };
  }

  try {
    const answer = await askNvidia(
      question,
      chatHistory,
      options,
    );

    return {
      answer,
      chatHistory: buildFallbackChatHistory(
        chatHistory,
        question,
        answer,
      ),
    };
  } catch (error) {
    return {
      answer: toPublicFailureMessage(error),
      chatHistory,
    };
  }
}


export async function askAlpha(
  message,
  options = {},
) {
  const result = await chatWithAlpha(
    message,
    options,
  );
  return result.answer;
}
