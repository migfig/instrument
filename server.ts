import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import type { Request, Response } from "express";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT) || 3000;
const HOST = "0.0.0.0";

// 6-layer GQA transformer configuration for rich multi-layer inspection
const MODEL_FACTS = {
  name: "instrument-6l-gqa",
  variant: "capstone" as const,
  n_layers: 6,
  dim: 256,
  n_heads: 8,
  n_kv_heads: 4,
  d_head: 32,
  mlp_dim: 768,
  vocab_size: 50257,
  tie_weights: true,
  n_params: 24800000,
};

const MAX_MODEL_LEN = 1024;
const KV_CACHE_BYTES =
  2 * MODEL_FACTS.n_layers * MODEL_FACTS.n_kv_heads * MODEL_FACTS.d_head * MAX_MODEL_LEN * 2;

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h;
}

function makeGrid(w: number, h: number, seed: number, mn = -0.18, mx = 0.18) {
  const rng = mulberry32(seed);
  const bytes = new Uint8Array(w * h);
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const diag = x === y ? 0.12 : 0;
      const wave = Math.sin((x + 1) * 0.31 + seed) * Math.cos((y + 1) * 0.27 + seed * 0.4);
      const val = 0.5 + 0.24 * wave + diag + (rng() - 0.5) * 0.42;
      bytes[y * w + x] = Math.max(0, Math.min(255, Math.round(val * 255)));
    }
  }
  return {
    w,
    h,
    mn,
    mx,
    data: Buffer.from(bytes).toString("base64"),
  };
}

const WEIGHTS_PAYLOAD = {
  tie_weights: MODEL_FACTS.tie_weights,
  embedding: {
    name: "tok_emb.weight",
    shape: [MODEL_FACTS.vocab_size, MODEL_FACTS.dim],
    grid: makeGrid(48, 48, 101, -0.22, 0.22),
  },
  layers: Array.from({ length: MODEL_FACTS.n_layers }, (_, i) => ({
    i,
    matrices: [
      { name: `layers.${i}.attn.wq`, shape: [256, 256], grid: makeGrid(32, 32, 200 + i * 10 + 1) },
      { name: `layers.${i}.attn.wk`, shape: [128, 256], grid: makeGrid(32, 32, 200 + i * 10 + 2) },
      { name: `layers.${i}.attn.wv`, shape: [128, 256], grid: makeGrid(32, 32, 200 + i * 10 + 3) },
      { name: `layers.${i}.attn.wo`, shape: [256, 256], grid: makeGrid(32, 32, 200 + i * 10 + 4) },
      { name: `layers.${i}.mlp.w1`, shape: [768, 256], grid: makeGrid(32, 32, 200 + i * 10 + 5) },
      { name: `layers.${i}.mlp.w2`, shape: [256, 768], grid: makeGrid(32, 32, 200 + i * 10 + 6) },
    ],
  })),
};

function tokenizePrompt(prompt: string): { tokens: string[]; ids: number[]; merges: (number[][] | undefined)[] } {
  const raw = prompt.length > 0 ? prompt : " ";
  const parts = raw.match(/ ?[A-Za-z]+| ?[0-9]+| ?[^\sA-Za-z0-9]+|\s+/g) ?? [raw];
  const tokens: string[] = [];
  const ids: number[] = [];
  const merges: (number[][] | undefined)[] = [];

  for (const part of parts) {
    tokens.push(part);
    const id = 256 + (hashStr(part) % (MODEL_FACTS.vocab_size - 256));
    ids.push(id);
    const utf8 = Buffer.from(part, "utf8");
    if (utf8.length >= 2) {
      const m: number[][] = [[utf8[0], utf8[1]]];
      for (let k = 2; k < utf8.length; k++) {
        m.push([256 + k - 2, utf8[k]]);
      }
      merges.push(m);
    } else {
      merges.push(undefined);
    }
  }
  return { tokens, ids, merges };
}

function encodeEmbed(seed: number, len = 64) {
  const rng = mulberry32(seed);
  const mn = -1.6 + (rng() - 0.5) * 0.4;
  const mx = 1.6 + (rng() - 0.5) * 0.4;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    const v = 0.5 + 0.34 * Math.sin(i * 0.38 + seed * 0.01) * Math.cos(i * 0.13) + (rng() - 0.5) * 0.32;
    bytes[i] = Math.max(0, Math.min(255, Math.round(v * 255)));
  }
  return {
    len,
    mn: Number(mn.toFixed(4)),
    mx: Number(mx.toFixed(4)),
    data: Buffer.from(bytes).toString("base64"),
  };
}

function encodeAttnRow(nPast: number, seed: number) {
  const len = Math.max(1, Math.min(64, nPast));
  const rng = mulberry32(seed);
  const weights = new Float64Array(len);
  let sum = 0;
  for (let i = 0; i < len; i++) {
    const sink = i === 0 ? 1.35 : 0;
    const recency = Math.exp((i - len + 1) * 0.38);
    const w = 0.06 + sink * 0.35 + recency + rng() * 0.45;
    weights[i] = w;
    sum += w;
  }
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = Math.max(0, Math.min(255, Math.round((weights[i] / sum) * 255)));
  }
  return {
    len,
    data: Buffer.from(bytes).toString("base64"),
  };
}

