import 'dotenv/config';
import express from 'express';
import type { Request, Response, NextFunction, RequestHandler } from 'express';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function resolveListenTarget(): { port: number; host: string } {
  const argv = process.argv.slice(2);
  let cliPort: number | null = null;
  let cliHost: string | null = null;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--port' && argv[i + 1]) {
      const n = Number(argv[++i]);
      if (Number.isFinite(n) && n > 0) cliPort = n;
    } else if (arg.startsWith('--port=')) {
      const n = Number(arg.slice('--port='.length));
      if (Number.isFinite(n) && n > 0) cliPort = n;
    } else if (arg === '--host' && argv[i + 1]) {
      cliHost = argv[++i];
    } else if (arg.startsWith('--host=')) {
      cliHost = arg.slice('--host='.length);
    }
  }

  const envPort = Number(process.env.PORT);
  const nginxPort = Number(process.env.NGINX_PORT);
  const defaultAppPort = Number(process.env.DEFAULT_APP_PORT) || 3000;
  const port =
    cliPort ??
    (Number.isFinite(envPort) && envPort > 0 && envPort !== nginxPort ? envPort : defaultAppPort);
  const host = cliHost || '0.0.0.0';
  return { port, host };
}

const { port: PORT, host: HOST } = resolveListenTarget();
const MODEL_ID = 'gemini-4-hydrogen';

function getConfiguredApiKey(): string | null {
  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key || key === 'MY_GEMINI_API_KEY' || key.length < 12) return null;
  return key;
}

function getGenAIClient(): GoogleGenAI | null {
  const apiKey = getConfiguredApiKey();
  if (!apiKey) return null;
  return new GoogleGenAI({
    apiKey,
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      },
    },
  });
}

// Per-IP sliding-window rate limiter (24 AI calls / 60s)
const rateWindowMs = 60_000;
const rateMaxRequests = 24;
const ipHits = new Map<string, number[]>();

function isRateLimited(ip: string): boolean {
  const now = Date.now();
  const prev = ipHits.get(ip) || [];
  const recent = prev.filter((t) => now - t < rateWindowMs);
  if (recent.length >= rateMaxRequests) {
    ipHits.set(ip, recent);
    return true;
  }
  recent.push(now);
  ipHits.set(ip, recent);
  return false;
}

function clampStr(val: unknown, maxLen: number, fallback = ''): string {
  if (typeof val !== 'string') return fallback;
  return val.replace(/[\u0000-\u001F\u007F]/g, ' ').trim().slice(0, maxLen);
}

function clampList(val: unknown, maxItems: number, itemMaxLen: number): string[] {
  if (!Array.isArray(val)) return [];
  return val
    .slice(0, maxItems)
    .map((item) => clampStr(item, itemMaxLen))
    .filter(Boolean);
}

