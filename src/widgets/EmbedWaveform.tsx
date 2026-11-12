// Canvas waveform of the current token's <=64 input representation
// (uint8+b64 with mn/mx) plus the current token id.
import { useEffect, useRef } from "react";
import { useRun } from "../state/run";
import { decodeGrid } from "../api/client";

const W = 224, H = 48;

export default function EmbedWaveform() {
  const s = useRun();
  const ref = useRef<HTMLCanvasElement>(null);
  const tokId = s.step >= 0 && s.chosen ? s.chosen.id
    : s.prefilled > 0 ? s.promptTokenIds[s.prefilled - 1] : null;
  useEffect(() => {
    const cv = ref.current;
    if (!cv) return;
    const ctx = cv.getContext("2d")!;
    ctx.clearRect(0, 0, W, H);
    if (!s.embed) return;
    const { values } = decodeGrid(s.embed);
    ctx.beginPath();
    values.forEach((u, i) => {
      const x = (i / (values.length - 1)) * W;
      const y = H / 2 - (u - 127.5) / 127.5 * (H / 2 - 2);
      i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
    });
    ctx.strokeStyle = getComputedStyle(document.documentElement)
      .getPropertyValue("--acc1").trim() || "#6ee7ff";
    ctx.lineWidth = 1.2;
    ctx.stroke();
  }, [s.embed, s.step]);
  return (
    <div className="embed panel" data-testid="embed-wave">
      <canvas ref={ref} width={W} height={H} />
      <span className="dim">embed {tokId !== null ? `· tok #${tokId}` : ""}
        {s.embed ? ` · [${s.embed.mn.toFixed(3)}, ${s.embed.mx.toFixed(3)}]` : ""}
      </span>
    </div>
  );
}