const TOPIC_STREAMS: { match: RegExp; seq: string[]; pool: string[] }[] = [
  {
    match: /france|paris|capital/i,
    seq: [
      " Paris", ",", " a", " historic", " metropolis", " along", " the", " Seine",
      " known", " for", " art", ",", " architecture", ",", " and", " scientific",
      " inquiry", ".", " Its", " iconic", " landmarks", " span", " centuries", ".",
    ],
    pool: [
      " Paris", " Lyon", " Marseille", " Bordeaux", " Europe", " France", ",", ".",
      " the", " a", " city", " capital", " center", " river", " Seine", " known",
      " famous", " for", " art", " culture", " history", " architecture", " light", " in",
    ],
  },
  {
    match: /def |fibonacci|python|code|function/i,
    seq: [
      "\n", "   ", " if", " n", " <=", " 1", ":", "\n", "       ", " return", " n",
      "\n", "   ", " a", ",", " b", " =", " 0", ",", " 1", "\n", "   ", " for", " _",
    ],
    pool: [
      "\n", "   ", "       ", " if", " return", " n", " a", " b", " for", " while",
      " in", " range", "(", ")", ":", " =", " +=", " 0", " 1", " <=", " else", " elif",
      " yield", " memo",
    ],
  },
  {
    match: /attention|transformer|neural|token|model/i,
    seq: [
      " weights", " each", " prior", " token", " by", " query", "-", "key",
      " similarity", ",", " routing", " contextual", " features", " across", " residual",
      " streams", " before", " projecting", " into", " vocabulary", " logits", ".",
    ],
    pool: [
      " weights", " computes", " routes", " attention", " token", " tokens", " query",
      " key", " value", " matrix", " softmax", " layer", " residual", " norm", " MLP",
      " logits", " across", " context", " vectors", " projection", ",", ".", " by", " for",
    ],
  },
];

const DEFAULT_STREAM = [
  " emerges", " from", " structured", " patterns", " across", " layers", ",",
  " balancing", " local", " syntax", " with", " long", "-", "range", " context",
  " through", " calibrated", " probability", " distributions", ".",
];

const DEFAULT_POOL = [
  " the", " a", " of", " to", " in", " and", " is", " that", " with", " for",
  " context", " structure", " signal", " across", " layers", " model", " token",
  " system", " distribution", " state", " through", ",", ".", "—",
];

function buildCandidates(
  prompt: string,
  contextText: string,
  step: number,
  temp: number,
  topK: number,
  topP: number,
) {
  const topic = TOPIC_STREAMS.find((t) => t.match.test(prompt));
  const seq = topic ? topic.seq : DEFAULT_STREAM;
  const bank = topic ? topic.pool : DEFAULT_POOL;

  const preferred = seq[step % seq.length];
  const pool = new Set<string>([preferred]);
  const seed = hashStr(contextText + ":" + step);
  const rng = mulberry32(seed);
  let idxGuard = 0;
  while (pool.size < 24 && idxGuard < 200) {
    idxGuard++;
    const cand = bank[Math.floor(rng() * bank.length)];
    pool.add(cand);
  }
  while (pool.size < 24) {
    pool.add(DEFAULT_POOL[pool.size % DEFAULT_POOL.length] + String(pool.size));
  }

  const raw = Array.from(pool).map((text, idx) => {
    const id = 256 + (hashStr(text) % (MODEL_FACTS.vocab_size - 256));
    const baseLogit = idx === 0 ? 5.1 : 3.3 - idx * 0.21 + (rng() - 0.5) * 0.7;
    return { id, text, logit: baseLogit / Math.max(0.01, temp) };
  });

  const maxLogit = Math.max(...raw.map((r) => r.logit));
  const exps = raw.map((r) => Math.exp(r.logit - maxLogit));
  const expSum = exps.reduce((a, b) => a + b, 0);
  const probs = raw
    .map((r, i) => ({ id: r.id, text: r.text, prob: exps[i] / expSum }))
    .sort((a, b) => b.prob - a.prob);

  const kLimit = Math.max(1, Math.min(probs.length, topK));
  let cum = 0;
  let keptCount = 0;
  let cutP: number | null = null;
  for (let i = 0; i < kLimit; i++) {
    cum += probs[i].prob;
    keptCount++;
    if (cum >= topP) {
      cutP = Number(cum.toFixed(4));
      break;
    }
  }
  if (cutP === null && keptCount > 0) {
    cutP = Number(cum.toFixed(4));
  }

  const kept = probs.slice(0, keptCount);
  const keptSum = kept.reduce((a, b) => a + b.prob, 0) || 1;
  let u = rng() * keptSum;
  let chosen = kept[0];
  for (const item of kept) {
    u -= item.prob;
    if (u <= 0) {
      chosen = item;
      break;
    }
  }

  const top: [number, string, number][] = probs.map((item, idx) => [
    item.id,
    item.text,
    idx < keptCount ? Number(item.prob.toFixed(4)) : 0,
  ]);

  return {
    top,
    cut: { k: keptCount, p: topP < 1 ? cutP : null },
    chosen,
  };
}

