import { config } from '../config.js';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';

let openaiProvider: ReturnType<typeof createOpenAI> | null = null;
let anthropicProvider: ReturnType<typeof createAnthropic> | null = null;
let ollamaProvider: ReturnType<typeof createOpenAI> | null = null;

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

function getOllamaProvider() {
  if (!ollamaProvider) {
    const base = config.ai.ollama.baseURL.replace(/\/+$/, '');
    ollamaProvider = createOpenAI({
      baseURL: `${base}/v1`,
      apiKey: 'ollama',
    });
  }
  return ollamaProvider;
}

export function getModel(modelOverride?: string) {
  const provider = config.ai.provider;

  if (provider === 'openai') {
    return getOpenAIProvider().chat(modelOverride || config.ai.openai.model);
  }

  if (provider === 'anthropic') {
    return getAnthropicProvider()(modelOverride || config.ai.anthropic.model);
  }

  return getOllamaProvider().chat(modelOverride || config.ai.ollama.model);
}

export function getAvailableModels() {
  const models: Array<{ provider: string; model: string; label: string; isDefault: boolean }> = [];
  if (config.ai.openai.apiKey && config.ai.openai.apiKey !== 'sk-xxx') {
    models.push({
      provider: 'openai',
      model: config.ai.openai.model,
      label: `OpenAI: ${config.ai.openai.model}`,
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
  models.push({
    provider: 'ollama',
    model: config.ai.ollama.model,
    label: `Ollama: ${config.ai.ollama.model}`,
    isDefault: config.ai.provider === 'ollama',
  });
  return models;
}
