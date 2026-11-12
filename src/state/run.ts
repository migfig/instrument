// The run store: the event queue is the source of truth; timers only pace
// the reveal (a throttled tab loses nothing). State machine:
// idle -> running (POST in flight, queue filling) -> replaying (queue
// draining) -> finished (only when the queue empties).
import { useSyncExternalStore } from "react";
import { postGenerate, type ExplainEvent, type GenerateParams, type LayerTap } from "../api/client";

export type Phase = "idle" | "running" | "replaying" | "finished";
export type Speed = 0.5 | 1 | 2;

export interface RunState {
  phase: Phase;
  speed: Speed;
  error: string | null;
  prompt: string;
  maxTokens: number;
  promptTokens: string[];
  promptTokenIds: number[];
  prefilled: number;
  generated: { token: string; index: number }[];
  step: number;
  layers: LayerTap[] | null;
  embed: { len: number; mn: number; mx: number; data: string } | null;
  chosen: {
    id: number;
    text: string;
    top: [number, string, number][];
    cut: { k: number; p: number | null };
    params: { T: number; k: number; p: number };
  } | null;
  kv: { bytes: number; n: number } | null;
  nTokens: number;
  tokensPerS: number | null;
  done: boolean;
  paused: boolean;
  bpe: { text: string; merges: number[][] | null; index: number } | null;
  vectors: VecNode[];
  flow: FlowState | null;
  vsOn: boolean;
  layerSel: number | null;
}

export interface VecNode { text: string; x: number; y: number; kind: "prompt" | "gen" }
export interface FlowState {
  layers: { i: number; attn: { len: number; data: string } | null; res: number }[];
  kvN: number;
  cur: number;
}

export const VS_SEED = 0x5eed5eed;
const VS_W: number[] = (() => {
  let s = VS_SEED;
  const lcg = () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296 - 0.5; };
  return Array.from({ length: 128 }, lcg);
})();

export function projectEmbed(g: { len: number; mn: number; mx: number; data: string }): { x: number; y: number } {
  const raw = Uint8Array.from(atob(g.data), c => c.charCodeAt(0));
  let x = 0, y = 0;
  for (let d = 0; d < g.len; d++) {
    const v = (raw[d] - g.mn) / Math.max(1, g.mx - g.mn);
    x += (v - 0.5) * VS_W[d * 2];
    y += (v - 0.5) * VS_W[d * 2 + 1];
  }
  return { x, y };
}

const PREFILL_MS = 120;
const GROUP_MS = 1400;

function encodeBytesBase64(bytes: number[]): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  return btoa(bin);
}

function makeSimulatedEmbed(seed: number, len = 64) {
  const bytes: number[] = [];
  for (let i = 0; i < len; i++) {
    const v = 0.5 + 0.34 * Math.sin(i * 0.36 + seed * 0.7) * Math.cos(i * 0.14 - seed * 0.2);
    bytes.push(Math.max(0, Math.min(255, Math.round(v * 255))));
  }
  return { len, mn: -1.482, mx: 1.546, data: encodeBytesBase64(bytes) };
}

function makeSimulatedAttn(nPast: number, seed: number) {
  const weights: number[] = [];
  let sum = 0;
  for (let i = 0; i < nPast; i++) {
    const w = (i === 0 ? 0.9 : 0.15) + Math.exp((i - nPast + 1) * 0.42) + ((seed + i * 7) % 5) * 0.08;
    weights.push(w);
    sum += w;
  }
  const bytes = weights.map(w => Math.max(0, Math.min(255, Math.round((w / sum) * 255))));
  return { len: nPast, data: encodeBytesBase64(bytes) };
}

