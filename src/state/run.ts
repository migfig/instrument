// The run store: the event queue is the source of truth; timers only pace
// the reveal (research R10 — a throttled tab loses nothing). State machine:
// idle -> running (POST in flight, queue filling) -> replaying (queue
// draining) -> finished (only when the queue empties, FR-009).
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
  prefilled: number;            // prompt tokens revealed so far
  generated: { token: string; index: number }[];
  step: number;                 // last revealed token-group index
  layers: LayerTap[] | null;
  embed: { len: number; mn: number; mx: number; data: string } | null;
  chosen: { id: number; text: string; top: [number, string, number][]; cut: { k: number; p: number | null }; params: { T: number; k: number; p: number } } | null;
  kv: { bytes: number; n: number } | null;
  nTokens: number;
  tokensPerS: number | null;
  done: boolean;
  paused: boolean;
  // US5: token deep-dive state
  bpe: { text: string; merges: number[][] | null; index: number } | null;
  vectors: VecNode[];
  flow: FlowState | null;
  vsOn: boolean;
  layerSel: number | null;   // VectorSpace layer; null = last layer
}

export interface VecNode { text: string; x: number; y: number; kind: "prompt" | "gen" }
export interface FlowState {
  layers: { i: number; attn: { len: number; data: string } | null; res: number }[];
  kvN: number;               // cache length incl. the current position
  cur: number;               // index of the current token in vectors
}

// Fixed, seeded 64->2 linear projection for the VectorSpace (research R8,
// display-only: the truth is the real embed, the projection is fixed).
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

const PREFILL_MS = 120;      // per prompt token at 1x
const GROUP_MS = 1400;       // per token group at 1x (step 0%, nucleus 45%, token 85%)

const initial: RunState = {
  phase: "idle", speed: 1, error: null,
  prompt: "The capital of France is", maxTokens: 128,
  promptTokens: [], promptTokenIds: [], prefilled: 0,
  generated: [], step: -1, layers: null, embed: null, chosen: null,
  kv: null, nTokens: 0, tokensPerS: null, done: false, paused: false,
  bpe: null, vectors: [], flow: null, vsOn: false, layerSel: null,
};

class RunStore {
  state: RunState = { ...initial };
  private queue: ExplainEvent[] = [];
  private listeners = new Set<() => void>();
  private timer: ReturnType<typeof setTimeout> | null = null;
  private aborted = false;
  private abortCtl: AbortController | null = null;
  private postDone = false;
  private revealed = 0;        // queue position next to reveal
  private stepAt = 0;         // when the current group's step was revealed
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
    postGenerate(params, (ev) => {
      this.queue.push(ev);
      this.schedule();
    }, this.abortCtl.signal)
      .then(() => { this.postDone = true; this.schedule(); })
      .catch((e) => {
        if (this.aborted) return;
        this.stopTimers();
        this.set({ phase: "idle", error: String(e) });
      });
  }

  // ---- reveal loop: never reveal ahead of the wire; pace the rest --------
  private schedule() {
    this.stopTimers();
    if (this.paused) return;
    if (this.revealed >= this.queue.length) {
      if (this.postDone) return this.finish();
      this.timer = setTimeout(() => this.schedule(), 50); // wait for the wire
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
      delay = Math.max(0, 0.45 * GROUP_MS / sp - (performance.now() - this.stepAt));
    } else if (ev.type === "token") {
      delay = Math.max(0, 0.85 * GROUP_MS / sp - (performance.now() - this.stepAt));
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
        embed: ev.embed, kv: ev.kv,
        bpe: { text: tokens[ev.index] ?? "?", merges: ev.merges ?? null,
               index: ev.index },
        vectors: [...s.vectors, { text: tokens[ev.index] ?? "?", x: p.x,
                                  y: p.y, kind: "prompt" }],
      });
    } else if (ev.type === "step") {
      // The step's embed is the CURRENT input token's representation. Step 0
      // re-sends the last prompt token (already a node); step i >= 1 sends
      // generated token i-1, which gets its node here. The final generated
      // token is never an input, so it has no node (no data, never invented).
      let vectors = s.vectors;
      if (ev.step >= 1) {
        const text = s.generated[s.generated.length - 1]?.token ?? "?";
        const p = projectEmbed(ev.embed);
        vectors = [...vectors, { text, x: p.x, y: p.y, kind: "gen" }];
      }
      this.set({
        layers: ev.layers, embed: ev.embed, kv: ev.kv, step: ev.step,
        phase: "replaying", vectors,
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

  // ---- controls (US3): pause freezes timers only — the queue keeps
  // filling off the wire; resume continues from the same queue position.
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
    this.stepAt += performance.now() - this.pausedAt; // freeze the pace too
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
    this.aborted = true;          // aborts the in-flight POST
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
      ...initial, prompt: this.state.prompt, maxTokens: this.state.maxTokens,
      speed: this.state.speed,
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