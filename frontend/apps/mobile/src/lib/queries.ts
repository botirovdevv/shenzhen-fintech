import { QueryClient, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { AgentAction, CreateTransactionBody, UpdateCardBody, UpdateMeBody, UpdatePermissionsBody } from '@femate/shared';

import { api } from './api';

export const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: 15_000, retry: 1 } },
});

export const keys = {
  me: ['me'] as const,
  accounts: ['accounts'] as const,
  transactions: ['transactions'] as const,
  daily: ['summary', 'daily'] as const,
  period: (from: string, to: string) => ['summary', 'period', from, to] as const,
  recommendations: ['recommendations'] as const,
  actions: (status?: string) => ['actions', status ?? 'all'] as const,
  permissions: ['permissions'] as const,
  audit: ['audit'] as const,
  card: ['card'] as const,
  cardAuthorizations: ['card', 'authorizations'] as const,
};

export const useMe = () => useQuery({ queryKey: keys.me, queryFn: api.me });
export const useAccounts = () => useQuery({ queryKey: keys.accounts, queryFn: api.accounts });
export const useTransactions = () => useQuery({ queryKey: keys.transactions, queryFn: () => api.transactions(50) });
export const useDailySummary = () => useQuery({ queryKey: keys.daily, queryFn: api.dailySummary });
export const usePeriodSummary = (from: Date, to: Date) =>
  useQuery({ queryKey: keys.period(from.toDateString(), to.toDateString()), queryFn: () => api.periodSummary(from, to) });
export const useRecommendations = () => useQuery({ queryKey: keys.recommendations, queryFn: api.recommendations });
export const useActions = (status?: AgentAction['status']) =>
  useQuery({ queryKey: keys.actions(status), queryFn: () => api.actions(status), refetchInterval: 30_000 });
export const usePermissions = () => useQuery({ queryKey: keys.permissions, queryFn: api.permissions });
export const useCard = () => useQuery({ queryKey: keys.card, queryFn: api.card });
export const useCardAuthorizations = () => useQuery({ queryKey: keys.cardAuthorizations, queryFn: api.cardAuthorizations });
export const useAudit = () => useQuery({ queryKey: keys.audit, queryFn: () => api.audit(50) });

// Anything that can move money or change rules refreshes balances, actions and the audit log.
function useInvalidateMoney() {
  const qc = useQueryClient();
  return () =>
    Promise.all(
      [keys.accounts, keys.transactions, keys.daily, ['actions'], keys.audit, keys.permissions, keys.recommendations, ['summary'], keys.card].map(
        (k) => qc.invalidateQueries({ queryKey: k }),
      ),
    );
}

export function useCreateTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (b: CreateTransactionBody) => api.createTransaction(b), onSuccess: invalidate });
}

export function useVoiceTransaction() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.voiceTransaction, onSuccess: invalidate });
}

export const useSimulate = (currentCostPerDay: number, alternativeCostPerDay: number, daysPerMonth: number) =>
  useQuery({
    queryKey: ['simulate', currentCostPerDay, alternativeCostPerDay, daysPerMonth],
    queryFn: () => api.simulate({ currentCostPerDay, alternativeCostPerDay, daysPerMonth }),
    placeholderData: (prev) => prev,
    staleTime: Infinity,
  });

export function useApproveAction() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.approveAction, onSettled: invalidate });
}

export function useRejectAction() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.rejectAction, onSettled: invalidate });
}

export function useApplyRecommendation() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.applyRecommendation, onSuccess: invalidate });
}

export function useChat() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.chat, onSuccess: invalidate });
}

export function useKillSwitch() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.killSwitch, onSuccess: invalidate });
}

export function useUpdatePermissions() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: (b: UpdatePermissionsBody) => api.updatePermissions(b), onSuccess: invalidate });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateMeBody) => api.updateMe(b),
    onSuccess: (user) => {
      qc.setQueryData(keys.me, user);
      void qc.invalidateQueries({ queryKey: keys.daily });
    },
  });
}

export function useIssueCard() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.issueCard, onSuccess: invalidate });
}

export function useUpdateCard() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (b: UpdateCardBody) => api.updateCard(b),
    onSuccess: () => Promise.all([keys.card, keys.audit].map((k) => qc.invalidateQueries({ queryKey: k }))),
  });
}

export function useSimulatePurchase() {
  const invalidate = useInvalidateMoney();
  return useMutation({ mutationFn: api.simulatePurchase, onSuccess: invalidate });
}
