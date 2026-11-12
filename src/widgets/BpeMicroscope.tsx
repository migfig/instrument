import { useEffect, useRef, useState } from "react";
import { useRun } from "../state/run";

interface Piece {
  bytes: number[];
  comp: boolean;
}

function replay(text: string, merges: number[][], upto: number): Piece[] {
  const bytes = new TextEncoder().encode(text);
  let pieces: Piece[] = Array.from(bytes, (b) => ({ bytes: [b], comp: false }));
  for (let k = 0; k < Math.min(upto, merges.length); k++) {
    const [a, b] = merges[k];
    const ok = (p: Piece, v: number) =>
      v <= 255 ? !p.comp && p.bytes[0] === v : p.comp;
    const i = pieces.findIndex(
      (p, j) => j < pieces.length - 1 && ok(p, a) && ok(pieces[j + 1], b),
    );
    if (i >= 0) {
      pieces = [
        ...pieces.slice(0, i),
        { bytes: [...pieces[i].bytes, ...pieces[i + 1].bytes], comp: true },
        ...pieces.slice(i + 2),
      ];
    }
  }
  return pieces;
}

const ch = (b: number) => (b >= 32 && b < 127 ? String.fromCharCode(b) : "·");

export default function BpeMicroscope() {
  const s = useRun();
  const [upto, setUpto] = useState(0);
  const key = s.bpe ? `${s.bpe.index}:${s.bpe.text}` : "none";
  const ref = useRef(key);
  if (ref.current !== key) {
    ref.current = key;
    setUpto(s.phase === "finished" && s.bpe?.merges ? s.bpe.merges.length : 0);
  }

  useEffect(() => {
    const merges = s.bpe?.merges ?? null;
    if (!merges) return;
    if (s.phase === "finished") {
      setUpto(merges.length);
      return;
    }
    const id = setInterval(() => {
      setUpto((u) => (u < merges.length ? u + 1 : u));
    }, 320);
    return () => clearInterval(id);
  }, [key, s.bpe?.merges, s.phase]);

  const b = s.bpe;

  return (
    <div className="panel bpe-micro" data-testid="bpe-micro">
      <div className="panel-head" style={{ marginBottom: 0 }}>
        <h2 className="panel-title">BPE Subword Microscope</h2>
        <span className="panel-meta">
          {b
            ? b.merges
              ? `Token #${b.index} · ${Math.min(upto, b.merges.length)}/${b.merges.length} merges`
              : `Token #${b.index} · single byte`
            : "Idle"}
        </span>
      </div>

      {!b && <span className="dim">Subword byte merge trace appears during prefill…</span>}

      {b && !b.merges && (
        <div className="bpe-body">
          <div>
            <span className="bpe-tok">{JSON.stringify(b.text)}</span>
            <span className="dim">No merge history (single-byte UTF-8 token)</span>
          </div>
        </div>
      )}

      {b && b.merges && (
        <div className="bpe-body">
          <div className="bpe-row">
            {replay(b.text, b.merges, upto).map((p, i) => (
              <span key={i} className={"bead" + (p.comp ? " comp" : "")}>
                {p.bytes.map(ch).join("")}
              </span>
            ))}
          </div>
          <div className="bpe-steps">
            {b.merges.map(([a, bb], k) => (
              <span key={k} className={"bstep" + (k < upto ? " done" : "")}>
                {k < upto ? (a <= 255 ? ch(a) : "⧉") + "⊕" + (bb <= 255 ? ch(bb) : "⧉") : "…"}
              </span>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
