import { useState } from "react";
import { useRun, runStore, type Speed } from "../state/run";

const PRESETS: { label: string; prompt: string }[] = [
  { label: "France Capital", prompt: "The capital of France is" },
  { label: "Fibonacci Code", prompt: "def fibonacci(n):" },
  { label: "Attention Math", prompt: "Self-attention in a transformer" },
];

export default function RunControls() {
  const s = useRun();
  const [temp, setTemp] = useState(1);
  const [topK, setTopK] = useState(40);
  const [topP, setTopP] = useState(0.9);
  const busy = s.phase === "running" || s.phase === "replaying";
  const running = s.phase !== "idle" && s.phase !== "finished";

  const launch = (promptOverride?: string) => {
    const prompt = promptOverride ?? s.prompt;
    if (promptOverride !== undefined) runStore.setPrompt(promptOverride);
    runStore.start({
      prompt,
      max_tokens: s.maxTokens,
      temperature: temp,
      top_k: topK,
      top_p: topP,
    });
  };

  return (
    <div className="run-controls panel" data-testid="run-controls">
      <div className="controls-row">
        <label className="field grow">
          <span>Prompt</span>
          <input
            data-testid="prompt-input"
            value={s.prompt}
            disabled={busy}
            placeholder="Enter a prompt to inspect token-by-token inference..."
            onChange={(e) => runStore.setPrompt(e.target.value)}
          />
        </label>

        <div className="preset-group" role="group" aria-label="Sample prompts">
          {PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              className={`preset-btn ${s.prompt === p.prompt ? "on" : ""}`}
              disabled={busy}
              onClick={() => launch(p.prompt)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      <div className="controls-row">
        <label className="field">
          <span>Max Tokens</span>
          <input
            data-testid="max-tokens"
            type="number"
            min={1}
            max={2048}
            value={s.maxTokens}
            disabled={busy}
            onChange={(e) =>
              runStore.setMaxTokens(Math.max(1, Math.min(2048, +e.target.value || 1)))
            }
          />
        </label>

        <label className="field">
          <span>Temp</span>
          <input
            data-testid="temp"
            type="number"
            min={0.01}
            max={5}
            step={0.05}
            value={temp}
            disabled={busy}
            onChange={(e) => setTemp(Math.max(0.01, +e.target.value || 1))}
          />
        </label>

        <label className="field">
          <span>Top-K</span>
          <input
            data-testid="topk"
            type="number"
            min={1}
            value={topK}
            disabled={busy}
            onChange={(e) => setTopK(Math.max(1, Math.round(+e.target.value || 1)))}
          />
        </label>

        <label className="field">
          <span>Top-P</span>
          <input
            data-testid="topp"
            type="number"
            min={0.01}
            max={1}
            step={0.05}
            value={topP}
            disabled={busy}
            onChange={(e) => setTopP(Math.min(1, Math.max(0.01, +e.target.value || 0.9)))}
          />
        </label>

        <div className="controls-actions">
          <button
            type="button"
            className="btn btn-primary"
            data-testid="run-btn"
            disabled={running}
            onClick={() => launch()}
          >
            ▶ Run Simulation
          </button>

          <button
            type="button"
            className="btn"
            data-testid="pause-btn"
            disabled={!running}
            onClick={() => (s.paused ? runStore.resume() : runStore.pause())}
          >
            {s.paused ? "▶ Resume" : "◼ Pause"}
          </button>

          <div className="seg" data-testid="speed-seg" role="group" aria-label="Playback speed">
            {([0.5, 1, 2] as Speed[]).map((v) => (
              <button
                key={v}
                type="button"
                className={s.speed === v ? "on" : ""}
                onClick={() => runStore.setSpeed(v)}
              >
                {v === 0.5 ? "½×" : `${v}×`}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="btn btn-ghost"
            data-testid="reset-btn"
            disabled={s.phase === "idle"}
            onClick={() => runStore.reset()}
          >
            ↺ Reset
          </button>
        </div>

        {s.error && <span className="err">{s.error}</span>}
      </div>
    </div>
  );
}