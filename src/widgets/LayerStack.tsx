import { useEffect, useRef } from "react";
import { useRun } from "../state/run";
import { decodeAttn } from "../api/client";

const AW = 128;
const AH = 12;

function LayerColumn({
  i,
  tap,
  prevRes,
  hot,
  theme,
  onClick,
}: {
  i: number;
  tap: { i: number; attn: { len: number; data: string } | null; res: number };
  prevRes: number | null;
  hot: boolean;
  theme: string;
  onClick: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, AW, AH);
    if (!tap.attn) return;
    const values = decodeAttn(tap.attn);
    const cw = AW / Math.max(1, values.length);
    const rgb = theme === "light" ? "3, 105, 161" : "34, 211, 238";
    values.forEach((u, x) => {
      const alpha = Math.min(1, (u / 255) * 0.92 + 0.08);
      ctx.fillStyle = `rgba(${rgb}, ${alpha})`;
      ctx.fillRect(x * cw, 0, Math.ceil(cw), AH);
    });
  }, [tap.attn, theme]);

  const dres = prevRes === null ? tap.res : tap.res - prevRes;
  const resPct = Math.min(100, (tap.res / 4.0) * 100);
  const dPct = Math.min(100, Math.abs(dres) * 160);

  return (
    <button
      type="button"
      className={"col" + (hot ? " hot" : "")}
      title={`Inspect Layer ${i} weights`}
      onClick={() => onClick(i)}
    >
      <div className="col-head">
        <span className="cl">L{i}</span>
        <span className="cap">{tap.res.toFixed(2)}</span>
      </div>
      <div className="attn-strip">
        <canvas ref={ref} width={AW} height={AH} />
      </div>
      <div className="bar-row">
        <span className="bar-lbl">FFN</span>
        <div className="bar ffn">
          <i style={{ width: dPct + "%" }} />
        </div>
      </div>
      <div className="bar-row">
        <span className="bar-lbl">RES</span>
        <div className="bar res">
          <i style={{ width: resPct + "%" }} />
        </div>
      </div>
    </button>
  );
}

export default function LayerStack({
  theme = "dark",
  onLayerClick,
}: {
  theme?: string;
  onLayerClick?: (i: number) => void;
}) {
  const s = useRun();

  return (
    <div className="panel stack-panel" data-testid="layer-stack">
      <div className="panel-head">
        <h2 className="panel-title">Transformer Layer Activations</h2>
        <span className="panel-meta">
          {s.layers ? `${s.layers.length} layers · click layer to inspect weights` : "Idle"}
        </span>
      </div>

      {!s.layers ? (
        <span className="dim">Layer attention and residual norms appear here…</span>
      ) : (
        <div className="stack-grid">
          {s.layers.map((tap, i) => (
            <LayerColumn
              key={i}
              i={i}
              tap={tap}
              prevRes={i > 0 ? s.layers![i - 1].res : null}
              hot={s.step >= 0 && s.step % s.layers!.length === i}
              theme={theme}
              onClick={(li) => onLayerClick?.(li)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
