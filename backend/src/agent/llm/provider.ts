// LLM adapter interface (PLAN.md §10). The LLM only proposes; Policy Guard decides.
import type { Category } from '@femate/shared';

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
  chat(input: { system: string; messages: LlmMessage[]; tools: ToolDefinition[] }): Promise<{ text?: string; toolCalls?: ToolCall[] }>;
  categorize(text: string): Promise<{ amount: number | null; category: Category; description: string }>;
}
