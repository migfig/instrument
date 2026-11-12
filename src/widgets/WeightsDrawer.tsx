// US4 drawer: the real weight matrices of one layer (or the embedding
// table), drawn as heatmaps from the pre-serialized /explain/weights grids.
import { useEffect, useRef, useState } from "react";
import { getWeights, decodeGrid, type MatrixView, type Weights } from "../api/client";

const GW = 96, GH = 96;

function Grid({ g, label }: { g: MatrixView["grid"]; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    const { values, w, h, mn, mx } = decodeGrid(g);
    const cw = GW / w, ch = GH / h;
    const span = mx - mn || 1;
    const peak = Math.max(Math.abs(mn), Math.abs(mx)) || 1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (values[y * w + x] / 255) * span + mn;
        const t = Math.abs(v) / peak;
        ctx.fillStyle = v < 0
          ? `rgba(110,231,255,${0.15 + t * 0.85})`
          : `rgba(255,138,101,${0.15 + t * 0.85})`;
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  }, [g]);
  return (
    <div className="wm">
      <canvas ref={ref} width={GW} height={GH} className="wm-canvas" />
      <span className="dim">{label} · [{g.mn.toFixed(3)}, {g.mx.toFixed(3)}]</span>
    </div>
  );
}

export type DrawerTarget = { kind: "layer"; i: number } | { kind: "emb" } | null;

export default function WeightsDrawer({ weights, target, close }: {
  weights: Weights | null;
  target: DrawerTarget;
  close: () => void;
}) {
  const [loaded, setLoaded] = useState(weights);
  useEffect(() => {
    if (!weights) getWeights().then(setLoaded).catch(() => setLoaded(null));
  }, [weights]);
  if (!target) return null;
  const layer = target.kind === "layer" ? loaded?.layers[target.i] : null;
  const title = target.kind === "layer" ? `layer ${target.i}` : "embedding";
  return (
    <div className="drawer" data-testid="weights-drawer" onClick={close}>
      <div className="drawer-body panel" onClick={(e) => e.stopPropagation()}>
        <div className="row">
          <b>{title} — real weights</b>
          {loaded && (
            <span className="dim">tie_weights: {loaded.tie_weights ? "yes (output = embeddingᵀ)" : "no"}</span>
          )}
          <button onClick={close} data-testid="drawer-close">✕</button>
        </div>
        {!loaded && <span className="dim">loading…</span>}
        {layer && layer.matrices.map((m) => (
          <Grid key={m.name} g={m.grid}
            label={`${m.name} ${JSON.stringify(m.shape)}`} />
        ))}
        {target.kind === "emb" && loaded && (
          <Grid g={loaded.embedding.grid}
            label={`${loaded.embedding.name} ${JSON.stringify(loaded.embedding.shape)}`} />
        )}
      </div>
    </div>
  );
}
