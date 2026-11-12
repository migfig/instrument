import { useEffect, useState } from "react";
import { getWeights, type Weights } from "./api/client";
import { useRun, runStore } from "./state/run";
import RunControls from "./widgets/RunControls";
import PromptTokens from "./widgets/PromptTokens";
import GeneratedText from "./widgets/GeneratedText";
import { TokenStrip, KvMeter } from "./widgets/TokenStrip";
import EmbedWaveform from "./widgets/EmbedWaveform";
import LayerStack from "./widgets/LayerStack";
import NucleusConsole from "./widgets/NucleusConsole";
import Loopback from "./widgets/Loopback";
import ModelFactsChips from "./widgets/ModelFactsChips";
import WeightsDrawer, { type DrawerTarget } from "./widgets/WeightsDrawer";
import BpeMicroscope from "./widgets/BpeMicroscope";
import VectorSpace from "./widgets/VectorSpace";

export default function App() {
  const s = useRun();
  const [dark, setDark] = useState(true);
  const [weights, setWeights] = useState<Weights | null>(null);
  const [drawer, setDrawer] = useState<DrawerTarget>(null);

  useEffect(() => {
    getWeights().then(setWeights).catch(() => setWeights(null));
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
  }, [dark]);

  const theme = dark ? "dark" : "light";

  const statusText =
    s.phase === "finished"
      ? `Complete · ${s.nTokens} tok · ${s.tokensPerS?.toFixed(1) ?? "—"} tok/s`
      : s.paused
        ? `Paused · step ${Math.max(0, s.step + 1)}`
        : s.phase === "replaying"
          ? `Streaming · step ${s.step + 1}`
          : s.phase === "running"
            ? "Prefilling"
            : "Idle";

  const statusTone =
    s.phase === "finished"
      ? "done"
      : s.paused
        ? "paused"
        : s.phase === "running" || s.phase === "replaying"
          ? "live"
          : "idle";

  const statusGlyph =
    s.phase === "finished" ? "✓" : s.paused ? "❚❚" : s.phase === "idle" ? "○" : "●";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-brand-zone">
          <span className="brand-title">The Instrument</span>
          <span className="status" data-testid="status">
            <span className={`status-mark ${statusTone}`} aria-hidden="true">
              {statusGlyph}
            </span>
            <span>{statusText}</span>
          </span>
        </div>

        <ModelFactsChips />

        <div className="topbar-actions">
          <button
            type="button"
            className="btn"
            data-testid="weights-btn"
            onClick={() => setDrawer({ kind: "emb" })}
          >
            Weights
          </button>
          <button
            type="button"
            className={`btn ${s.vsOn ? "btn-active" : ""}`}
            data-testid="vs-toggle"
            onClick={() => runStore.toggleVs()}
            aria-pressed={s.vsOn}
          >
            {s.vsOn ? "Close Vector Space" : "Vector Space"}
          </button>
          <button
            type="button"
            className="btn btn-ghost"
            data-testid="theme-toggle"
            onClick={() => setDark((d) => !d)}
            aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
          >
            {dark ? "☀ Light" : "☾ Dark"}
          </button>
        </div>
      </header>

      <RunControls />

      <main className="workspace">
        <section className="col-human" aria-label="Sequence and tokenization">
          <div className="panel sequence-split">
            <div className="panel-head">
              <h2 className="panel-title">Sequence Stream</h2>
              <span className="panel-meta">
                {s.promptTokens.length} prompt · {s.generated.length} generated
              </span>
            </div>
            <div className="sequence-stack">
              <PromptTokens />
              <div className="sub-divider" />
              <GeneratedText />
            </div>
          </div>

          <BpeMicroscope />

          <div className="panel membrane-panel">
            <div className="panel-head">
              <h2 className="panel-title">Context Membrane & KV Cache</h2>
              <span className="panel-meta">
                {s.kv ? `${s.kv.n} cached positions` : "Empty"}
              </span>
            </div>
            <TokenStrip />
            <KvMeter />
          </div>
        </section>

        <section className="col-model" aria-label="Transformer internals and sampling">
          <div className="model-top-grid">
            <EmbedWaveform theme={theme} />
            <Loopback />
          </div>

          <LayerStack
            theme={theme}
            onLayerClick={(i) => setDrawer({ kind: "layer", i })}
          />

          <NucleusConsole />

          {s.vsOn && <VectorSpace theme={theme} />}
        </section>
      </main>

      <WeightsDrawer
        weights={weights}
        target={drawer}
        theme={theme}
        close={() => setDrawer(null)}
      />
    </div>
  );
}
