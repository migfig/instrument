import { useRun } from "../state/run";

export default function PromptTokens() {
  const s = useRun();

  return (
    <div className="sub-block" data-testid="prompt-tokens">
      <div className="panel-head" style={{ marginBottom: 2 }}>
        <span className="panel-title">Prompt Tokens</span>
        <span className="panel-meta">
          {s.promptTokens.length > 0 ? `${s.prefilled}/${s.promptTokens.length} prefilled` : "Waiting"}
        </span>
      </div>
      <div className="prompt-tokens">
        {s.promptTokens.length === 0 && (
          <span className="dim">Prompt tokens appear here during prefill…</span>
        )}
        {s.promptTokens.map((t, i) => (
          <span key={i} className={"tok" + (i < s.prefilled ? " on" : "")}>
            {JSON.stringify(t)}
          </span>
        ))}
      </div>
    </div>
  );
}
