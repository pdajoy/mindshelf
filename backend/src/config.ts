import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3456', 10),

  ai: {
    provider: (process.env.AI_PROVIDER || 'openai') as 'openai' | 'anthropic',
    openai: {
      apiKey: process.env.OPENAI_API_KEY || '',
      baseURL: process.env.OPENAI_BASE_URL || undefined,
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    },
    anthropic: {
      apiKey: process.env.ANTHROPIC_API_KEY || '',
      model: process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-20250514',
    },
  },

  log: {
    apiCalls: process.env.LOG_API_CALLS === 'true',
    maxEntries: parseInt(process.env.LOG_MAX_ENTRIES || '500', 10),
  },
} as const;
