import { useEffect, useRef } from "react";
import { useRun } from "../state/run";

const W = 280;
const H = 56;
const PATH = "M 24 42 C 64 10, 216 10, 256 42";

export default function Loopback() {
  const s = useRun();
  const ref = useRef<SVGSVGElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const raf = useRef(0);

  useEffect(() => {
    const svg = ref.current;
    const c = dot.current;
    if (!svg || !c || s.step < 0 || !s.chosen) return;
    const path = svg.querySelector("path");
    if (!path) return;
    const total = path.getTotalLength();
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / 800);
      const p = path.getPointAtLength(t * total);
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      if (t < 1) raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, [s.step, s.chosen?.id]);

  return (
    <div className="panel loop-wrap loop" data-testid="loopback">
      <div className="panel-head">
        <h2 className="panel-title">Autoregressive Feedback</h2>
        <span className="panel-meta">
          {s.chosen ? `t+${s.step + 1} → cache` : "Standby"}
        </span>
      </div>
      <div className="loop-svg-box">
        <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width="100%" height="100%" preserveAspectRatio="xMidYMid meet">
          <path
            d={PATH}
            fill="none"
            stroke="var(--acc2)"
            strokeWidth="1.6"
            strokeDasharray="4 3"
            opacity="0.7"
          />
          <circle cx="24" cy="42" r="3" fill="var(--acc1)" />
          <circle cx="256" cy="42" r="3" fill="var(--acc3)" />
          <circle
            ref={dot}
            cx="256"
            cy="42"
            r="4"
            fill="var(--acc2)"
            opacity={s.step >= 0 ? 1 : 0}
          />
          <text x={24} y={52} className="lbl" textAnchor="start">
            sample
          </text>
          <text x={W / 2} y={48} className="lbl" textAnchor="middle">
            append token → next step
          </text>
          <text x={256} y={52} className="lbl" textAnchor="end">
            kv
          </text>
        </svg>
      </div>
    </div>
  );
}
