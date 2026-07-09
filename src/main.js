import express from 'express';
import dotenv from 'dotenv';

import {
  startPollingAlphaBot,
} from './telegram-runtime.js';
import {
  handleAlphaHttpRequest,
} from './alpha-http.js';


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

let activeBot = null;


async function bootstrap() {
  const server = app.listen(PORT, () => {
    console.log(`[Server] Port ${PORT}`);
  });

  try {
    const {
      bot,
      removedWebhook,
      webhookUrl,
    } = await startPollingAlphaBot();

    activeBot = bot;

    if (removedWebhook) {
      console.log(
        '[Alpha Bot] Removed webhook for polling mode:',
        webhookUrl,
      );
    }

    console.log('[Alpha Bot] Started!');

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
