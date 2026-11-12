// US1: free-text prompt (FR-016 default example), max-tokens (FR-017),
// temperature / top-k / top-p (FR-018); US3: pause/resume, speed, reset.
import { useState } from "react";
import { useRun, runStore, type Speed } from "../state/run";

export default function RunControls() {
  const s = useRun();
  const [temp, setTemp] = useState(1);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.9);
  const busy = s.phase === "running" || s.phase === "replaying";
  const running = s.phase !== "idle" && s.phase !== "finished";
  return (
    <div className="run-controls panel" data-testid="run-controls">
      <div className="row">
        <label className="grow">
          prompt
          <input
            data-testid="prompt-input" value={s.prompt} disabled={busy}
            onChange={(e) => runStore.setPrompt(e.target.value)} />
        </label>
        <label>
          max tokens
          <input
            data-testid="max-tokens" type="number" min={1} max={2048}
            value={s.maxTokens} disabled={busy}
            onChange={(e) => runStore.setMaxTokens(Math.max(1, Math.min(2048, +e.target.value || 1)))} />
        </label>
        <label>
          T
          <input data-testid="temp" type="number" min={0.01} max={5} step={0.05}
            value={temp} disabled={busy}
            onChange={(e) => setTemp(Math.max(0.01, +e.target.value || 1))} />
        </label>
        <label>
          top-k
          <input data-testid="topk" type="number" min={1}
            value={topK} disabled={busy}
            onChange={(e) => setTopK(Math.max(1, Math.round(+e.target.value || 1)))} />
        </label>
        <label>
          top-p
          <input data-testid="topp" type="number" min={0.01} max={1} step={0.05}
            value={topP} disabled={busy}
            onChange={(e) => setTopP(Math.min(1, Math.max(0.01, +e.target.value || 0.9)))} />
        </label>
      </div>
      <div className="row">
        <button data-testid="run-btn" disabled={running} onClick={() => runStore.start({
          prompt: s.prompt, max_tokens: s.maxTokens,
          temperature: temp, top_k: topK, top_p: topP,
        })}>▶ RUN</button>
        <button data-testid="pause-btn" disabled={running === false}
          onClick={() => s.paused ? runStore.resume() : runStore.pause()}>
          {s.paused ? "▶ resume" : "◼ pause"}
        </button>
        <div className="seg" data-testid="speed-seg">
          {([0.5, 1, 2] as Speed[]).map((v) => (
            <button key={v} className={s.speed === v ? "on" : ""}
              onClick={() => runStore.setSpeed(v)}>
              {v === 0.5 ? "½×" : `${v}×`}
            </button>
          ))}
        </div>
        <button data-testid="reset-btn" disabled={s.phase === "idle"}
          onClick={() => runStore.reset()}>↺ reset</button>
        {s.error && <span className="err">{s.error}</span>}
      </div>
    </div>
  );
}