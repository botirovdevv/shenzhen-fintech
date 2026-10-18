// Shared API contract between apps/mobile, apps/api and apps/bot (PLAN.md §11).
// Money is an integer amount of the user's currency in its minor unit (so'm, cents). Dates are ISO 8601 strings.

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
  currency: Currency;
  voiceLanguage: VoiceLanguage;
}

export interface Account {
  id: string;
  type: 'card' | 'savings' | 'cash';
  name: string;
  balance: number;
  currency: Currency;
}

// 'card': a purchase with the FeMate virtual card, approved live by the server.
export type TransactionSource = 'bank' | 'manual' | 'voice' | 'sms_forward' | 'agent' | 'card';

export interface Transaction {
  id: string;
  accountId: string;
  amount: number;
  direction: 'out' | 'in';
  category: Category;
  description: string;
  source: TransactionSource;
  occurredAt: string;
  /** Set when the expense was entered in another currency and converted. */
  original?: { amount: number; currency: Currency };
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

// FeMate virtual card (Lithic). Purchases spend from the user's card account and are approved or
// declined live by server rules: frozen, funds, category budget.
export interface PaymentCard {
  id: string;
  network: 'VISA' | 'MASTERCARD';
  lastFour: string;
  expMonth: string;
  expYear: string;
  frozen: boolean;
  /** Decline a purchase that would take its category over the monthly budget. */
  blockOverBudget: boolean;
  /** The account purchases are paid from (the user's card account). */
  accountId: string;
  createdAt: string;
}

export interface CardStatus {
  /** False when the server has no card provider configured. */
  available: boolean;
  /** Sandbox cards hold no real money; purchases can be simulated. */
  sandbox: boolean;
  card: PaymentCard | null;
}

/** Full number and CVV, fetched from the provider on demand and never stored by FeMate. */
export interface CardDetails {
  pan: string;
  cvv: string;
  expMonth: string;
  expYear: string;
}

export interface CardAuthorization {
  id: string;
  /** In the user's currency. */
  amount: number;
  /** What the merchant charged, when in another currency. */
  original?: { amount: number; currency: Currency };
  merchant: string;
  category: Category;
  approved: boolean;
  /** APPROVED or the decline code sent to the network (INSUFFICIENT_FUNDS, CARD_PAUSED, ...). */
  result: string;
  reason: string;
  transactionId?: string;
  createdAt: string;
}

export type UpdateCardBody = Partial<Pick<PaymentCard, 'frozen' | 'blockOverBudget'>>;

/** Sandbox only: `amount` in the user's currency, sent to the card network in USD. */
export interface SimulatePurchaseBody {
  amount: number;
  merchant: string;
  mcc?: string;
}

export interface SimulatePurchaseResponse {
  authorization: CardAuthorization;
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

// Changing `currency` converts every balance, transaction, budget and limit at the fixed rates below.
export type UpdateMeBody = Partial<
  Pick<User, 'monthlyIncome' | 'savingsGoalMonthly' | 'fixedCostsMonthly' | 'reportTime' | 'currency' | 'voiceLanguage'>
> & {
  expoPushToken?: string;
};

export interface ConnectBankBody {
  scopes: Scope[];
  level: PermissionLevel;
}

// Money in and between the user's own accounts. Amounts are in the user's currency. All of them are
// recorded as 'transfer' rows, so they never count as spending.

/** Money from outside: a card top-up (sandbox: no real money moves), salary, cash received. */
export interface DepositBody {
  to: Account['type'];
  amount: number;
  description?: string;
}

/** Between the user's own accounts, e.g. an ATM withdrawal is card → cash. */
export interface TransferBody {
  from: Account['type'];
  to: Account['type'];
  amount: number;
}

/** What's really in the account ("I have 200 000 in cash"); the difference is recorded as an adjustment. */
export interface SetBalanceBody {
  account: Account['type'];
  balance: number;
}

export interface MoneyResponse {
  accounts: Account[];
  /** Null when nothing changed (the balance was already right). */
  transaction: Transaction | null;
}

/** `currency` defaults to the user's; another one is converted, and the entered amount kept as `original`. */
export type CreateTransactionBody = { text: string } | { amount: number; category: Category; description: string; currency?: Currency };

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface PeriodSummary {
  byCategory: { category: Category; amount: number }[];
  byDay: { date: string; amount: number }[];
}

/** One category this week against its usual week (the 3 weeks before). `changePct` is null without history. */
export interface CategoryTrend {
  category: Category;
  thisWeek: number;
  usualWeek: number;
  changePct: number | null;
}

/** Month-to-date spending against the plan. Every number comes from the Rules Engine. */
export interface MonthPlan {
  date: string;
  dailyAllowance: number;
  todaySpent: number;
  /** How far today is over the daily allowance, in percent; 0 when within it. */
  todayOverPct: number;
  monthBudget: number;
  monthSpent: number;
  /** What the plan allowed from the 1st through today. */
  plannedToDate: number;
  dayOfMonth: number;
  daysLeft: number;
  /** Per-day limit for the remaining days that lands the month on budget; 0 when nothing is left. */
  catchUpDaily: number;
  /** How much less than the usual daily allowance that is. */
  cutPerDay: number;
  categoryTrends: CategoryTrend[];
}

export interface InsightTip {
  category: Category | null;
  text: string;
  /** Rough saving over the rest of the month if the user follows the tip. */
  saving: number;
}

/** The assistant's daily check-in. */
export interface DailyInsight {
  status: 'on_track' | 'over';
  headline: string;
  body: string;
  tips: InsightTip[];
  plan: MonthPlan;
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

/** `agentEnabled: true` is the only way back on after the kill switch, and then the level starts again at L1. */
export type UpdatePermissionsBody = Partial<Pick<Permissions, 'level' | 'scopes' | 'perActionLimit' | 'dailyLimit'>> & {
  agentEnabled?: true;
};

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

// Currencies

export type Currency = 'UZS' | 'USD' | 'EUR' | 'RUB' | 'CNY';
export const CURRENCIES: readonly Currency[] = ['UZS', 'USD', 'EUR', 'RUB', 'CNY'];

/** Speech-to-text language; 'auto' lets Whisper detect it. */
export type VoiceLanguage = 'auto' | 'ru' | 'en';
export const VOICE_LANGUAGES: readonly VoiceLanguage[] = ['auto', 'ru', 'en'];

export const CURRENCY_INFO: Record<
  Currency,
  {
    name: string;
    symbol: string;
    symbolFirst: boolean;
    decimals: number;
    uzsRate: number;
    levelLimits: { L2: [number, number]; L3: [number, number] };
  }
> = {
  // uzsRate: UZS per 1 unit. Fixed sandbox rates, so demos and tests are reproducible.
  // levelLimits: the agent's system maximum per level (PLAN.md §8), [per action, daily] in whole units,
  // rounded from the UZS ones. Users may lower these, never raise them.
  UZS: {
    name: 'Uzbek so’m',
    symbol: 'UZS',
    symbolFirst: false,
    decimals: 0,
    uzsRate: 1,
    levelLimits: { L2: [100_000, 300_000], L3: [50_000, 100_000] },
  },
  USD: { name: 'US dollar', symbol: '$', symbolFirst: true, decimals: 2, uzsRate: 12_100, levelLimits: { L2: [10, 30], L3: [5, 10] } },
  EUR: { name: 'Euro', symbol: '€', symbolFirst: true, decimals: 2, uzsRate: 14_000, levelLimits: { L2: [10, 30], L3: [5, 10] } },
  RUB: {
    name: 'Russian ruble',
    symbol: '₽',
    symbolFirst: false,
    decimals: 2,
    uzsRate: 150,
    levelLimits: { L2: [700, 2_000], L3: [350, 700] },
  },
  CNY: { name: 'Chinese yuan', symbol: '¥', symbolFirst: true, decimals: 2, uzsRate: 1_700, levelLimits: { L2: [60, 180], L3: [30, 60] } },
};

const scale = (c: Currency) => 10 ** CURRENCY_INFO[c].decimals;

/** 4.5 USD -> 450 (minor units). */
export const toMinor = (major: number, c: Currency) => Math.round(major * scale(c));
/** 450 USD minor units -> 4.5. */
export const toMajor = (minor: number, c: Currency) => minor / scale(c);

/** Minor units of `from` -> minor units of `to`, at the fixed rates. */
export function convertMoney(minor: number, from: Currency, to: Currency): number {
  if (from === to) return minor;
  return Math.round(((toMajor(minor, from) * CURRENCY_INFO[from].uzsRate) / CURRENCY_INFO[to].uzsRate) * scale(to));
}

/** A UZS amount (e.g. a rule threshold) in `c`'s minor units. */
export const fromUzs = (uzs: number, c: Currency) => convertMoney(uzs, 'UZS', c);

/** Rounds a step up to 1, 2 or 5 × 10^k, so converted thresholds stay readable (83 cents -> 100). */
export function niceStep(minor: number): number {
  if (minor <= 1) return 1;
  const p = 10 ** Math.floor(Math.log10(minor));
  return ([1, 2, 5, 10].find((m) => m * p >= minor) ?? 10) * p;
}

/** Level system maximum in `c`'s minor units. */
export function levelLimits(level: PermissionLevel, c: Currency): { perAction: number; daily: number } | null {
  if (level !== 'L2' && level !== 'L3') return null;
  const [perAction, daily] = CURRENCY_INFO[c].levelLimits[level];
  return { perAction: toMinor(perAction, c), daily: toMinor(daily, c) };
}

/** 2350000 UZS -> "2 350 000"; 125050 USD -> "1 250.50". No currency mark. */
export function formatNumber(minor: number, c: Currency): string {
  const d = CURRENCY_INFO[c].decimals;
  const sign = minor < 0 ? '−' : '';
  const abs = Math.abs(Math.round(minor));
  const whole = String(Math.floor(abs / 10 ** d)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  return sign + whole + (d ? `.${String(abs % 10 ** d).padStart(d, '0')}` : '');
}

/** "20 000 UZS", "$4.50", "350.00 ₽". */
export function formatMoney(minor: number, c: Currency): string {
  const i = CURRENCY_INFO[c];
  const n = formatNumber(minor, c);
  if (!i.symbolFirst) return `${n} ${i.symbol}`;
  return n.startsWith('−') ? `−${i.symbol}${n.slice(1)}` : `${i.symbol}${n}`;
}

// Named, not `export *`: Node's CommonJS interop (tsx in the API) only sees names listed here.
export { categorize, currencyOf, parseAmount, parseEnglishNumber, parseUzbekNumber } from './categorize';
