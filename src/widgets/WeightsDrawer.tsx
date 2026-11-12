import { useEffect, useRef, useState } from "react";
import { getWeights, decodeGrid, type MatrixView, type Weights } from "../api/client";

const GW = 160;
const GH = 160;

function Grid({ g, label, theme }: { g: MatrixView["grid"]; label: string; theme: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    const { values, w, h, mn, mx } = decodeGrid(g);
    const cw = GW / w;
    const ch = GH / h;
    const span = mx - mn || 1;
    const peak = Math.max(Math.abs(mn), Math.abs(mx)) || 1;
    const negRgb = theme === "light" ? "3, 105, 161" : "34, 211, 238";
    const posRgb = theme === "light" ? "180, 83, 9" : "245, 158, 11";

    ctx.clearRect(0, 0, GW, GH);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const v = (values[y * w + x] / 255) * span + mn;
        const t = Math.min(1, Math.abs(v) / peak);
        ctx.fillStyle =
          v < 0
            ? `rgba(${negRgb}, ${0.12 + t * 0.88})`
            : `rgba(${posRgb}, ${0.12 + t * 0.88})`;
        ctx.fillRect(x * cw, y * ch, Math.ceil(cw), Math.ceil(ch));
      }
    }
  }, [g, theme]);

  return (
    <div className="wm">
      <canvas ref={ref} width={GW} height={GH} className="wm-canvas" />
      <span className="wm-label">{label}</span>
      <span className="wm-range">
        [{g.mn.toFixed(3)}, {g.mx.toFixed(3)}]
      </span>
    </div>
  );
}

export type DrawerTarget = { kind: "layer"; i: number } | { kind: "emb" } | null;

export default function WeightsDrawer({
  weights,
  target,
  theme = "dark",
  close,
}: {
  weights: Weights | null;
  target: DrawerTarget;
  theme?: string;
  close: () => void;
}) {
  const [loaded, setLoaded] = useState(weights);

  useEffect(() => {
    if (weights) {
      setLoaded(weights);
    } else {
      getWeights().then(setLoaded).catch(() => setLoaded(null));
    }
  }, [weights]);

  useEffect(() => {
    if (!target) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [target, close]);

  if (!target) return null;

  const layer = target.kind === "layer" ? loaded?.layers[target.i] : null;
  const title =
    target.kind === "layer" ? `Layer ${target.i} Weight Matrices` : "Token Embedding Table";

  return (
    <div
      className="drawer"
      data-testid="weights-drawer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={close}
    >
      <div className="drawer-body panel" onClick={(e) => e.stopPropagation()}>
        <div className="drawer-header">
          <div>
            <h2 className="drawer-title">{title}</h2>
            {loaded && (
              <span className="drawer-sub">
                Tied output weights: {loaded.tie_weights ? "Yes (W_out = W_embᵀ)" : "No"}
              </span>
            )}
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
            <div className="scale-legend" aria-hidden="true">
              <span>−</span>
              <span className="scale-bar" />
              <span>+</span>
            </div>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={close}
              data-testid="drawer-close"
              aria-label="Close weights inspector"
            >
              ✕ Close
            </button>
          </div>
        </div>

        {!loaded && <span className="dim">Loading weight matrices…</span>}

        {layer && (
          <div className="wm-grid">
            {layer.matrices.map((m) => (
              <Grid
                key={m.name}
                g={m.grid}
                theme={theme}
                label={`${m.name} ${JSON.stringify(m.shape)}`}
              />
            ))}
          </div>
        )}

        {target.kind === "emb" && loaded && (
          <div className="wm-grid">
            <Grid
              g={loaded.embedding.grid}
              theme={theme}
              label={`${loaded.embedding.name} ${JSON.stringify(loaded.embedding.shape)}`}
            />
          </div>
        )}
      </div>
    </div>
  );
}
