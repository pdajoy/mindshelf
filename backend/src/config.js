import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3456'),
  host: process.env.HOST || '127.0.0.1',

  ai: {
    provider: process.env.AI_PROVIDER || 'openai',
    openai: {
      apiKey: process.env.OPENAI_API_KEY,
      baseUrl: process.env.OPENAI_BASE_URL || undefined,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    claude: {
      apiKey: process.env.ANTHROPIC_API_KEY,
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-4-20250514',
    },
    ollama: {
      baseUrl: process.env.OLLAMA_BASE_URL || 'http://localhost:11434',
      model: process.env.OLLAMA_MODEL || 'llama3.2',
    },
  },

  db: {
    path: new URL('../data/tabs.db', import.meta.url).pathname,
  },

  logging: {
    apiCalls: process.env.LOG_API_CALLS !== 'false',
    maxEntries: parseInt(process.env.LOG_MAX_ENTRIES || '500'),
  },
};
