import type { DailySummary, PeriodSummary } from '@femate/shared';
import type { FastifyInstance } from 'fastify';
import { z } from 'zod';

import { addDays, dayStart, tashkentDate } from '../lib/time';
import { parse } from '../lib/validate';
import { dailySummary, periodSummary } from '../rules/dailyAllowance';

const dailyQuery = z.object({ date: z.iso.date().optional() });
const periodQuery = z.object({
  from: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
  to: z.iso.datetime({ offset: true }).or(z.iso.date()).optional(),
});

export async function summaryRoutes(app: FastifyInstance) {
  const { db } = app;

  app.get('/summary/daily', async (req): Promise<DailySummary> => {
    const q = parse(dailyQuery, req.query);
    return dailySummary(db, req.userId, q.date);
  });

  app.get('/summary/period', async (req): Promise<PeriodSummary> => {
    const q = parse(periodQuery, req.query);
    const to = q.to ? new Date(q.to) : new Date();
    const from = q.from ? new Date(q.from) : dayStart(addDays(tashkentDate(to), -6));
    return periodSummary(db, req.userId, from, to);
  });
}
