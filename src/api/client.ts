// fetch-based SSE client (EventSource cannot POST — research R10).
// Typed per contracts/explain-stream.md + contracts/generate-debug.md.

export interface EmbedGrid { len: number; mn: number; mx: number; data: string }
export interface KvInfo { bytes: number; n: number }
export interface PrefillEvent {
  type: "prefill"; index: number; embed: EmbedGrid; kv: KvInfo;
  tokens?: string[]; token_ids?: number[]; seq: number;
  /** R6: per-token BPE build history; omitted for single-byte tokens */
  merges?: number[][];
}
/** Attention tap row: a probability row 0..1 at a fixed u = p*255 scale
 * (no mn/mx — see serve/explain.py enc_prob_row). */
export interface AttnRow { len: number; data: string }
export function decodeAttn(a: AttnRow): number[] {
  return Array.from(Uint8Array.from(atob(a.data), c => c.charCodeAt(0)));
}
export interface LayerTap { i: number; attn: AttnRow | null; res: number }
export interface StepEvent {
  type: "step"; step: number; layers: LayerTap[]; embed: EmbedGrid;
  kv: KvInfo; seq: number;
}
export interface NucleusEvent {
  type: "nucleus"; top: [number, string, number][];
  cut: { k: number; p: number | null };
  chosen: number; params: { T: number; k: number; p: number }; seq: number;
}
export interface TokenEvent { type: "token"; token: string; index: number; seq: number }
export interface DoneEvent { type: "done"; done: true; n_tokens: number; tokens_per_s: number; seq: number }
export type ExplainEvent = PrefillEvent | StepEvent | NucleusEvent | TokenEvent | DoneEvent;

export interface GenerateParams {
  prompt: string; max_tokens: number; temperature: number;
  top_k: number; top_p: number; stream?: boolean; debug?: boolean;
}

export interface ModelFacts {
  name: string; variant: "capstone" | "gpt2"; n_layers: number; dim: number;
  n_heads: number; n_kv_heads: number; d_head: number; mlp_dim: number;
  vocab_size: number; tie_weights: boolean; n_params: number;
}
export interface MatrixView {
  name: string; shape: number | number[]; grid: { w: number; h: number; mn: number; mx: number; data: string };
}
export interface Weights {
  tie_weights: boolean;
  embedding: { name: string; shape: number[]; grid: { w: number; h: number; mn: number; mx: number; data: string } };
  layers: { i: number; matrices: MatrixView[] }[];
}

/** POST /generate and parse `data:` lines as they arrive. onEvent fires in
 * wire order; resolves when the [DONE] sentinel is read. */
export async function postGenerate(
  params: GenerateParams, onEvent: (ev: ExplainEvent) => void,
  signal?: AbortSignal): Promise<void> {
  const res = await fetch("/generate", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...params, stream: true, debug: true }),
    signal,
  });
  if (!res.ok || !res.body) {
    throw new Error(`/generate ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const reader = res.body.getReader();
  const dec = new TextDecoder();
  let buf = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += dec.decode(value, { stream: true });
    let nl: number;
    while ((nl = buf.indexOf("\n")) >= 0) {
      const line = buf.slice(0, nl);
      buf = buf.slice(nl + 1);
      if (!line.startsWith("data:")) continue;
      const payload = line.slice(5).trim();
      if (payload === "[DONE]") return;
      const ev = JSON.parse(payload) as Record<string, unknown>;
      // the wire has no `type` on nucleus/token events (contract); tag them
      // for the discriminated union the store switches on
      if ("top" in ev) ev.type = "nucleus";
      else if ("token" in ev) ev.type = "token";
      else if ("done" in ev) ev.type = "done";
      onEvent(ev as unknown as ExplainEvent);
    }
  }
}

export async function getModelFacts(): Promise<ModelFacts> {
  const r = await fetch("/explain/model");
  if (!r.ok) throw new Error(`/explain/model ${r.status}`);
  return r.json();
}

export async function getWeights(): Promise<Weights> {
  const r = await fetch("/explain/weights");
  if (!r.ok) throw new Error(`/explain/weights ${r.status}`);
  return r.json();
}

export type GridData = { mn: number; mx: number; data: string } &
  ({ len: number } | { w: number; h: number });

export function decodeGrid(g: GridData): {
  values: number[]; w: number; h: number; mn: number; mx: number;
} {
  const raw = Uint8Array.from(atob(g.data), c => c.charCodeAt(0));
  const w = "w" in g ? g.w : (g as { len: number }).len;
  const h = "h" in g ? g.h : 1;
  return { values: Array.from(raw), w, h, mn: g.mn, mx: g.mx };
}
