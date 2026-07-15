import { Telegraf } from 'telegraf';
import { message } from 'telegraf/filters';

import { chatWithAlpha } from './alpha-nvidia.js';
import {
  ALPHA_TRANSIENT_FAILURE_MESSAGE,
} from './alpha-core/alpha-persona.js';
import { replaceWaitingMessage } from './telegram-reply.js';


export const DEFAULT_BOT_USERNAME =
  'AlphaAllod_bot';
const DEFAULT_CHAT_HISTORY_LIMIT = 24;
export const ALPHA_WAITING_MESSAGE =
  'Я на связи. Считаю звезды и собираю ответ...';

let alphaBotInstance = null;
const alphaChatSessions = new Map();


function buildStartMessage(botUsername) {
  return 'Приветствую, Лорд!\n'
    + 'Я Альфа, советник мира Аллодиум.\n\n'
    + 'В группе:\n'
    + '/ask <вопрос>\n'
    + 'или @' + botUsername
    + ' <вопрос>\n\n'
    + 'В личке просто пиши.\n'
    + 'Чтобы начать новый диалог: /reset';
}


function extractAskQuestion(text, botUsername) {
  return text
    .replace('/ask', '')
    .replace('@' + botUsername, '')
    .trim();
}


function getChatHistoryLimit(options = {}) {
  const rawLimit =
    options.chatHistoryLimit
    ?? process.env.ALPHA_CHAT_HISTORY_LIMIT
    ?? DEFAULT_CHAT_HISTORY_LIMIT;
  const parsedLimit = Number.parseInt(
    String(rawLimit),
    10,
  );

  if (
    Number.isFinite(parsedLimit)
    && parsedLimit > 0
  ) {
    return parsedLimit;
  }

  return DEFAULT_CHAT_HISTORY_LIMIT;
}


function getSessionKey(ctx) {
  return String(
    ctx.chat?.id
    ?? ctx.from?.id
    ?? 'alpha-default-session',
  );
}


function readChatHistory(
  sessionStore,
  sessionKey,
) {
  const chatHistory =
    sessionStore.get(sessionKey);
  return Array.isArray(chatHistory)
    ? chatHistory
    : [];
}


function writeChatHistory(
  sessionStore,
  sessionKey,
  chatHistory,
  maxHistoryMessages,
) {
  if (
    !Array.isArray(chatHistory)
    || chatHistory.length === 0
  ) {
    sessionStore.delete(sessionKey);
    return;
  }

  sessionStore.set(
    sessionKey,
    chatHistory.slice(-maxHistoryMessages),
  );
}


function buildFallbackChatHistory(
  chatHistory,
  question,
  answer,
) {
  return [
    ...chatHistory,
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


function normalizeAlphaReply(
  result,
  question,
  chatHistory,
) {
  if (typeof result === 'string') {
    return {
      answer: result,
      chatHistory: buildFallbackChatHistory(
        chatHistory,
        question,
        result,
      ),
    };
  }

  const answer =
    typeof result?.answer === 'string'
      ? result.answer.trim()
      : '';
  const safeAnswer =
    answer || 'Нет ответа.';

  return {
    answer: safeAnswer,
    chatHistory: Array.isArray(result?.chatHistory)
      ? result.chatHistory
      : buildFallbackChatHistory(
          chatHistory,
          question,
          safeAnswer,
        ),
  };
}


async function replyFromAlpha(
  ctx,
  ask,
  sessionStore,
  maxHistoryMessages,
  question,
) {
  const sessionKey = getSessionKey(ctx);
  const chatHistory = readChatHistory(
    sessionStore,
    sessionKey,
  );
  const wait = await ctx.reply(
    ALPHA_WAITING_MESSAGE,
  );
  let normalizedResult;

  try {
    const result = await ask(question, {
      chatHistory,
    });
    normalizedResult = normalizeAlphaReply(
      result,
      question,
      chatHistory,
    );
  } catch (error) {
    console.error(
      '[Alpha Telegram] Alpha Core failed:',
      error,
    );
    normalizedResult = {
      answer: ALPHA_TRANSIENT_FAILURE_MESSAGE,
      chatHistory,
    };
  }

  writeChatHistory(
    sessionStore,
    sessionKey,
    normalizedResult.chatHistory,
    maxHistoryMessages,
  );

  await replaceWaitingMessage(
    ctx,
    wait.message_id,
    normalizedResult.answer,
  );
}


export function registerAlphaBotHandlers(
  bot,
  options = {},
) {
  const botUsername =
    options.botUsername
    ?? process.env.ALPHA_BOT_USERNAME
    ?? DEFAULT_BOT_USERNAME;
  const ask =
    options.askAlpha
    ?? chatWithAlpha;
  const sessionStore =
    options.sessionStore
    ?? alphaChatSessions;
  const maxHistoryMessages =
    getChatHistoryLimit(options);

  bot.command('start', async (ctx) => {
    sessionStore.delete(getSessionKey(ctx));
    await ctx.reply(
      buildStartMessage(botUsername),
    );
  });

  bot.command('reset', async (ctx) => {
    sessionStore.delete(getSessionKey(ctx));
    await ctx.reply(
      'Диалог очищен. Начинаем заново.',
    );
  });

  bot.command('ask', async (ctx) => {
    const question = extractAskQuestion(
      ctx.message.text,
      botUsername,
    );

    if (!question) {
      await ctx.reply(
        'Напиши вопрос после /ask\n'
        + 'Пример: /ask Что такое Аллод?',
      );
      return;
    }

    await replyFromAlpha(
      ctx,
      ask,
      sessionStore,
      maxHistoryMessages,
      question,
    );
  });

  bot.on(message('text'), async (ctx) => {
    const text = ctx.message.text;
    const isPrivate =
      ctx.chat.type === 'private';

    if (isPrivate) {
      await replyFromAlpha(
        ctx,
        ask,
        sessionStore,
        maxHistoryMessages,
        text,
      );
      return;
    }

    const mentioned = text.includes(
      '@' + botUsername,
    );
    const botId = ctx.botInfo?.id;
    const isReply =
      Boolean(botId)
      && ctx.message.reply_to_message
        ?.from?.id === botId;

    if (!mentioned && !isReply) return;

    const question = text
      .replace('@' + botUsername, '')
      .trim();

    if (!question) return;

    await replyFromAlpha(
      ctx,
      ask,
      sessionStore,
      maxHistoryMessages,
      question,
    );
  });

  return bot;
}


export function createAlphaBot(
  options = {},
) {
  const token =
    options.token
    ?? process.env.ALPHA_BOT_TOKEN;

  if (!token) {
    throw new Error(
      'ALPHA_BOT_TOKEN is not set',
    );
  }

  const bot = new Telegraf(token);
  registerAlphaBotHandlers(
    bot,
    options,
  );

  bot.catch(async (error, ctx) => {
    console.error(
      '[Alpha Telegram] Update failed:',
      error,
    );

    if (!ctx.chat?.id) return;

    try {
      await ctx.reply(
        ALPHA_TRANSIENT_FAILURE_MESSAGE,
      );
    } catch (replyError) {
      console.error(
        '[Alpha Telegram] Failure reply failed:',
        replyError,
      );
    }
  });

  return bot;
}


export function getAlphaBot(
  options = {},
) {
  if (!alphaBotInstance) {
    alphaBotInstance = createAlphaBot(
      options,
    );
  }

  return alphaBotInstance;
}
