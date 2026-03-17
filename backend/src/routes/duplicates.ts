import { Router } from 'express';
import { detectDuplicates, detectSimilarTitles } from '../services/duplicate.service.js';

export const duplicatesRouter = Router();

duplicatesRouter.get('/detect', (_req, res) => {
  try {
    const exact = detectDuplicates();
    const similar = detectSimilarTitles(0.75);
    const all = [...exact, ...similar];
    res.json({ groups: all, totalGroups: all.length });
  } catch (err) {
    res.status(500).json({ error: (err as Error).message });
  }
});
