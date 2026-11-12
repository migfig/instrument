import { useEffect, useRef, useState } from "react";
import { useRun } from "../state/run";
import { decodeGrid } from "../api/client";

export default function EmbedWaveform({ theme = "dark" }: { theme?: string }) {
  const s = useRun();
  const boxRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 320, h: 64 });

  const tokId =
    s.step >= 0 && s.chosen
      ? s.chosen.id
      : s.prefilled > 0
        ? s.promptTokenIds[s.prefilled - 1]
        : null;

  useEffect(() => {
    const el = boxRef.current;
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
    const { w, h } = size;
    cv.width = Math.max(1, Math.floor(w * dpr));
    cv.height = Math.max(1, Math.floor(h * dpr));
    const ctx = cv.getContext("2d");
    if (!ctx) return;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cs = getComputedStyle(document.documentElement);
    const lineCol = cs.getPropertyValue("--line-strong").trim() || "#334155";
    const acc1 = cs.getPropertyValue("--acc1").trim() || "#22d3ee";

    // Zero baseline hairline
    ctx.strokeStyle = lineCol;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h / 2);
    ctx.stroke();

    if (!s.embed) return;
    const { values } = decodeGrid(s.embed);
    if (values.length < 2) return;

    const padY = 6;
    const pts = values.map((u, i) => ({
      x: (i / (values.length - 1)) * w,
      y: h / 2 - ((u - 127.5) / 127.5) * (h / 2 - padY),
    }));

    // Subtle area fill under curve
    ctx.beginPath();
    ctx.moveTo(pts[0].x, h / 2);
    pts.forEach((p) => ctx.lineTo(p.x, p.y));
    ctx.lineTo(pts[pts.length - 1].x, h / 2);
    ctx.closePath();
    ctx.fillStyle = theme === "light" ? "rgba(3, 105, 161, 0.12)" : "rgba(34, 211, 238, 0.14)";
    ctx.fill();

    // Waveform stroke
    ctx.beginPath();
    pts.forEach((p, i) => (i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y)));
    ctx.strokeStyle = acc1;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }, [s.embed, s.step, size, theme]);

  return (
    <div className="panel embed-wrap" data-testid="embed-wave">
      <div className="panel-head">
        <h2 className="panel-title">Input Embedding (64d slice)</h2>
        <span className="panel-meta">
          {tokId !== null ? `tok #${tokId}` : "Idle"}
          {s.embed ? ` · [${s.embed.mn.toFixed(2)}, ${s.embed.mx.toFixed(2)}]` : ""}
        </span>
      </div>
      <div className="canvas-box" ref={boxRef}>
        <canvas ref={canvasRef} />
      </div>
    </div>
  );
}
