import { levelLimits, type Currency, type PermissionLevel, type Permissions } from '@femate/shared';

export const LEVEL_RANK: Record<PermissionLevel, number> = { L0: 0, L1: 1, L2: 2, L3: 3 };
export const PENDING_TTL_MS = 15 * 60 * 1000;

/** Users may lower limits, never raise them above the level's system maximum (PLAN.md §8). */
export function clampLimits(
  level: PermissionLevel,
  currency: Currency,
  wanted: { perActionLimit?: number; dailyLimit?: number },
  current?: Pick<Permissions, 'perActionLimit' | 'dailyLimit'>,
): { perActionLimit: number; dailyLimit: number } {
  const max = levelLimits(level, currency);
  if (!max) return { perActionLimit: 0, dailyLimit: 0 };
  const pick = (v: number | undefined, cur: number | undefined, cap: number) => Math.max(0, Math.min(v ?? (cur || cap), cap));
  return {
    perActionLimit: pick(wanted.perActionLimit, current?.perActionLimit, max.perAction),
    dailyLimit: pick(wanted.dailyLimit, current?.dailyLimit, max.daily),
  };
}
