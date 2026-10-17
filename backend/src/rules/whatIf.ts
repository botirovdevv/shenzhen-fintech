// What-if simulator (PLAN.md §9): monthlySaving = (current − alternative) × days.
import type { SimulateBody, SimulateResponse } from '@femate/shared';

/** One bus ride in Tashkent; a round trip is two. */
export const BUS_FARE = 2_000;

export function whatIf(b: SimulateBody): SimulateResponse {
  const monthlySaving = Math.max(0, b.currentCostPerDay - b.alternativeCostPerDay) * b.daysPerMonth;
  return { monthlySaving, yearlySaving: monthlySaving * 12 };
}