function buildBaselineSnapshot(): RunState {
  const promptTokens = ["The", " capital", " of", " France", " is"];
  const promptTokenIds = [464, 3139, 286, 4881, 318];
  const genTokens = [
    { token: " Paris", index: 0 },
    { token: ",", index: 1 },
    { token: " a", index: 2 },
    { token: " historic", index: 3 },
    { token: " metropolis", index: 4 },
    { token: " along", index: 5 },
    { token: " the", index: 6 },
    { token: " Seine", index: 7 },
  ];
  const totalPositions = promptTokens.length + genTokens.length - 1;
  const embeds = Array.from({ length: totalPositions }, (_, idx) => makeSimulatedEmbed(idx + 3));
  const vectors: VecNode[] = [
    ...promptTokens.map((text, idx) => {
      const p = projectEmbed(embeds[idx]);
      return { text, x: p.x, y: p.y, kind: "prompt" as const };
    }),
    ...genTokens.slice(0, -1).map((g, idx) => {
      const p = projectEmbed(embeds[promptTokens.length + idx]);
      return { text: g.token, x: p.x, y: p.y, kind: "gen" as const };
    }),
  ];
  const layers: LayerTap[] = Array.from({ length: 6 }, (_, i) => ({
    i,
    attn: makeSimulatedAttn(totalPositions - 1, i * 13 + 5),
    res: Number((1.12 + i * 0.36 + (i % 2 === 0 ? 0.14 : 0.05)).toFixed(3)),
  }));
  const top: [number, string, number][] = [
    [19422, " Seine", 0.542],
    [13180, " river", 0.148],
    [11839, " banks", 0.084],
    [6340, " heart", 0.053],
    [4182, " Eiffel", 0.041],
    [3520, " Louvre", 0.031],
    [2911, " city", 0.024],
    [1840, " famous", 0],
    [1402, " ancient", 0],
    [1120, " northern", 0],
    [980, " grand", 0],
    [714, " cultural", 0],
  ];

  return {
    phase: "finished",
    speed: 1,
    error: null,
    prompt: "The capital of France is",
    maxTokens: 16,
    promptTokens,
    promptTokenIds,
    prefilled: promptTokens.length,
    generated: genTokens,
    step: genTokens.length - 1,
    layers,
    embed: embeds[embeds.length - 1],
    chosen: {
      id: 19422,
      text: " Seine",
      top,
      cut: { k: 7, p: 0.923 },
      params: { T: 1, k: 40, p: 0.9 },
    },
    kv: { bytes: 6291456, n: promptTokens.length + genTokens.length - 1 },
    nTokens: genTokens.length,
    tokensPerS: 48.6,
    done: true,
    paused: false,
    bpe: {
      text: " France",
      merges: [
        [32, 70],
        [256, 114],
        [257, 97],
        [258, 110],
        [259, 99],
        [260, 101],
      ],
      index: 3,
    },
    vectors,
    flow: {
      layers,
      kvN: totalPositions,
      cur: vectors.length - 1,
    },
    vsOn: false,
    layerSel: null,
  };
}

const emptyState: RunState = {
  phase: "idle",
  speed: 1,
  error: null,
  prompt: "The capital of France is",
  maxTokens: 16,
  promptTokens: [],
  promptTokenIds: [],
  prefilled: 0,
  generated: [],
  step: -1,
  layers: null,
  embed: null,
  chosen: null,
  kv: null,
  nTokens: 0,
  tokensPerS: null,
  done: false,
  paused: false,
  bpe: null,
  vectors: [],
  flow: null,
  vsOn: false,
  layerSel: null,
};

