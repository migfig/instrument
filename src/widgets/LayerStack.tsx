// One column per layer: attention strip (the <=64 row over every past token),
// residual bar (res) and FFN bar (dres = res_i - res_{i-1}; layer 0 alone).
// A left->right sweep marks the active step; columns are clickable (US4).
import { useEffect, useRef } from "react";
import { useRun } from "../state/run";
import { decodeAttn } from "../api/client";

const AW = 64, AH = 10;

function LayerColumn({ i, tap, prevRes, hot, onClick }: {
  i: number;
  tap: { i: number; attn: { len: number; data: string } | null; res: number };
  prevRes: number | null;
  hot: boolean;
  onClick: (i: number) => void;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, AW, AH);
    if (!tap.attn) return;
    const values = decodeAttn(tap.attn);  // probability row: u = p*255
    const cw = AW / values.length;
    values.forEach((u, x) => {
      ctx.fillStyle = `rgba(110,231,255,${(u / 255) * 0.9 + 0.05})`;
      ctx.fillRect(x * cw, 0, Math.ceil(cw), AH);
    });
  }, [tap.attn]);
  const dres = prevRes === null ? tap.res : tap.res - prevRes;
  const resPct = Math.min(100, tap.res * 25);
  const dPct = Math.min(100, Math.abs(dres) * 250);
  return (
    <div className={"col" + (hot ? " hot" : "")} title={`Layer ${i} — weights`}
      onClick={() => onClick(i)}>
      <span className="cl">L{i}</span>
      <canvas ref={ref} width={AW} height={AH} />
      <div className="bar ffn"><i style={{ width: dPct + "%" }} /></div>
      <div className="bar res"><i style={{ width: resPct + "%" }} /></div>
      <span className="cap">{tap.res.toFixed(3)}</span>
    </div>
  );
}

export default function LayerStack({ onLayerClick }: { onLayerClick?: (i: number) => void }) {
  const s = useRun();
  if (!s.layers) {
    return <div className="stack panel" data-testid="layer-stack">
      <span className="dim">layer activity appears here…</span></div>;
  }
  const n = s.layers.length;
  return (
    <div className="stack panel" data-testid="layer-stack">
      {s.layers.map((tap, i) => (
        <LayerColumn key={i} i={i} tap={tap}
          prevRes={i > 0 ? s.layers![i - 1].res : null}
          hot={s.step >= 0 && s.step % n === i}
          onClick={(li) => onLayerClick?.(li)} />
      ))}
    </div>
  );
}
