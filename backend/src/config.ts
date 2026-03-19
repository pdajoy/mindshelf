import 'dotenv/config';

export const config = {
  port: parseInt(process.env.PORT || '3456', 10),
} as const;
