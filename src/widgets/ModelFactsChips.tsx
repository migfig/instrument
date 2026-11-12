import { useEffect, useState } from "react";
import { getModelFacts, type ModelFacts } from "../api/client";

export default function ModelFactsChips() {
  const [facts, setFacts] = useState<ModelFacts | null>(null);

  useEffect(() => {
    getModelFacts().then(setFacts).catch(() => setFacts(null));
  }, []);

  if (!facts) {
    return <div className="facts" data-testid="model-facts" />;
  }

  const items: [string, string][] = [
    ["", facts.name],
    ["", `${facts.n_layers}L`],
    ["", `${facts.dim}d`],
    ["", `${facts.n_heads}/${facts.n_kv_heads}kv`],
    ["vocab", facts.vocab_size.toLocaleString()],
    ["params", `${(facts.n_params / 1e6).toFixed(1)}M`],
    ["tie", facts.tie_weights ? "yes" : "no"],
  ];

  return (
    <div className="facts" data-testid="model-facts" aria-label="Model architecture">
      {items.map(([label, val], idx) => (
        <span key={idx} className="fact-item">
          {idx > 0 && <span className="fact-sep" aria-hidden="true"> · </span>}
          {label ? `${label} ` : ""}<b>{val}</b>
        </span>
      ))}
    </div>
  );
}
