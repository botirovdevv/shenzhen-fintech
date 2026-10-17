import type { Currency } from '@femate/shared';

import { useMe } from './queries';

/** The signed-in user's currency; every amount from the API is in its minor units. */
export function useCurrency(): Currency {
  return useMe().data?.currency ?? 'UZS';
}
