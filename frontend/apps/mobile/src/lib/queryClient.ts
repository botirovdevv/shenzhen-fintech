import { QueryClient } from '@tanstack/react-query';

import { ApiError } from './mock';

// Retry a failed read once, and only when the network was the problem: a 4xx won't change on retry.
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      retry: (count, e) => count < 1 && e instanceof ApiError && (e.code === 'NETWORK' || e.code === 'TIMEOUT'),
    },
  },
});
