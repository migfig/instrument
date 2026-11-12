// The membrane: prompt + generated chips accumulating across the run, and
// the KV meter — the constant kv.bytes (the whole cache) with kv.n filling.
import { useRun } from "../state/run";

export function TokenStrip() {
  const s = useRun();
  return (
    <div className="token-strip" data-testid="token-strip">
      {s.promptTokens.slice(0, s.prefilled).map((t, i) => (
        <span key={"p" + i} className="chip">{JSON.stringify(t)}</span>
      ))}
      {s.generated.map((t, i) => (
        <span key={"g" + i} className={"chip gen" + (i === s.generated.length - 1 ? " new" : "")}>
          {t.token}
        </span>
      ))}
    </div>
  );
}

export function KvMeter() {
  const s = useRun();
  if (!s.kv) {
    return <div className="kv panel" data-testid="kv-meter">
      <span className="dim">KV —</span></div>;
  }
  const maxN = s.prefilled > 0 ? s.maxTokens + s.promptTokenIds.length : s.maxTokens;
  const pct = Math.min(100, (s.kv.n / Math.max(1, maxN)) * 100);
  const mb = s.kv.bytes / 1024 / 1024;
  return (
    <div className="kv panel" data-testid="kv-meter">
      <span className="dim">KV</span>
      <span className="kvbar"><i style={{ width: pct + "%" }} /></span>
      <span className="kvtxt" data-testid="kv-text">
        n = {s.kv.n} · cache {mb.toFixed(3)} MiB (constant)
      </span>
    </div>
  );
}

export default { TokenStrip, KvMeter };
