// The instrument layout per the hybrid mockup:
// header (status readout, theme toggle) → human lane (PromptTokens,
// GeneratedText) → membrane (TokenStrip + KvMeter) → model lane
// (EmbedWaveform, LayerStack, NucleusConsole, Loopback).
import { useEffect, useState } from "react";
import { getWeights, type Weights } from "./api/client";
import { useRun } from "./state/run";
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
import { runStore } from "./state/run";

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
  const status = s.phase === "finished"
    ? `done · ${s.nTokens} tokens · ${s.tokensPerS?.toFixed(1) ?? "?"} tok/s`
    : s.phase === "replaying" ? `replaying · step ${s.step}`
      : s.phase === "running" ? "running · streaming" : "idle";
  return (
    <div className="app">
      <header className="panel">
        <span className="status" data-testid="status">{status}</span>
        <ModelFactsChips onWeights={() => setDrawer({ kind: "emb" })} />
        <button className="chip" data-testid="vs-toggle"
          onClick={() => runStore.toggleVs()}
          title="vector space overlay">
          {s.vsOn ? "⌗ off" : "⌗ vector space"}
        </button>
        <button className="chip" data-testid="theme-toggle"
          onClick={() => setDark(!dark)}>
          {dark ? "☾ dark" : "☀ light"}
        </button>
      </header>
      <RunControls />
      <section className="lane human">
        <PromptTokens />
        <GeneratedText />
        <BpeMicroscope />
      </section>
      <section className="lane membrane">
        <TokenStrip />
        <KvMeter />
      </section>
      <section className="lane model">
        <EmbedWaveform />
        {s.vsOn && <VectorSpace />}
        <LayerStack onLayerClick={(i) => setDrawer({ kind: "layer", i })} />
        <NucleusConsole />
        <Loopback />
      </section>
      <WeightsDrawer weights={weights} target={drawer}
        close={() => setDrawer(null)} />
    </div>
  );
}
