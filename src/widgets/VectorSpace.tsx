import { useEffect, useRef, useState } from "react";
import { useRun, runStore } from "../state/run";
import { decodeAttn } from "../api/client";

const PAD = 34;

export default function VectorSpace({ theme = "dark" }: { theme?: string }) {
  const s = useRun();
  const wrapRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 440, h: 270 });

  const nLayers = s.flow ? s.flow.layers.length : 0;
  const layerSel = s.layerSel ?? Math.max(0, nLayers - 1);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setSize({ w: Math.floor(rect.width), h: Math.floor(rect.height) });
      }
    };
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    const cv = canvasRef.current;
    if (!cv) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const { w: W, h: H } = size;
    cv.width = Math.max(1, Math.floor(W * dpr));
    cv.height = Math.max(1, Math.floor(H * dpr));
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);

    const cs = getComputedStyle(document.documentElement);
    const acc1 = cs.getPropertyValue("--acc1").trim() || "#22d3ee";
    const acc2 = cs.getPropertyValue("--acc2").trim() || "#f59e0b";
    const dim = cs.getPropertyValue("--dim").trim() || "#94a3b8";
    const ink = cs.getPropertyValue("--ink").trim() || "#f1f5f9";
    const lineCol = cs.getPropertyValue("--line").trim() || "#1f2b42";

    // Subtle coordinate crosshair grid
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(W / 2, 12);
    ctx.lineTo(W / 2, H - 12);
    ctx.moveTo(12, H / 2);
    ctx.lineTo(W - 12, H / 2);
    ctx.stroke();

    const vs = s.vectors;
    if (!vs.length) {
      ctx.fillStyle = dim;
      ctx.font = "12px 'IBM Plex Mono', monospace";
      ctx.fillText("Token constellation appears during prefill…", 20, 36);
      return;
    }

    const xs = vs.map((v) => v.x);
    const ys = vs.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    const sx = maxX - minX > 1e-9 ? (W - 2 * PAD) / (maxX - minX) : 1;
    const sy = maxY - minY > 1e-9 ? (H - 2 * PAD) / (maxY - minY) : 1;
    const sc = Math.min(sx, sy);
    const px = (v: { x: number; y: number }) => ({
      x: PAD + (v.x - minX) * sc + (W - 2 * PAD - (maxX - minX) * sc) / 2,
      y: PAD + (v.y - minY) * sc + (H - 2 * PAD - (maxY - minY) * sc) / 2,
    });
    const pos = vs.map(px);

    // Trajectory path across token order
    ctx.strokeStyle = theme === "light" ? "rgba(100, 116, 139, 0.25)" : "rgba(148, 163, 184, 0.22)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    pos.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.stroke();

    // Attention flows from the current token to past positions
    const f = s.flow;
    const edgeRgb = theme === "light" ? "109, 40, 217" : "167, 139, 250";
    if (f && f.cur >= 0 && f.cur < pos.length) {
      const tap = f.layers[layerSel]?.attn ?? null;
      const nPast = f.kvN - 1;
      if (tap && nPast > 0) {
        const vals = decodeAttn(tap);
        const L = vals.length;
        const pooled = nPast > L;
        const c = pos[f.cur];
        for (let j = 0; j < L; j++) {
          const w = vals[j] / 255;
          if (w < 0.02) continue;
          const lo = Math.floor((j * nPast) / L);
          const hi = Math.max(lo + 1, Math.floor(((j + 1) * nPast) / L));
          let tx = 0;
          let ty = 0;
          let n = 0;
          for (let p = lo; p < Math.min(hi, nPast); p++) {
            tx += pos[p].x;
            ty += pos[p].y;
            n++;
          }
          if (!n) continue;
          tx /= n;
          ty /= n;
          ctx.strokeStyle = `rgba(${edgeRgb}, ${0.18 + 0.72 * w})`;
          ctx.lineWidth = pooled ? 1 + (hi - lo) * 1.4 : 1.5;
          ctx.beginPath();
          ctx.moveTo(c.x, c.y);
          ctx.lineTo(tx, ty);
          ctx.stroke();
        }
      }
    }

    // Token nodes + compact labels
    ctx.font = "10px 'IBM Plex Mono', monospace";
    vs.forEach((v, i) => {
      const p = pos[i];
      const cur = f?.cur === i;
      ctx.beginPath();
      ctx.arc(p.x, p.y, cur ? 5.5 : 3.8, 0, Math.PI * 2);
      ctx.fillStyle = v.kind === "prompt" ? acc1 : acc2;
      ctx.fill();
      if (cur) {
        ctx.strokeStyle = ink;
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }
      if (vs.length <= 20 || cur || i === 0 || i === vs.length - 1) {
        ctx.fillStyle = cur ? ink : dim;
        ctx.fillText(v.text.trim() || "·", p.x + 7, p.y + 3);
      }
    });
  }, [s.vectors, s.flow, layerSel, size, theme]);

  return (
    <div className="panel vs" data-testid="vector-space">
      <div className="vs-head">
        <span className="panel-title">2D Embedding & Attention Projection</span>
        {s.flow && (
          <div className="vs-layers">
            {s.flow.layers.map((l) => (
              <button
                key={l.i}
                type="button"
                className={l.i === layerSel ? "on" : ""}
                onClick={() => runStore.setLayerSel(l.i)}
              >
                L{l.i}
              </button>
            ))}
          </div>
        )}
      </div>
      <div className="vs-canvas-wrap" ref={wrapRef}>
        <canvas ref={canvasRef} />
      </div>
      <div className="vs-legend">
        <span className="vs-leg-prompt">● Prompt</span>
        <span className="vs-leg-gen">● Generated</span>
        <span>Layer L{layerSel} attention arcs</span>
      </div>
    </div>
  );
}