async function startServer() {
  const app = express();
  app.use(express.json());

  app.get("/health", (_req: Request, res: Response) => {
    res.json({ ok: true, model: MODEL_FACTS.name });
  });

  app.get("/explain/model", (_req: Request, res: Response) => {
    res.json(MODEL_FACTS);
  });

  app.get("/explain/weights", (_req: Request, res: Response) => {
    res.json(WEIGHTS_PAYLOAD);
  });

  app.post("/generate", (req: Request, res: Response) => {
    const body = (req.body ?? {}) as Record<string, unknown>;
    const prompt = typeof body.prompt === "string" ? body.prompt : "The capital of France is";
    const maxTokens = Math.max(1, Math.min(2048, Number(body.max_tokens) || 16));
    const temperature = Math.max(0.01, Number(body.temperature) || 1);
    const topK = Math.max(1, Math.round(Number(body.top_k) || 40));
    const topP = Math.max(0.01, Math.min(1, Number(body.top_p) || 0.9));

    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    let closed = false;
    const timers: ReturnType<typeof setTimeout>[] = [];
    res.on("close", () => {
      if (!res.writableEnded) {
        closed = true;
        for (const t of timers) clearTimeout(t);
      }
    });

    const send = (obj: unknown) => {
      if (closed) return;
      res.write(`data: ${JSON.stringify(obj)}\n\n`);
    };

    const { tokens, ids, merges } = tokenizePrompt(prompt);
    const promptLen = tokens.length;
    let seq = 0;

    for (let i = 0; i < promptLen; i++) {
      const ev: Record<string, unknown> = {
        type: "prefill",
        index: i,
        embed: encodeEmbed(hashStr(tokens[i]) + i * 31),
        kv: { bytes: KV_CACHE_BYTES, n: i + 1 },
        seq: seq++,
      };
      if (i === 0) {
        ev.tokens = tokens;
        ev.token_ids = ids;
      }
      if (merges[i]) {
        ev.merges = merges[i];
      }
      send(ev);
    }

    let runningText = prompt;
    const t0 = performance.now();
    let stepIdx = 0;

    const emitNextStep = () => {
      if (closed) return;
      if (stepIdx >= maxTokens) {
        const elapsed = Math.max(0.01, (performance.now() - t0) / 1000);
        send({
          done: true,
          n_tokens: maxTokens,
          tokens_per_s: Number((maxTokens / elapsed).toFixed(2)),
          seq: seq++,
        });
        res.write("data: [DONE]\n\n");
        res.end();
        return;
      }

      const s = stepIdx;
      const kvN = promptLen + s;
      const nPast = Math.max(1, kvN - 1);
      const stepSeed = hashStr(runningText) + s * 97;
      const layers = Array.from({ length: MODEL_FACTS.n_layers }, (_, li) => {
        const rng = mulberry32(stepSeed + li * 17);
        const resVal = Number((1.05 + li * 0.38 + rng() * 0.34).toFixed(3));
        return {
          i: li,
          attn: encodeAttnRow(nPast, stepSeed + li * 53),
          res: resVal,
        };
      });

      send({
        type: "step",
        step: s,
        layers,
        embed: encodeEmbed(stepSeed + 7),
        kv: { bytes: KV_CACHE_BYTES, n: kvN },
        seq: seq++,
      });

      const cand = buildCandidates(prompt, runningText, s, temperature, topK, topP);
      send({
        top: cand.top,
        cut: cand.cut,
        chosen: cand.chosen.id,
        params: { T: temperature, k: topK, p: topP },
        seq: seq++,
      });

      send({
        token: cand.chosen.text,
        index: s,
        seq: seq++,
      });

      runningText += cand.chosen.text;
      stepIdx++;
      const timer = setTimeout(emitNextStep, 16);
      timers.push(timer);
    };

    const firstTimer = setTimeout(emitNextStep, 10);
    timers.push(firstTimer);
  });

  if (process.env.NODE_ENV !== "production") {
    const { createServer } = await import("vite");
    const vite = await createServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(__dirname, "dist");
    app.use(express.static(distDir));
    app.get("/{*splat}", (_req: Request, res: Response) => {
      const indexPath = path.join(distDir, "index.html");
      if (fs.existsSync(indexPath)) {
        res.sendFile(indexPath);
      } else {
        res.status(404).send("Build artifacts not found. Run npm run build first.");
      }
    });
  }

  app.listen(PORT, HOST, () => {
    console.log(`The Instrument listening on http://${HOST}:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error("Failed to start server:", err);
  process.exit(1);
});
