// Shared API contract between apps/mobile, apps/api and apps/bot (PLAN.md §11).
// Money is always an integer amount of UZS. Dates are ISO 8601 strings.

export type Category = 'transport' | 'food' | 'utilities' | 'shopping' | 'health' | 'entertainment' | 'education' | 'transfer' | 'other';

export const CATEGORIES: readonly Category[] = [
  'transport',
  'food',
  'utilities',
  'shopping',
  'health',
  'entertainment',
  'education',
  'transfer',
  'other',
];

export type PermissionLevel = 'L0' | 'L1' | 'L2' | 'L3';
export type Scope = 'read_balance' | 'read_transactions' | 'transfer_own';

export interface User {
  id: string;
  email: string;
  name: string;
  monthlyIncome: number;
  savingsGoalMonthly: number;
  fixedCostsMonthly: number;
  reportTime: string;
  telegramLinked: boolean;
}

export interface Account {
  id: string;
  type: 'card' | 'savings' | 'cash';
  name: string;
  balance: number;
  currency: 'UZS';
}

export type TransactionSource = 'bank' | 'manual' | 'voice' | 'sms_forward' | 'agent';

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  direction: 'out' | 'in';
  category: Category;
  description: string;
  source: TransactionSource;
  occurredAt: string;
}

export interface DailySummary {
  date: string;
  dailyAllowance: number;
  todaySpent: number;
  remainingToday: number;
  savedToday: number;
  byCategory: { category: Category; amount: number }[];
}

export type AgentActionStatus = 'pending' | 'approved' | 'rejected' | 'executed' | 'blocked' | 'expired';

export interface AgentAction {
  id: string;
  type: 'transfer_to_savings' | 'set_budget';
  amount?: number;
  reason: string;
  status: AgentActionStatus;
  expiresAt?: string;
  createdAt: string;
}

export interface Recommendation {
  id: string;
  title: string;
  body: string;
  monthlySaving: number;
  actionType?: AgentAction['type'];
  status: 'new' | 'applied' | 'dismissed';
}

export interface Permissions {
  level: PermissionLevel;
  scopes: Scope[];
  perActionLimit: number;
  dailyLimit: number;
  agentEnabled: boolean;
}

export interface AuditEntry {
  id: string;
  actor: 'agent' | 'user' | 'system';
  event: string;
  permissionLevel: PermissionLevel;
  decision: 'allowed' | 'blocked' | 'info';
  reason: string;
  createdAt: string;
}

// Requests and responses

export interface AuthResponse {
  token: string;
  user: User;
}

export interface RegisterBody {
  email: string;
  password: string;
  name: string;
}

export interface LoginBody {
  email: string;
  password: string;
}

export type UpdateMeBody = Partial<Pick<User, 'monthlyIncome' | 'savingsGoalMonthly' | 'fixedCostsMonthly' | 'reportTime'>> & {
  expoPushToken?: string;
};

export interface ConnectBankBody {
  scopes: Scope[];
  level: PermissionLevel;
}

export type CreateTransactionBody = { text: string } | { amount: number; category: Category; description: string };

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PeriodSummary {
  byCategory: { category: Category; amount: number }[];
  byDay: { date: string; amount: number }[];
}

export interface ChatResponse {
  reply: string;
  actions: AgentAction[];
}

export interface SimulateBody {
  currentCostPerDay: number;
  alternativeCostPerDay: number;
  daysPerMonth: number;
}

export interface SimulateResponse {
  monthlySaving: number;
  yearlySaving: number;
}

export type UpdatePermissionsBody = Partial<Pick<Permissions, 'level' | 'scopes' | 'perActionLimit' | 'dailyLimit'>>;

export type PolicyErrorCode =
  | 'KILL_SWITCH_ACTIVE'
  | 'INSUFFICIENT_LEVEL'
  | 'MISSING_SCOPE'
  | 'INVALID_ARGS'
  | 'TARGET_NOT_ALLOWED'
  | 'PER_ACTION_LIMIT'
  | 'DAILY_LIMIT'
  | 'INSUFFICIENT_FUNDS';

export interface ApiErrorBody {
  error: { code: string; message: string };
}

// System maximums per level (PLAN.md §8). Users may lower these, never raise them.
export const LEVEL_LIMITS: Record<PermissionLevel, { perAction: number; daily: number } | null> = {
  L0: null,
  L1: null,
  L2: { perAction: 100_000, daily: 300_000 },
  L3: { perAction: 50_000, daily: 100_000 },
};
