import { Router } from 'express';
import { getStats } from '../db/tab-repo.js';

export const statsRouter = Router();

statsRouter.get('/', (_req, res) => {
  try {
    const stats = getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: String(err) });
  }
});
