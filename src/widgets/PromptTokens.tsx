// Prompt token chips (from the index-0 prefill's tokens/token_ids) lighting
// up one by one as prefill events arrive (FR: human lane).
import { useRun } from "../state/run";

export default function PromptTokens() {
  const s = useRun();
  return (
    <div className="prompt-tokens panel" data-testid="prompt-tokens">
      {s.promptTokens.length === 0 &&
        <span className="dim">prompt tokens appear here at prefill…</span>}
      {s.promptTokens.map((t, i) => (
        <span key={i} className={"tok" + (i < s.prefilled ? " on" : "")}>
          {JSON.stringify(t)}
        </span>
      ))}
    </div>
  );
}
