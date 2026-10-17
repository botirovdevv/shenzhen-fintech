import type { Config } from '../../config';
import { mockProvider } from './mock';
import type { LlmProvider } from './provider';

export function createProvider(cfg: Pick<Config, 'LLM_PROVIDER'>): LlmProvider {
  switch (cfg.LLM_PROVIDER) {
    case 'mock':
      return mockProvider;
  }
}
