// LLM adapter interface (PLAN.md §10). The LLM only proposes; Policy Guard decides.
import type { Category, Currency } from '@femate/shared';

export interface ToolCall {
  id: string;
  name: string;
  args: unknown;
}

export type LlmMessage =
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string; toolCalls?: ToolCall[] }
  | { role: 'tool'; content: string; toolCallId: string; name: string };

export interface ToolDefinition {
  name: string;
  description: string;
  /** JSON Schema of the arguments object. */
  parameters: Record<string, unknown>;
}

export interface LlmProvider {
  /** `currency` is the user's: tool amounts are integers in its minor units (so'm, cents). */
  chat(input: { system: string; messages: LlmMessage[]; tools: ToolDefinition[]; currency: Currency }): Promise<{ text?: string; toolCalls?: ToolCall[] }>;
  /** `amount` is in whole units of `currency`; currency null means the text named none (use the user's). */
  categorize(text: string): Promise<{ amount: number | null; currency: Currency | null; category: Category; description: string }>;
}
