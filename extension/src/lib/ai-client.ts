import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import type { LanguageModel } from 'ai';

export type AIProvider = 'openai' | 'anthropic';

export interface AIConfig {
  provider: AIProvider;
  apiKey: string;
  model: string;
  baseUrl?: string;
}

export function isAIConfigured(config: AIConfig): boolean {
  return !!(config.apiKey && config.model);
}

export function getModel(config: AIConfig): LanguageModel {
  if (config.provider === 'anthropic') {
    const anthropic = createAnthropic({
      apiKey: config.apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
      headers: {
        'anthropic-dangerous-direct-browser-access': 'true',
      },
    });
    return anthropic(config.model);
  }

  const baseUrl = config.baseUrl
    ? config.baseUrl.replace(/\/+$/, '')
    : undefined;
  const openai = createOpenAI({
    apiKey: config.apiKey,
    ...(baseUrl ? { baseURL: baseUrl.endsWith('/v1') ? baseUrl : `${baseUrl}/v1` } : {}),
  });
  return openai.chat(config.model);
}
