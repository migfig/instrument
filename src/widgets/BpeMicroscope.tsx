// BPE microscope (US5, FR-013): merge-step animation driven by the token's
// real `merges` history from the prefill events. When `merges` is omitted
// (single-byte token or unavailable — R6 fallback) this is the declared
// no-data state: the final token as one bead, never an invented history.
import { useEffect, useRef, useState } from "react";
import { useRun } from "../state/run";

interface Piece { bytes: number[]; comp: boolean }

// Re-derive the piece row after `upto` merges. Base bytes are ids 0..255
// (byte == id); composite pieces are previous merge results — a child id
// <= 255 must match a bare byte bead, a higher id must match a composite
// piece (first occurrence, in merge order).
function replay(text: string, merges: number[][], upto: number): Piece[] {
  const bytes = new TextEncoder().encode(text);
  let pieces: Piece[] = Array.from(bytes, b => ({ bytes: [b], comp: false }));
  for (let k = 0; k < Math.min(upto, merges.length); k++) {
    const [a, b] = merges[k];
    const ok = (p: Piece, v: number) =>
      v <= 255 ? !p.comp && p.bytes[0] === v : p.comp;
    const i = pieces.findIndex(
      (p, j) => j < pieces.length - 1 && ok(p, a) && ok(pieces[j + 1], b));
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

const ch = (b: number) =>
  b >= 32 && b < 127 ? String.fromCharCode(b) : "·";

export default function BpeMicroscope() {
  const s = useRun();
  const [upto, setUpto] = useState(0);
  const key = s.bpe ? `${s.bpe.index}:${s.bpe.text}` : "none";
  const ref = useRef(key);
  if (ref.current !== key) { ref.current = key; setUpto(0); }

  useEffect(() => {
    const merges = s.bpe?.merges ?? null;
    if (!merges) return;
    const id = setInterval(() => {
      setUpto(u => (u < merges.length ? u + 1 : u));
    }, 450);
    return () => clearInterval(id);
  }, [key, s.bpe?.merges]);

  const b = s.bpe;
  if (!b) {
    return <div className="panel bpe-micro" data-testid="bpe-micro">
      <span className="dim">token build…</span></div>;
  }
  if (!b.merges) {
    return <div className="panel bpe-micro" data-testid="bpe-micro">
      <span className="bpe-tok">“{b.text}”</span>
      <span className="dim">no merge history (single byte or unavailable)</span>
    </div>;
  }
  const pieces = replay(b.text, b.merges, upto);
  return <div className="panel bpe-micro" data-testid="bpe-micro">
    <div className="bpe-row">
      {pieces.map((p, i) => (
        <span key={i} className={"bead" + (p.comp ? " comp" : "")}>
          {p.bytes.map(ch).join("")}
        </span>
      ))}
    </div>
    <div className="bpe-steps">
      {b.merges.map(([a, bb], k) => (
        <span key={k} className={"bstep" + (k < upto ? " done" : "")}>
          {k < upto ? (a <= 255 ? ch(a) : "⧉") + "⊕" + (bb <= 255 ? ch(bb) : "⧉")
            : "…"}
        </span>
      ))}
    </div>
  </div>;
}