class RunStore {
  state: RunState = buildBaselineSnapshot();
  private queue: ExplainEvent[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;
  private abortCtl: AbortController | null = null;
  private postDone = false;
  private revealed = 0;
  private stepAt = 0;
  private pausedAt = 0;
  private paused = false;

  subscribe = (fn: () => void) => {
    this.listeners.add(fn);
    return () => { this.listeners.delete(fn); };
  };
  get = () => this.state;

  private set(patch: Partial<RunState>) {
    this.state = { ...this.state, ...patch };
    for (const fn of this.listeners) fn();
  }

  start(params: Omit<GenerateParams, "stream" | "debug">) {
    this.hardReset();
    this.aborted = false;
    this.abortCtl = new AbortController();
    this.set({ phase: "running", prompt: params.prompt, maxTokens: params.max_tokens });
    postGenerate(
      params,
      (ev) => {
        this.queue.push(ev);
        this.schedule();
      },
      this.abortCtl.signal,
    )
      .then(() => {
        this.postDone = true;
        this.schedule();
      })
      .catch((e) => {
        if (this.aborted) return;
        this.stopTimers();
        this.set({ phase: "idle", error: String(e) });
      });
  }

  private schedule() {
    this.stopTimers();
    if (this.paused) return;
    if (this.revealed >= this.queue.length) {
      if (this.postDone) return this.finish();
      this.timer = setTimeout(() => this.schedule(), 50);
      return;
    }
    const ev = this.queue[this.revealed];
    const sp = this.state.speed;
    let delay = 0;
    if (ev.type === "prefill") {
      delay = this.revealed === 0 ? 0 : PREFILL_MS / sp;
    } else if (ev.type === "step") {
      this.stepAt = performance.now();
    } else if (ev.type === "nucleus") {
      delay = Math.max(0, (0.45 * GROUP_MS) / sp - (performance.now() - this.stepAt));
    } else if (ev.type === "token") {
      delay = Math.max(0, (0.85 * GROUP_MS) / sp - (performance.now() - this.stepAt));
    }
    this.timer = setTimeout(() => {
      this.revealed++;
      this.apply(ev);
      this.schedule();
    }, delay);
  }

  private apply(ev: ExplainEvent) {
    const s = this.state;
    if (ev.type === "prefill") {
      const tokens = ev.tokens ?? s.promptTokens;
      const p = projectEmbed(ev.embed);
      this.set({
        promptTokens: tokens,
        promptTokenIds: ev.token_ids ?? s.promptTokenIds,
        prefilled: s.prefilled + 1,
        embed: ev.embed,
        kv: ev.kv,
        bpe: { text: tokens[ev.index] ?? "?", merges: ev.merges ?? null, index: ev.index },
        vectors: [...s.vectors, { text: tokens[ev.index] ?? "?", x: p.x, y: p.y, kind: "prompt" }],
      });
    } else if (ev.type === "step") {
      let vectors = s.vectors;
      if (ev.step >= 1) {
        const text = s.generated[s.generated.length - 1]?.token ?? "?";
        const p = projectEmbed(ev.embed);
        vectors = [...vectors, { text, x: p.x, y: p.y, kind: "gen" }];
      }
      this.set({
        layers: ev.layers,
        embed: ev.embed,
        kv: ev.kv,
        step: ev.step,
        phase: "replaying",
        vectors,
        flow: { layers: ev.layers, kvN: ev.kv.n, cur: vectors.length - 1 },
      });
    } else if (ev.type === "nucleus") {
      this.set({
        chosen: { id: ev.chosen, text: "", top: ev.top, cut: ev.cut, params: ev.params },
      });
    } else if (ev.type === "token") {
      this.set({
        generated: [...s.generated, { token: ev.token, index: ev.index }],
        chosen: s.chosen ? { ...s.chosen, text: ev.token } : s.chosen,
      });
    } else if (ev.type === "done") {
      this.set({ nTokens: ev.n_tokens, tokensPerS: ev.tokens_per_s, done: true });
    }
    if (this.revealed >= this.queue.length && this.postDone) this.finish();
  }

  private finish() {
    this.stopTimers();
    this.set({ phase: "finished" });
  }

  pause() {
    if (this.paused) return;
    this.paused = true;
    this.pausedAt = performance.now();
    this.stopTimers();
    this.set({ paused: true });
  }

  resume() {
    if (!this.paused) return;
    this.paused = false;
    this.stepAt += performance.now() - this.pausedAt;
    this.set({ paused: false });
    this.schedule();
  }

  setSpeed(sp: Speed) { this.set({ speed: sp }); }
  toggleVs() { this.set({ vsOn: !this.state.vsOn }); }
  setLayerSel(i: number | null) { this.set({ layerSel: i }); }
  setPrompt(p: string) {
    if (this.state.phase === "idle" || this.state.phase === "finished") this.set({ prompt: p });
  }
  setMaxTokens(n: number) {
    if (this.state.phase === "idle" || this.state.phase === "finished") this.set({ maxTokens: n });
  }
  reset() {
    this.aborted = true;
    this.abortCtl?.abort();
    this.hardReset();
  }

  private hardReset() {
    this.aborted = true;
    this.abortCtl?.abort();
    this.stopTimers();
    this.paused = false;
    this.pausedAt = 0;
    this.queue = [];
    this.revealed = 0;
    this.postDone = false;
    this.set({
      ...emptyState,
      prompt: this.state.prompt,
      maxTokens: this.state.maxTokens,
      speed: this.state.speed,
      vsOn: this.state.vsOn,
    });
  }

  private stopTimers() {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
  }
}

export const runStore = new RunStore();
export function useRun(): RunState {
  return useSyncExternalStore(runStore.subscribe, runStore.get);
}