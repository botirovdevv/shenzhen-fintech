import type { Category, TransactionSource } from '@femate/shared';

import type { IconName } from '@/components/Icon';

export const categoryIcon: Record<Category, IconName> = {
  transport: 'transport',
  food: 'food',
  utilities: 'utilities',
  shopping: 'shopping',
  health: 'health',
  entertainment: 'entertainment',
  education: 'education',
  transfer: 'transfer',
  other: 'other',
};

export const sourceIcon: Record<TransactionSource, IconName> = {
  bank: 'bank',
  manual: 'pen',
  voice: 'mic',
  sms_forward: 'send',
  agent: 'sparkleSmall',
  card: 'card',
};

export const sourceLabel: Record<TransactionSource, string> = {
  bank: 'Bank',
  manual: 'Typed',
  voice: 'Voice',
  sms_forward: 'SMS',
  agent: 'Agent',
  card: 'Card',
};
