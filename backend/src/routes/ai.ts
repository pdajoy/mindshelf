import { Router } from 'express';
import { categorizeTabs, applyClassifications, CATEGORY_DEFINITIONS } from '../services/categorizer.js';
import { summarizeTabStream, followUpStream } from '../services/summarizer.js';
import { getAvailableModels } from '../services/ai-provider.js';
import { listTabs, getTabById } from '../db/tab-repo.js';

export const aiRouter = Router();

aiRouter.get('/models', (_req, res) => {
  res.json(getAvailableModels());
});

aiRouter.get('/categories', (_req, res) => {
  res.json(CATEGORY_DEFINITIONS);
});

aiRouter.post('/classify', async (req, res) => {
  const { tabIds, model } = req.body;

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    let tabs;
    if (tabIds && Array.isArray(tabIds)) {
      tabs = tabIds.map(id => getTabById(id)).filter(Boolean);
    } else {
      const result = listTabs({ status: 'active', limit: 1000 });
      tabs = result.tabs;
    }

    if (!tabs.length) {
      res.write(`data: ${JSON.stringify({ type: 'error', message: '没有找到可分类的标签' })}\n\n`);
      res.write('data: [DONE]\n\n');
      res.end();
      return;
    }

    const { classifications, stats } = await categorizeTabs(
      tabs.map(t => ({ id: t!.id, url: t!.url, title: t!.title, domain: t!.domain, content_text: t!.content_text })),
      {
        model,
        onProgress: (progress) => {
          res.write(`data: ${JSON.stringify({ type: 'progress', ...progress })}\n\n`);
        },
      }
    );

    applyClassifications(classifications);

    res.write(`data: ${JSON.stringify({ type: 'complete', classifications, stats })}\n\n`);
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

aiRouter.post('/summarize/:tabId', async (req, res) => {
  const tab = getTabById(req.params.tabId);
  if (!tab) {
    return res.status(404).json({ error: 'Tab not found' });
  }

  const { detailed, model } = req.body || {};

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of summarizeTabStream(tab, { detailed, model })) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

aiRouter.post('/chat', async (req, res) => {
  const { messages, model, agent } = req.body;
  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    if (agent) {
      const { agentChatStream } = await import('../services/agent-chat.js');
      for await (const event of agentChatStream(messages, { model })) {
        res.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    } else {
      const { chatStreamGeneral } = await import('../services/summarizer.js');
      for await (const chunk of chatStreamGeneral(messages, { model })) {
        res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
      }
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});

aiRouter.post('/followup', async (req, res) => {
  const { conversationId, question, model } = req.body;
  if (!conversationId || !question) {
    return res.status(400).json({ error: 'conversationId and question required' });
  }

  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  try {
    for await (const chunk of followUpStream(conversationId, question, { model })) {
      res.write(`data: ${JSON.stringify({ type: 'chunk', content: chunk })}\n\n`);
    }
    res.write('data: [DONE]\n\n');
  } catch (err) {
    res.write(`data: ${JSON.stringify({ type: 'error', message: (err as Error).message })}\n\n`);
    res.write('data: [DONE]\n\n');
  }
  res.end();
});
