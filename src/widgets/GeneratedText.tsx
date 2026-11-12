// The streaming generated text, appended from `token` events.
import { useRun } from "../state/run";

export default function GeneratedText() {
  const s = useRun();
  return (
    <div className="gen-text panel" data-testid="gen-text">
      {s.generated.length === 0 &&
        <span className="dim">generated text streams here…</span>}
      {s.generated.map((t, i) => (
        <span key={i} className={"tok gen" + (i === s.generated.length - 1 ? " new" : "")}>
          {t.token}
        </span>
      ))}
    </div>
  );
}
