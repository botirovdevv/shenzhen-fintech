import { buildApp } from './app';
import { createBot } from './bot/bot';
import { startScheduler } from './bot/scheduler';
import { loadConfig } from './config';
import { connect } from './db/client';
import { demoExists, resetDemo } from './db/demo';

const config = loadConfig();
const { db, close } = await connect(config.DATABASE_URL); // also applies migrations
if (config.SEED_DEMO && !(await demoExists(db))) await resetDemo(db);

const app = await buildApp({ db, config, logger: true });
await app.listen({ host: '0.0.0.0', port: config.PORT });

// Telegram bot and daily reports run in the same process (one container on the VM).
const bot = config.TELEGRAM_BOT_TOKEN ? createBot(config.TELEGRAM_BOT_TOKEN, { db, llm: app.llm, stt: app.stt, log: app.log }) : null;
if (bot) await bot.start().catch((err: unknown) => app.log.error({ err }, 'Telegram bot failed to start'));
else app.log.warn('TELEGRAM_BOT_TOKEN is empty: the Telegram bot is off');
if (!app.stt) app.log.warn('GROQ_API_KEY is empty: voice input is off');
const stopScheduler = startScheduler(db, bot?.sendReport, app.log);

for (const sig of ['SIGINT', 'SIGTERM'] as const) {
  process.once(sig, async () => {
    stopScheduler();
    await bot?.stop();
    await app.close();
    await close();
    process.exit(0);
  });
}
