import express from 'express';
import dotenv from 'dotenv';

import {
  startAlphaBotRuntime,
} from './telegram-runtime.js';
import {
  handleAlphaHttpRequest,
} from './alpha-http.js';
import {
  handleTelegramWebhookInBackground,
} from './vercel-telegram.js';
import {
  createAlphaBot,
} from './alpha-bot-nvidia.js';


dotenv.config();


const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '64kb' }));

app.get('/', (req, res) => {
  res.send('Альфа в сети. Allodium на связи.');
});

app.options('/api/alpha', (req, res) => {
  handleAlphaHttpRequest(req, res);
});

app.post('/api/alpha', (req, res) => {
  handleAlphaHttpRequest(req, res);
});

app.post('/api/telegram', (req, res) => {
  if (!activeBot) {
    res.status(503).json({
      ok: false,
      error: 'Alpha is waking up',
    });
    return;
  }

  void handleTelegramWebhookInBackground(
    req,
    res,
    { bot: activeBot },
  );
});

let activeBot = null;


async function bootstrap() {
  try {
    activeBot = createAlphaBot();
  } catch (error) {
    console.error(
      '[Alpha Bot] Failed to initialize:',
      error,
    );
    process.exit(1);
  }

  const server = app.listen(PORT, () => {
    console.log(`[Server] Port ${PORT}`);
  });

  try {
    const {
      bot,
      removedWebhook,
      webhookUrl,
      mode,
    } = await startAlphaBotRuntime({
      bot: activeBot,
    });

    activeBot = bot;

    if (removedWebhook) {
      console.log(
        '[Alpha Bot] Removed webhook for polling mode:',
        webhookUrl,
      );
    }

    if (mode === 'webhook') {
      console.log(
        '[Alpha Bot] Webhook:',
        webhookUrl,
      );
    }

    console.log(
      `[Alpha Bot] Started in ${mode} mode!`,
    );

    process.once('SIGINT', () => {
      activeBot?.stop('SIGINT');
    });
    process.once('SIGTERM', () => {
      activeBot?.stop('SIGTERM');
    });
  } catch (error) {
    console.error(
      '[Alpha Bot] Failed to start:',
      error,
    );
    server.close(() => process.exit(1));
    setTimeout(() => process.exit(1), 1000).unref();
  }
}


bootstrap();
