// grammY bot, long polling (PLAN.md §4). Runs inside the API process when TELEGRAM_BOT_TOKEN is set.
import type { AgentAction, VoiceLanguage } from '@femate/shared';
import type { FastifyBaseLogger } from 'fastify';
import { Bot, GrammyError, InlineKeyboard, type Context } from 'grammy';

import type { LlmProvider } from '../agent/llm/provider';
import type { Db } from '../db/client';
import { ApiError } from '../lib/errors';
import { MAX_AUDIO_BYTES, MAX_AUDIO_SECONDS, type SttProvider } from '../stt/groq';
import { HELP, dailyReport, decideAction, describeAction, handleText, handleVoice, linkChat, unlinkChat, userByChat, type Report } from './core';

type Ctx = Context & { userId?: string; voiceLanguage?: VoiceLanguage };

const NOT_LINKED =
  'This chat isn’t linked yet. In the FeMate app open Settings → Telegram bot → Get a link code, then send /start <code> here.';

// /start codes are 6 digits and live 10 minutes; 5 tries per chat per 10 minutes keeps guessing useless.
const LINK_TRIES = 5;
const LINK_WINDOW_MS = 10 * 60_000;

export const actionKeyboard = (a: AgentAction) =>
  new InlineKeyboard().text('✅ Approve', `act:approve:${a.id}`).text('❌ Reject', `act:reject:${a.id}`);

export function createBot(token: string, deps: { db: Db; llm: LlmProvider; stt: SttProvider | null; log: FastifyBaseLogger }) {
  const { db, llm, stt, log } = deps;
  const bot = new Bot<Ctx>(token);
  const tries = new Map<string, { n: number; until: number }>();

  async function sendReport(chatId: string, r: Report) {
    await bot.api.sendMessage(chatId, r.text);
    for (const a of r.pending) await bot.api.sendMessage(chatId, describeAction(a, r.currency), { reply_markup: actionKeyboard(a) });
  }

  bot.command('start', async (ctx) => {
    const chatId = String(ctx.chat.id);
    const code = ctx.match.trim();
    if (!code) {
      const u = await userByChat(db, chatId);
      return ctx.reply(u ? `Welcome back, ${u.name}!\n\n${HELP}` : `Hi! I’m FeMate, your money helper.\n\n${NOT_LINKED}`);
    }
    const now = Date.now();
    const t = tries.get(chatId);
    const n = t && t.until > now ? t.n + 1 : 1;
    tries.set(chatId, { n, until: t && t.until > now ? t.until : now + LINK_WINDOW_MS });
    if (n > LINK_TRIES) return ctx.reply('Too many tries. Wait 10 minutes and get a fresh code in the app.');
    return ctx.reply(await linkChat(db, chatId, code));
  });

  bot.command('help', (ctx) => ctx.reply(HELP));

  // Everything below needs a linked account.
  bot.use(async (ctx, next) => {
    if (!ctx.chat) return;
    const u = await userByChat(db, String(ctx.chat.id));
    if (!u) {
      if (ctx.callbackQuery) await ctx.answerCallbackQuery({ text: 'This chat isn’t linked to FeMate.' });
      else await ctx.reply(NOT_LINKED);
      return;
    }
    ctx.userId = u.id;
    ctx.voiceLanguage = u.voiceLanguage;
    await next();
  });

  bot.command('today', async (ctx) => {
    await sendReport(String(ctx.chat.id), await dailyReport(db, ctx.userId!));
  });

  bot.command('unlink', async (ctx) => ctx.reply(await unlinkChat(db, ctx.userId!)));

  bot.on('message:voice', async (ctx) => {
    if (!stt) return ctx.reply('Voice messages aren’t on yet. Type it instead, like “taxi 20000”.');
    const v = ctx.message.voice;
    if (v.duration > MAX_AUDIO_SECONDS || (v.file_size ?? 0) > MAX_AUDIO_BYTES) {
      return ctx.reply(`Keep voice notes under ${MAX_AUDIO_SECONDS} seconds, like “taksi yigirma ming”.`);
    }
    await ctx.replyWithChatAction('typing');
    const file = await ctx.getFile();
    const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`);
    if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`);
    const data = new Uint8Array(await res.arrayBuffer());
    try {
      const transcript = await stt.transcribe({ data, filename: 'voice.ogg', mimeType: v.mime_type ?? 'audio/ogg', language: ctx.voiceLanguage });
      return ctx.reply(await handleVoice(db, llm, ctx.userId!, transcript));
    } catch (e) {
      if (e instanceof ApiError) return ctx.reply(e.message);
      throw e;
    }
  });

  bot.on('message:text', async (ctx) => {
    if (ctx.message.text.startsWith('/')) return ctx.reply(HELP);
    await ctx.replyWithChatAction('typing');
    return ctx.reply(await handleText(db, llm, ctx.userId!, ctx.message.text));
  });

  bot.on('callback_query:data', async (ctx) => {
    const m = ctx.callbackQuery.data.match(/^act:(approve|reject):([\w-]+)$/);
    if (!m) return ctx.answerCallbackQuery();
    const result = await decideAction(db, ctx.userId!, m[2]!, m[1] as 'approve' | 'reject');
    await ctx.answerCallbackQuery({ text: result.slice(0, 190) });
    const original = ctx.callbackQuery.message && 'text' in ctx.callbackQuery.message ? ctx.callbackQuery.message.text : '';
    await ctx.editMessageText(`${original ?? ''}\n\n${result}`.trim()).catch(() => undefined);
  });

  bot.catch((err) => {
    const e = err.error;
    log.error({ err: e instanceof GrammyError ? e.description : e }, 'telegram bot error');
    err.ctx.reply('Something went wrong on my side. Try again in a minute.').catch(() => undefined);
  });

  return {
    bot,
    sendReport,
    async start() {
      await bot.api.setMyCommands([
        { command: 'today', description: 'Today’s report' },
        { command: 'help', description: 'What I can do' },
        { command: 'unlink', description: 'Disconnect this chat' },
      ]);
      await bot.api.setMyDescription(
        'FeMate tracks your spending and helps you save. Add expenses by text, forward bank SMS, get a daily report. I never move money without your tap.',
      );
      await bot.api.setMyShortDescription('Your AI money helper: expenses, daily report, savings.');
      void bot.start({ onStart: (me) => log.info(`Telegram bot @${me.username} is polling`) });
    },
    stop: () => bot.stop(),
  };
}
