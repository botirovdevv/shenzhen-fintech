import type { Config } from '../../config';
import { mockProvider } from './mock';
import { createOpenAiProvider } from './openai';
import type { LlmProvider } from './provider';

export function createProvider(cfg: Pick<Config, 'LLM_PROVIDER'> & Partial<Pick<Config, 'OPENAI_API_KEY' | 'OPENAI_MODEL'>>): LlmProvider {
  switch (cfg.LLM_PROVIDER) {
    case 'mock':
      return mockProvider;
    case 'openai':
      if (!cfg.OPENAI_API_KEY) throw new Error('LLM_PROVIDER=openai needs OPENAI_API_KEY');
      return createOpenAiProvider(cfg.OPENAI_API_KEY, cfg.OPENAI_MODEL ?? 'gpt-5-mini');
  }
}
