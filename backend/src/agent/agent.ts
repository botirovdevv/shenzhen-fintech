// Agent loop (PLAN.md §10): at most 5 tool calls per message, last 10 messages of context.
import type { ChatResponse } from '@femate/shared';
import { desc, eq } from 'drizzle-orm';

import type { Db } from '../db/client';
import { chatMessages, users } from '../db/schema';
import { notFound } from '../lib/errors';
import { newId } from '../lib/ids';
import { dailySummary } from '../rules/dailyAllowance';
import type { LlmMessage, LlmProvider } from './llm/provider';
import { systemPrompt } from './prompts';
import { runTool, toolDefinitions, type ToolContext } from './tools';

export const MAX_TOOL_CALLS = 5;
const HISTORY = 10;

export async function chat(db: Db, llm: LlmProvider, userId: string, message: string): Promise<ChatResponse> {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  if (!user) throw notFound('User');
  await db.insert(chatMessages).values({ id: newId('msg'), userId, role: 'user', content: message });

  const history = await db
    .select()
    .from(chatMessages)
    .where(eq(chatMessages.userId, userId))
    .orderBy(desc(chatMessages.createdAt), desc(chatMessages.id))
    .limit(HISTORY);
  const messages: LlmMessage[] = history.reverse().map((m) => ({ role: m.role, content: m.content }));
  const today = await dailySummary(db, userId).catch(() => null);
  const system = systemPrompt(user.name, today);

  const ctx: ToolContext = { db, userId, actions: [] };
  let calls = 0;
  let reply = '';
  // Bounded: every iteration either ends the turn or spends at least one of the 5 tool calls.
  for (;;) {
    const res = await llm.chat({ system, messages, tools: calls < MAX_TOOL_CALLS ? toolDefinitions : [] });
    const wanted = calls < MAX_TOOL_CALLS ? (res.toolCalls ?? []).slice(0, MAX_TOOL_CALLS - calls) : [];
    if (wanted.length === 0) {
      reply = res.text?.trim() || (calls >= MAX_TOOL_CALLS ? 'I reached my limit of 5 steps for one message. Try a simpler request.' : 'Sorry, I don’t have an answer for that.');
      break;
    }
    messages.push({ role: 'assistant', content: res.text ?? '', toolCalls: wanted });
    for (const c of wanted) {
      calls++;
      const result = await runTool(ctx, c.name, c.args);
      messages.push({ role: 'tool', toolCallId: c.id, name: c.name, content: JSON.stringify(result) });
    }
  }

  await db.insert(chatMessages).values({ id: newId('msg'), userId, role: 'assistant', content: reply });
  return { reply, actions: ctx.actions };
}
