import { useRun } from "../state/run";

export function TokenStrip() {
  const s = useRun();
  const empty = s.prefilled === 0 && s.generated.length === 0;

  return (
    <div className="token-strip" data-testid="token-strip">
      {empty && <span className="dim">Active context sequence appears here…</span>}
      {s.promptTokens.slice(0, s.prefilled).map((t, i) => (
        <span key={"p" + i} className="mem-tok">
          {JSON.stringify(t)}
        </span>
      ))}
      {s.generated.map((t, i) => (
        <span
          key={"g" + i}
          className={"mem-tok gen" + (i === s.generated.length - 1 ? " new" : "")}
        >
          {t.token}
        </span>
      ))}
    </div>
  );
}

export function KvMeter() {
  const s = useRun();
  if (!s.kv) {
    return (
      <div className="kv" data-testid="kv-meter">
        <span className="kv-label">KV Cache</span>
        <span className="kvbar">
          <i style={{ width: "0%" }} />
        </span>
        <span className="kvtxt" data-testid="kv-text">
          0 positions · 0.000 MiB
        </span>
      </div>
    );
  }
  const maxN = s.prefilled > 0 ? s.maxTokens + s.promptTokenIds.length : s.maxTokens;
  const pct = Math.min(100, (s.kv.n / Math.max(1, maxN)) * 100);
  const mb = s.kv.bytes / 1024 / 1024;

  return (
    <div className="kv" data-testid="kv-meter">
      <span className="kv-label">KV Cache</span>
      <span className="kvbar">
        <i style={{ width: pct + "%" }} />
      </span>
      <span className="kvtxt" data-testid="kv-text">
        n = {s.kv.n} · {mb.toFixed(2)} MiB fixed
      </span>
    </div>
  );
}

export default { TokenStrip, KvMeter };
