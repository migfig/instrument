// The feedback loop: an SVG path carrying the chosen token back to the
// membrane. The dot travels the path each time a token is chosen.
import { useEffect, useRef } from "react";
import { useRun } from "../state/run";

const W = 260, H = 90;
const PATH = "M 250 12 C 60 4, 10 30, 8 60 C 6 78, 60 84, 120 82";

export default function Loopback() {
  const s = useRun();
  const ref = useRef<SVGSVGElement>(null);
  const dot = useRef<SVGCircleElement>(null);
  const raf = useRef(0);
  useEffect(() => {
    const svg = ref.current, c = dot.current;
    if (!svg || !c || s.step < 0 || !s.chosen) return;
    const path = svg.querySelector("path")!;
    const total = path.getTotalLength();
    const t0 = performance.now();
    cancelAnimationFrame(raf.current);
    const frame = (now: number) => {
      const t = Math.min(1, (now - t0) / 900);
      const p = path.getPointAtLength(t * total);
      c.setAttribute("cx", String(p.x));
      c.setAttribute("cy", String(p.y));
      if (t < 1) raf.current = requestAnimationFrame(frame);
    };
    raf.current = requestAnimationFrame(frame);
    return () => cancelAnimationFrame(raf.current);
  }, [s.step, s.chosen?.id]);
  return (
    <div className="loop panel" data-testid="loopback">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} width={W} height={H}>
        <path d={PATH} fill="none" stroke="var(--acc2)" strokeWidth="1.5"
          strokeDasharray="4 3" opacity="0.6" />
        <circle ref={dot} r="3.5" fill="var(--acc2)" opacity={s.step >= 0 ? 1 : 0} />
        <text x={W / 2} y={14} className="lbl" textAnchor="middle">
          chosen token → membrane
        </text>
      </svg>
    </div>
  );
}
