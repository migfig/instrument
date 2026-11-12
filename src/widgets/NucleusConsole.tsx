// The top-24 candidate bars (0.0 for cut-out candidates), the applied
// cut {k, p}, the params actually applied, and the chosen-token chip.
import { useEffect, useRef } from "react";
import { useRun } from "../state/run";

const W = 320, H = 120;

export default function NucleusConsole() {
  const s = useRun();
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (!s.chosen) return;
    const cs = getComputedStyle(cv);
    const acc2 = cs.getPropertyValue("--acc2").trim() || "#ff8a65";
    const dim = cs.getPropertyValue("--dim").trim() || "#888";
    const ink = cs.getPropertyValue("--ink").trim() || "#fff";
    const { top } = s.chosen;
    const bh = Math.floor(H / top.length);
    top.forEach(([id, text, prob], i) => {
      const chosen = id === s.chosen!.id;
      ctx.fillStyle = chosen ? acc2 : dim;
      const y = i * bh;
      ctx.fillRect(0, y + 1, W * prob, bh - 2);
      ctx.fillStyle = chosen ? ink : dim;
      ctx.font = "9px monospace";
      ctx.fillText(`${text}  ${prob.toFixed(4)}`, 4, y + bh - 3);
    });
  }, [s.chosen, s.step]);
  const c = s.chosen;
  return (
    <div className="nucleus panel" data-testid="nucleus">
      <canvas ref={ref} width={W} height={H} />
      <div className="meta">
        <span data-testid="nucleus-cut">
          cut k={c ? c.cut.k : "—"} · p={c ? (c.cut.p === null ? "1.0" : c.cut.p) : "—"}
        </span>
        <span data-testid="nucleus-params">
          applied T={c ? c.params.T : "—"} k={c ? c.params.k : "—"} p={c ? c.params.p : "—"}
        </span>
        <span className="chip chosen" data-testid="nucleus-chosen">
          {c ? (c.text || `#${c.id}`) : "—"}
        </span>
      </div>
    </div>
  );
}
