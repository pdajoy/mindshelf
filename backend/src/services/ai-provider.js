import { config } from '../config.js';
import { logApiCall } from './api-logger.js';

class OpenAIProvider {
  constructor(modelOverride) {
    this.model = modelOverride || config.ai.openai.model;
    this.baseUrl = config.ai.openai.baseUrl;
  }

  async _getClient() {
    if (!this._client) {
      const { default: OpenAI } = await import('openai');
      this._client = new OpenAI({
        apiKey: config.ai.openai.apiKey,
        ...(this.baseUrl ? { baseURL: this.baseUrl } : {}),
      });
    }
    return this._client;
  }

  async chat(systemPrompt, userMessage, { json = false, messages } = {}) {
    const client = await this._getClient();
    const start = Date.now();

    const msgs = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const resp = await client.chat.completions.create({
      model: this.model,
      messages: msgs,
      ...(json ? { response_format: { type: 'json_object' } } : {}),
      temperature: 0.3,
    });

    const content = resp.choices[0].message.content;
    logApiCall({
      provider: 'openai',
      model: this.model,
      inputTokens: resp.usage?.prompt_tokens,
      outputTokens: resp.usage?.completion_tokens,
      durationMs: Date.now() - start,
      success: true,
    });
    return content;
  }

  async *chatStream(systemPrompt, userMessage, { messages } = {}) {
    const client = await this._getClient();
    const start = Date.now();

    const msgs = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const stream = await client.chat.completions.create({
      model: this.model,
      messages: msgs,
      temperature: 0.3,
      stream: true,
    });

    let full = '';
    for await (const chunk of stream) {
      const delta = chunk.choices[0]?.delta?.content || '';
      if (delta) {
        full += delta;
        yield delta;
      }
    }

    logApiCall({
      provider: 'openai',
      model: this.model,
      durationMs: Date.now() - start,
      success: true,
    });
  }
}

class ClaudeProvider {
  constructor(modelOverride) {
    this.model = modelOverride || config.ai.claude.model;
  }

  async _getClient() {
    if (!this._client) {
      const { default: Anthropic } = await import('@anthropic-ai/sdk');
      this._client = new Anthropic({ apiKey: config.ai.claude.apiKey });
    }
    return this._client;
  }

  async chat(systemPrompt, userMessage, { json = false, messages } = {}) {
    const client = await this._getClient();
    const start = Date.now();
    const prefill = json ? '{\n' : '';

    const msgs = messages
      ? messages.filter(m => m.role !== 'system')
      : [
          { role: 'user', content: userMessage },
          ...(json ? [{ role: 'assistant', content: prefill }] : []),
        ];

    const system = messages
      ? messages.find(m => m.role === 'system')?.content || systemPrompt
      : systemPrompt;

    const resp = await client.messages.create({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: msgs,
    });
    const text = resp.content[0].text;
    const content = json && !messages ? prefill + text : text;

    logApiCall({
      provider: 'claude',
      model: this.model,
      inputTokens: resp.usage?.input_tokens,
      outputTokens: resp.usage?.output_tokens,
      durationMs: Date.now() - start,
      success: true,
    });
    return content;
  }

  async *chatStream(systemPrompt, userMessage, { messages } = {}) {
    const client = await this._getClient();
    const start = Date.now();

    const msgs = messages
      ? messages.filter(m => m.role !== 'system')
      : [{ role: 'user', content: userMessage }];

    const system = messages
      ? messages.find(m => m.role === 'system')?.content || systemPrompt
      : systemPrompt;

    const stream = client.messages.stream({
      model: this.model,
      max_tokens: 4096,
      system,
      messages: msgs,
    });

    for await (const event of stream) {
      if (event.type === 'content_block_delta' && event.delta?.text) {
        yield event.delta.text;
      }
    }

    logApiCall({
      provider: 'claude',
      model: this.model,
      durationMs: Date.now() - start,
      success: true,
    });
  }
}

class OllamaProvider {
  constructor(modelOverride) {
    this.baseUrl = config.ai.ollama.baseUrl;
    this.model = modelOverride || config.ai.ollama.model;
  }

  async chat(systemPrompt, userMessage, { json = false, messages } = {}) {
    const start = Date.now();

    const msgs = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: false,
        ...(json ? { format: 'json' } : {}),
        messages: msgs,
      }),
    });
    const data = await resp.json();
    logApiCall({
      provider: 'ollama',
      model: this.model,
      durationMs: Date.now() - start,
      success: true,
    });
    return data.message.content;
  }

  async *chatStream(systemPrompt, userMessage, { messages } = {}) {
    const start = Date.now();

    const msgs = messages || [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userMessage },
    ];

    const resp = await fetch(`${this.baseUrl}/api/chat`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.model,
        stream: true,
        messages: msgs,
      }),
    });

    const reader = resp.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          const obj = JSON.parse(line);
          if (obj.message?.content) yield obj.message.content;
        } catch {}
      }
    }

    logApiCall({
      provider: 'ollama',
      model: this.model,
      durationMs: Date.now() - start,
      success: true,
    });
  }
}

const providers = {
  openai: OpenAIProvider,
  claude: ClaudeProvider,
  ollama: OllamaProvider,
};

let _instance = null;

export function getAIProvider(modelOverride) {
  if (modelOverride) {
    const ProviderClass = providers[config.ai.provider];
    return new ProviderClass(modelOverride);
  }
  if (!_instance) {
    const ProviderClass = providers[config.ai.provider];
    if (!ProviderClass) {
      throw new Error(`Unknown AI provider: ${config.ai.provider}. Supported: ${Object.keys(providers).join(', ')}`);
    }
    _instance = new ProviderClass();
  }
  return _instance;
}

export function resetProvider() {
  _instance = null;
}

export function getAvailableModels() {
  const models = [];
  if (config.ai.openai.apiKey) {
    models.push({
      provider: 'openai',
      model: config.ai.openai.model,
      label: `OpenAI: ${config.ai.openai.model}`,
      isDefault: config.ai.provider === 'openai',
    });
  }
  if (config.ai.claude.apiKey && config.ai.claude.apiKey !== 'sk-ant-xxx') {
    models.push({
      provider: 'claude',
      model: config.ai.claude.model,
      label: `Claude: ${config.ai.claude.model}`,
      isDefault: config.ai.provider === 'claude',
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
