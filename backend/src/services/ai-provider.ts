import { config } from '../config.js';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

let openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;

function getOpenAIProvider() {
  if (!openaiProvider) {
    openaiProvider = createOpenAI({
      apiKey: config.ai.openai.apiKey,
      ...(config.ai.openai.baseURL ? { baseURL: config.ai.openai.baseURL } : {}),
    });
  }
  return openaiProvider;
}

function getAnthropicProvider() {
  if (!anthropicProvider) {
    anthropicProvider = createAnthropic({
      apiKey: config.ai.anthropic.apiKey,
    });
  }
  return anthropicProvider;
}

export function getModel(modelOverride?: string) {
  const provider = config.ai.provider;

  if (provider === 'anthropic') {
    return getAnthropicProvider()(modelOverride || config.ai.anthropic.model);
  }

  return getOpenAIProvider().chat(modelOverride || config.ai.openai.model);
}

export function getAvailableModels() {
  const models: Array<{ provider: string; model: string; label: string; isDefault: boolean }> = [];
  if (config.ai.openai.apiKey && config.ai.openai.apiKey !== 'sk-xxx') {
    const label = config.ai.openai.baseURL
      ? `OpenAI-Compatible: ${config.ai.openai.model}`
      : `OpenAI: ${config.ai.openai.model}`;
    models.push({
      provider: 'openai',
      model: config.ai.openai.model,
      label,
      isDefault: config.ai.provider === 'openai',
    });
  }
  if (config.ai.anthropic.apiKey && config.ai.anthropic.apiKey !== 'sk-ant-xxx') {
    models.push({
      provider: 'anthropic',
      model: config.ai.anthropic.model,
      label: `Claude: ${config.ai.anthropic.model}`,
      isDefault: config.ai.provider === 'anthropic',
    });
  }
  return models;
}
