import type { AgentAction, ChatResponse, Recommendation, SimulateResponse } from '@femate/shared';
import { and, desc, eq } from 'drizzle-orm';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { chat } from '../agent/agent';
import { applyRecommendation, listRecommendations } from '../agent/recommendations';
import { agentActions } from '../db/schema';
import { toAction } from '../lib/serialize';
import { parse } from '../lib/validate';
import { approveAction, expirePending, rejectAction } from '../policy/actions';
import { whatIf } from '../rules/whatIf';

const chatBody = z.object({ message: z.string().trim().min(1, 'Type a message.').max(1000) });
const statusQuery = z.object({ status: z.enum(['pending', 'approved', 'rejected', 'executed', 'blocked', 'expired']).optional() });
const simulateBody = z.object({
  currentCostPerDay: z.number().int().min(0),
  alternativeCostPerDay: z.number().int().min(0),
  daysPerMonth: z.number().int().min(0).max(31),
});
const idParam = z.object({ id: z.string().min(1) });

export async function agentRoutes(app: FastifyInstance) {
  const { db, llm } = app;

  app.post('/agent/chat', { config: { rateLimit: { max: 20, timeWindow: '1 minute' } } }, async (req): Promise<ChatResponse> => {
    const b = parse(chatBody, req.body);
    return chat(db, llm, req.userId, b.message);
  });

  app.get('/agent/recommendations', async (req): Promise<Recommendation[]> => listRecommendations(db, req.userId));

  app.post('/agent/recommendations/:id/apply', async (req): Promise<{ action?: AgentAction }> =>
    applyRecommendation(db, req.userId, parse(idParam, req.params).id),
  );

  app.get('/agent/actions', async (req): Promise<AgentAction[]> => {
    const q = parse(statusQuery, req.query);
    await expirePending(db, req.userId);
    const rows = await db
      .select()
      .from(agentActions)
      .where(and(eq(agentActions.userId, req.userId), q.status ? eq(agentActions.status, q.status) : undefined))
      .orderBy(desc(agentActions.createdAt))
      .limit(100);
    return rows.map(toAction);
  });

  app.post('/agent/actions/:id/approve', async (req): Promise<AgentAction> => approveAction(db, req.userId, parse(idParam, req.params).id));
  app.post('/agent/actions/:id/reject', async (req): Promise<AgentAction> => rejectAction(db, req.userId, parse(idParam, req.params).id));

  app.post('/agent/simulate', async (req): Promise<SimulateResponse> => whatIf(parse(simulateBody, req.body)));
}
