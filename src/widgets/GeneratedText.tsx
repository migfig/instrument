import { useRun } from "../state/run";

export default function GeneratedText() {
  const s = useRun();

  return (
    <div className="sub-block" data-testid="gen-text">
      <div className="panel-head" style={{ marginBottom: 2 }}>
        <span className="panel-title">Generated Output</span>
        <span className="panel-meta">
          {s.generated.length > 0 ? `${s.generated.length} tokens` : "Standby"}
        </span>
      </div>
      <div className="gen-text">
        {s.generated.length === 0 && (
          <span className="dim">Streamed generated text appears here…</span>
        )}
        {s.generated.map((t, i) => (
          <span
            key={i}
            className={"tok gen" + (i === s.generated.length - 1 ? " new" : "")}
          >
            {t.token}
          </span>
        ))}
      </div>
    </div>
  );
}
