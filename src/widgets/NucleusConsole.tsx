import { useRun } from "../state/run";

function formatToken(text: string): string {
  return text.replace(/\n/g, "↵").replace(/\t/g, "→");
}

export default function NucleusConsole() {
  const s = useRun();
  const c = s.chosen;
  const maxProb = c && c.top.length > 0 ? Math.max(0.05, c.top[0][2]) : 1;

  return (
    <div className="nucleus panel" data-testid="nucleus">
      <div className="panel-head">
        <h2 className="panel-title">Nucleus & Top-K Sampling Distribution</h2>
        <span className="panel-meta">
          {c ? `${c.top.length} candidates evaluated` : "Standby"}
        </span>
      </div>

      <div className="nucleus-body">
        {!c ? (
          <span className="dim">Candidate token probabilities appear during decoding…</span>
        ) : (
          c.top.map(([id, text, prob], idx) => {
            const isChosen = id === c.id;
            const isPruned = prob <= 0;
            const pct = Math.min(100, (prob / maxProb) * 100);
            return (
              <div
                key={`${id}-${idx}`}
                className={
                  "nuc-row" + (isChosen ? " chosen" : "") + (isPruned ? " pruned" : "")
                }
              >
                <span className="nuc-rank">{idx + 1}</span>
                <span className="nuc-tok" title={JSON.stringify(text)}>
                  {JSON.stringify(formatToken(text))}
                </span>
                <span className="nuc-track">
                  <i className="nuc-fill" style={{ width: `${pct}%` }} />
                </span>
                <span className="nuc-prob">{prob.toFixed(4)}</span>
              </div>
            );
          })
        )}
      </div>

      <div className="meta">
        <span data-testid="nucleus-cut">
          cut k={c ? c.cut.k : "—"} · p={c ? (c.cut.p === null ? "1.0" : c.cut.p) : "—"}
        </span>
        <span data-testid="nucleus-params">
          applied T={c ? c.params.T : "—"} k={c ? c.params.k : "—"} p={c ? c.params.p : "—"}
        </span>
        <span className="chosen-badge" data-testid="nucleus-chosen">
          {c ? (c.text ? JSON.stringify(c.text) : `#${c.id}`) : "—"}
        </span>
      </div>
    </div>
  );
}
