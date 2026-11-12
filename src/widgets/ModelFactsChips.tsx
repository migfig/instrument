// Header chips: the served model's real configuration (US4).
import { useEffect, useState } from "react";
import { getModelFacts, type ModelFacts } from "../api/client";

export default function ModelFactsChips({ onWeights }: { onWeights?: () => void }) {
  const [facts, setFacts] = useState<ModelFacts | null>(null);
  useEffect(() => {
    getModelFacts().then(setFacts).catch(() => setFacts(null));
  }, []);
  if (!facts) return <div className="facts" data-testid="model-facts" />;
  const bits: [string, string][] = [
    ["model", facts.name],
    ["layers", String(facts.n_layers)],
    ["dim", String(facts.dim)],
    ["heads", `${facts.n_heads}/${facts.n_kv_heads}kv`],
    ["d_head", String(facts.d_head)],
    ["mlp", String(facts.mlp_dim)],
    ["vocab", String(facts.vocab_size)],
    ["params", (facts.n_params / 1e6).toFixed(1) + "M"],
    ["tie", facts.tie_weights ? "yes" : "no"],
  ];
  return (
    <div className="facts" data-testid="model-facts">
      {bits.map(([k, v]) => (
        <span key={k} className="chip fact">{k} <b>{v}</b></span>
      ))}
      <button className="chip" data-testid="weights-btn"
        onClick={() => onWeights?.()}>weights ▸</button>
    </div>
  );
}