async function callGeminiWithRetry<T>(fn: (ai: GoogleGenAI) => Promise<T>): Promise<T> {
  const ai = getGenAIClient();
  if (!ai) {
    const err = new Error('GEMINI_API_KEY is not configured');
    (err as Error & { statusCode?: number }).statusCode = 503;
    throw err;
  }

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      return await fn(ai);
    } catch (err: unknown) {
      lastError = err;
      const msg = err instanceof Error ? err.message : String(err);
      const isRetryable = /429|500|502|503|504|timeout|UNAVAILABLE|RESOURCE_EXHAUSTED/i.test(msg);
      if (!isRetryable || attempt === 2) break;
      const backoffMs = 400 * Math.pow(2, attempt);
      await new Promise((resolve) => setTimeout(resolve, backoffMs));
    }
  }
  throw lastError;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: '512kb' }));

  app.get('/api/ai/health', (_req: Request, res: Response) => {
    const configured = Boolean(getConfiguredApiKey());
    res.json({
      ok: true,
      configured,
      model: MODEL_ID,
    });
  });

  app.post('/api/ai/saga', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ ok: false, error: 'Rate limit exceeded. Wait a moment before weaving another saga.' });
      return;
    }

    if (!getConfiguredApiKey()) {
      res.status(503).json({ ok: false, configured: false, error: 'Gemini AI is not configured; using local saga weaver.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const protagonistName = clampStr(body.protagonistName, 80, 'Unknown Noble');
    const protagonistTitle = clampStr(body.protagonistTitle, 80, 'Lord');
    const houseName = clampStr(body.houseName, 60, 'House Sovereign');
    const traits = clampList(body.traits, 10, 40);
    const tragicFlaw = clampStr(body.tragicFlaw, 180, 'Unchecked Pride');
    const darkSecret = clampStr(body.darkSecret, 200, 'Hidden Pact');
    const antagonistName = clampStr(body.antagonistName, 80);
    const realmName = clampStr(body.realmName, 80, 'The Realm');
    const burgName = clampStr(body.burgName, 80, 'The Citadel');
    const genre = clampStr(body.genre, 50, 'Dynastic Feud');
    const year = Number(body.year) || 1042;
    const customPremise = clampStr(body.customPremise, 400);

    const prompt = [
      `Write an original medieval high-fantasy chronicle chapter in English.`,
      `World Context: Realm of ${realmName}, Seat of ${burgName}, Year ${year} AC, Genre "${genre}".`,
      `Protagonist: ${protagonistTitle} ${protagonistName} of House ${houseName}.`,
      `Character Traits: ${traits.join(', ') || 'Resolute'}.`,
      `Tragic Flaw: ${tragicFlaw}. Dark Secret: ${darkSecret}.`,
      antagonistName ? `Rival / Antagonist: ${antagonistName}.` : '',
      customPremise ? `Player Custom Premise (weave this centrally into the conflict): ${customPremise}` : '',
      `Produce a literary, atmospheric 2-paragraph narrative prose, one evocative spoken dialogue line, a crisp 1-sentence premise, a title, and immediate political consequences.`,
    ]
      .filter(Boolean)
      .join('\n');

    try {
      const result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                premise: { type: Type.STRING },
                fullProse: { type: Type.STRING },
                dialogueSnippet: { type: Type.STRING },
                consequences: { type: Type.STRING },
              },
              required: ['title', 'premise', 'fullProse', 'dialogueSnippet', 'consequences'],
            },
          },
        });
        return JSON.parse(response.text || '{}');
      });

      res.json({ ok: true, saga: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Saga generation failed';
      res.status(502).json({ ok: false, error: msg });
    }
  });

  app.post('/api/ai/council', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ ok: false, error: 'Council chambers are overwhelmed. Wait a moment.' });
      return;
    }

    if (!getConfiguredApiKey()) {
      res.status(503).json({ ok: false, configured: false, error: 'Gemini AI is not configured; using royal steward heuristics.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const question = clampStr(body.question, 420);
    if (!question) {
      res.status(400).json({ ok: false, error: 'Please enter a question for the Royal Council.' });
      return;
    }

    const realmName = clampStr(body.realmName, 80, 'The Crown');
    const monarchName = clampStr(body.monarchName, 80, 'Your Grace');
    const year = Number(body.year) || 1042;
    const treasuryGold = Number(body.treasuryGold) || 0;
    const pendingBills = clampList(body.pendingBills, 8, 160);
    const marketShortages = clampList(body.marketShortages, 10, 140);
    const stratumUnrest = clampList(body.stratumUnrest, 8, 140);
    const activeWars = clampList(body.activeWars, 6, 180);

    const prompt = [
      `You are the Grand Royal Council Envoy of ${realmName} in Year ${year} AC addressing ${monarchName}.`,
      `Crown Treasury: ${Math.round(treasuryGold)}g.`,
      `Pending Council Bills: ${pendingBills.length > 0 ? pendingBills.join(' | ') : 'None'}.`,
      `Burg Market Bottlenecks & Shortages: ${marketShortages.length > 0 ? marketShortages.join(' | ') : 'Markets stable'}.`,
      `Social Stratum Unrest: ${stratumUnrest.length > 0 ? stratumUnrest.join(' | ') : 'Estates calm'}.`,
      `Active Wars & Fronts: ${activeWars.length > 0 ? activeWars.join(' | ') : 'Realm at peace'}.`,
      `Sovereign's Question: "${question}"`,
      `Respond concisely in character with sharp strategic counsel grounded strictly in the provided figures.`,
    ].join('\n');

    try {
      const result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                advisorTitle: { type: Type.STRING },
                verdictHeadline: { type: Type.STRING },
                counsel: { type: Type.STRING },
                actionItems: {
                  type: Type.ARRAY,
                  items: { type: Type.STRING },
                },
              },
              required: ['advisorTitle', 'verdictHeadline', 'counsel', 'actionItems'],
            },
          },
        });
        return JSON.parse(response.text || '{}');
      });

      res.json({ ok: true, advice: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Council inquiry failed';
      res.status(502).json({ ok: false, error: msg });
    }
  });

  app.post('/api/ai/chronicle', async (req: Request, res: Response) => {
    const ip = req.ip || 'unknown';
    if (isRateLimited(ip)) {
      res.status(429).json({ ok: false, error: 'Archivists need a moment between epoch summaries.' });
      return;
    }

    if (!getConfiguredApiKey()) {
      res.status(503).json({ ok: false, configured: false, error: 'Gemini AI is not configured; using local chronicle synthesis.' });
      return;
    }

    const body = (req.body || {}) as Record<string, unknown>;
    const worldName = clampStr(body.worldName, 80, 'RealmSmith');
    const foundingYear = Number(body.foundingYear) || 1042;
    const currentYear = Number(body.currentYear) || foundingYear;
    const events = clampList(body.events, 20, 200);
    const realms = clampList(body.realms, 10, 80);

    const prompt = [
      `Synthesize an authoritative historical epoch summary for the world of ${worldName}, covering years ${foundingYear} AC to ${currentYear} AC.`,
      `Major Realms: ${realms.join(', ') || 'Independent Crownlands'}.`,
      `Recorded Annals:\n- ${events.join('\n- ') || 'A quiet era of consolidation.'}`,
      `Deliver an evocative 2-paragraph historian's retrospective and highlight the defining turning point of the age.`,
    ].join('\n');

    try {
      const result = await callGeminiWithRetry(async (ai) => {
        const response = await ai.models.generateContent({
          model: MODEL_ID,
          contents: prompt,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                epochTitle: { type: Type.STRING },
                summary: { type: Type.STRING },
                turningPoint: { type: Type.STRING },
              },
              required: ['epochTitle', 'summary', 'turningPoint'],
            },
          },
        });
        return JSON.parse(response.text || '{}');
      });

      res.json({ ok: true, chronicle: result });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Chronicle synthesis failed';
      res.status(502).json({ ok: false, error: msg });
    }
  });

  if (process.env.NODE_ENV !== 'production') {
    app.get('/@vite/client', (_req: Request, res: Response) => {
      res.type('application/javascript');
      res.send(`
const sheetsMap = new Map();
if (typeof document !== 'undefined') {
  document.querySelectorAll('style[data-vite-dev-id]').forEach((el) => {
    sheetsMap.set(el.getAttribute('data-vite-dev-id'), el);
  });
}
export function updateStyle(id, content) {
  if (typeof document === 'undefined') return;
  let style = sheetsMap.get(id);
  if (!style) {
    style = document.createElement('style');
    style.setAttribute('type', 'text/css');
    style.setAttribute('data-vite-dev-id', id);
    style.textContent = content;
    document.head.appendChild(style);
  } else if (style.textContent !== content) {
    style.textContent = content;
  }
  sheetsMap.set(id, style);
}
export function removeStyle(id) {
  const style = sheetsMap.get(id);
  if (style && style.parentNode) {
    style.parentNode.removeChild(style);
    sheetsMap.delete(id);
  }
}
export function createHotContext() {
  const noop = () => {};
  return {
    data: {},
    accept: noop,
    acceptExports: noop,
    dispose: noop,
    prune: noop,
    invalidate: noop,
    decline: noop,
    on: noop,
    off: noop,
    send: noop,
  };
}
export function injectQuery(url, queryToInject) {
  if (!url || (url[0] !== '.' && url[0] !== '/')) return url;
  const pathname = url.replace(/[?#].*$/, '');
  const { search, hash } = new URL(url, 'http://vite.dev');
  return pathname + '?' + queryToInject + (search ? '&' + search.slice(1) : '') + (hash || '');
}
export class ErrorOverlay extends HTMLElement {}
`);
    });

    let viteMiddleware: RequestHandler | null = null;
    const viteReady = (async () => {
      const { createServer: createViteServer } = await import('vite');
      const vite = await createViteServer({
        server: {
          middlewareMode: true,
          hmr: false,
          ws: false,
        },
        appType: 'spa',
      });
      viteMiddleware = vite.middlewares;
      return vite.middlewares;
    })();

    viteReady.catch((err) => {
      console.error('Vite dev middleware initialization failed:', err);
    });

    app.use(async (req: Request, res: Response, next: NextFunction) => {
      try {
        const mw = viteMiddleware || (await viteReady);
        mw(req, res, next);
      } catch (err) {
        next(err);
      }
    });
  } else {
    const distDir = path.resolve(__dirname, 'dist');
    if (fs.existsSync(distDir)) {
      app.use(express.static(distDir));
      app.get('/{*path}', (_req: Request, res: Response) => {
        res.sendFile(path.join(distDir, 'index.html'));
      });
    }
  }

  app.listen(PORT, HOST, () => {
    console.log(`RealmSmith server listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Failed to start RealmSmith server:', err);
  process.exit(1);
});
