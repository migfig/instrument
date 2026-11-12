// Vector-space view (US5, research R8): one node per run token positioned by
// its real pooled embed through the fixed seeded 64->2 projection (VS_SEED in
// state/run.ts — display-only transform), with the current token's attention
// flows to past tokens at the stored <=64 layer-tap granularity: per-token
// edges when the row was not pooled, contiguous bins as bands when it was.
import { useEffect, useRef } from "react";
import { useRun, runStore } from "../state/run";
import { decodeAttn } from "../api/client";

const W = 440, H = 300, PAD = 34;

export default function VectorSpace() {
  const s = useRun();
  const ref = useRef<HTMLCanvasElement>(null);
  const nLayers = s.flow ? s.flow.layers.length : 0;
  const layerSel = s.layerSel ?? Math.max(0, nLayers - 1);

  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    const vs = s.vectors;
    if (!vs.length) {
      ctx.fillStyle = "rgba(148,163,184,.7)";
      ctx.font = "13px ui-monospace, monospace";
      ctx.fillText("token constellation appears here…", 24, 40);
      return;
    }
    // fit the projected points into the box (display-only normalization)
    const xs = vs.map(v => v.x), ys = vs.map(v => v.y);
    const minX = Math.min(...xs), maxX = Math.max(...xs);
    const minY = Math.min(...ys), maxY = Math.max(...ys);
    const sx = (maxX - minX) > 1e-9 ? (W - 2 * PAD) / (maxX - minX) : 1;
    const sy = (maxY - minY) > 1e-9 ? (H - 2 * PAD) / (maxY - minY) : 1;
    const sc = Math.min(sx, sy);
    const px = (v: { x: number; y: number }) => ({
      x: PAD + (v.x - minX) * sc + (W - 2 * PAD - (maxX - minX) * sc) / 2,
      y: PAD + (v.y - minY) * sc + (H - 2 * PAD - (maxY - minY) * sc) / 2,
    });
    const pos = vs.map(px);

    // attention flows from the current token to past positions
    const f = s.flow;
    if (f && f.cur >= 0 && f.cur < pos.length) {
      const tap = f.layers[layerSel]?.attn ?? null;
      const nPast = f.kvN - 1;
      if (tap && nPast > 0) {
        const vals = decodeAttn(tap);           // L bins, 0..255
        const L = vals.length;
        const pooled = nPast > L;
        const c = pos[f.cur];
        for (let j = 0; j < L; j++) {
          const w = vals[j] / 255;
          if (w < 0.02) continue;
          const lo = Math.floor(j * nPast / L);
          const hi = Math.max(lo + 1, Math.floor((j + 1) * nPast / L));
          // target: the covered past positions (positions == node indices)
          let tx = 0, ty = 0, n = 0;
          for (let p = lo; p < Math.min(hi, nPast); p++) { tx += pos[p].x; ty += pos[p].y; n++; }
          if (!n) continue;
          tx /= n; ty /= n;
          ctx.strokeStyle = `rgba(196,181,253,${0.15 + 0.75 * w})`;
          ctx.lineWidth = pooled ? 1 + (hi - lo) * 1.5 : 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      }
    }
    // nodes
    vs.forEach((v, i) => {
      const p = pos[i];
      const cur = f?.cur === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cur ? 6 : 4, 0, Math.PI * 2);
      ctx.fillStyle = v.kind === "prompt" ? "rgba(110,231,255,.95)" : "rgba(251,191,36,.95)";
      ctx.fill();
      if (cur) {
        ctx.strokeStyle = "rgba(255,255,255,.9)";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    });
    // legend
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillStyle = "rgba(110,231,255,.95)";
    ctx.fillText("● prompt", 10, H - 10);
    ctx.fillStyle = "rgba(251,191,36,.95)";
    ctx.fillText("● generated", 76, H - 10);
    ctx.fillStyle = "rgba(148,163,184,.8)";
    ctx.fillText(`layer L${layerSel} →`, 160, H - 10);
  }, [s.vectors, s.flow, layerSel]);

  return <div className="panel vs" data-testid="vector-space">
    <div className="vs-head">
      <span>vector space</span>
      {s.flow && (
        <span className="vs-layers">
          {s.flow.layers.map(l => (
            <button key={l.i}
              className={l.i === layerSel ? "on" : ""}
              onClick={() => runStore.setLayerSel(l.i)}>
              L{l.i}
            </button>
          ))}
        </span>
      )}
    </div>
    <canvas ref={ref} width={W} height={H} />
  </div>;
}
