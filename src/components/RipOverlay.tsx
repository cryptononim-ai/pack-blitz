import { useRef, useState } from "react";
import { PACK_ART, RARITY_META } from "../lib/config";
import { FlipCard } from "./PackCard";
import { usePackBlitz } from "../lib/packblitz";

const BASE = import.meta.env.BASE_URL;

type Game = ReturnType<typeof usePackBlitz>;

/**
 * Full-screen rip moment, packs.com style: vivid purple stage, big pack,
 * drag the seal strip up to peel. The VRF roll runs in the background
 * (started by the OPEN PACK button); the card reveals once the peel is
 * done AND the roll has landed.
 */
export function RipOverlay({ game, onClose }: { game: Game; onClose: () => void }) {
  // The result from the previous pack (if any) must not count as this pack.
  const startSig = useRef(game.lastResult?.signature ?? null);
  const fresh =
    game.lastResult && game.lastResult.signature !== startSig.current
      ? game.lastResult
      : null;

  const [progress, setProgress] = useState(0); // 0..1 drag progress
  const [dragging, setDragging] = useState(false);
  const [peelDone, setPeelDone] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const startY = useRef(0);
  const startP = useRef(0);
  const downAt = useRef(0);

  const revealed = peelDone && fresh !== null;

  const onPointerDown = (e: React.PointerEvent) => {
    if (peelDone) return;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    startY.current = e.clientY;
    startP.current = progress;
    downAt.current = Date.now();
    setDragging(true);
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragging || peelDone) return;
    const p = Math.min(1, Math.max(0, startP.current + (startY.current - e.clientY) / 220));
    setProgress(p);
  };
  const onPointerUp = (e: React.PointerEvent) => {
    if (!dragging) return;
    setDragging(false);
    const moved = Math.abs(e.clientY - startY.current);
    const quickTap = moved < 12 && Date.now() - downAt.current < 400;
    if (progress >= 0.4 || quickTap) {
      setProgress(1);
      setPeelDone(true);
    } else {
      setProgress(0);
    }
  };

  const p = progress;
  const stripOpacity = p < 0.7 ? 1 : 1 - (p - 0.7) / 0.3;
  const burstOpacity =
    p < 0.15 ? 0 : p < 0.5 ? (p - 0.15) / 0.35 : Math.max(0, 1 - (p - 0.5) / 0.4);
  const peekOpacity = p < 0.15 ? 0 : Math.min(1, (p - 0.15) / 0.3);
  const peekY = 130 - 164 * Math.max(0, (p - 0.2) / 0.8);
  const anim = dragging ? "none" : "transform 0.3s ease, opacity 0.3s ease";

  return (
    <div className="rip-overlay" role="dialog" aria-label="Open a pack">
      <button className="rip-close" onClick={onClose} aria-label="Close">
        ←
      </button>
      <div className="rip-kicker">CARDS FROM</div>
      <div className="rip-title">PACK BLITZ</div>

      {!revealed && (
        <>
          <div className="rip-hint">
            <span className="rip-hand" aria-hidden>
              ↑
            </span>
            Peel back to unlock cards
          </div>
          <div
            className="rip-pack-zone"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <span className="sparkle" style={{ top: "4%", left: "10%", animationDelay: "0s" }} aria-hidden />
            <span className="sparkle" style={{ top: "10%", right: "8%", animationDelay: "0.5s", width: 18, height: 18 }} aria-hidden />
            <span className="sparkle" style={{ bottom: "14%", left: "6%", animationDelay: "0.9s", width: 12, height: 12 }} aria-hidden />
            <span className="sparkle" style={{ bottom: "24%", right: "4%", animationDelay: "1.3s", width: 22, height: 22 }} aria-hidden />
            <div className="pack-peel" style={{ transform: `rotate(${-2 - 6 * p}deg)` }}>
              <div className="pack-inside" aria-hidden />
              <img className="pack-base" src={`${BASE}${PACK_ART}`} alt="" aria-hidden />
              <img
                className="pack-flap"
                src={`${BASE}${PACK_ART}`}
                alt=""
                aria-hidden
                style={{
                  transform: `rotate(${-48 * p}deg) translate(${70 * p}px, ${-130 * p}px) rotateY(${-40 * p}deg)`,
                  opacity: stripOpacity,
                  transition: anim,
                }}
              />
              <div
                className="peel-flash"
                aria-hidden
                style={{
                  opacity: burstOpacity,
                  transform: `translateX(-50%) scale(${0.4 + 0.9 * p})`,
                  transition: anim,
                }}
              />
              <div
                className="pack-peek"
                aria-hidden
                style={{
                  transform: `translateX(-50%) translateY(${peekY}px) rotate(4deg)`,
                  opacity: peekOpacity,
                  transition: anim,
                }}
              >
                <span className="peek-mark">⚡</span>
                <span className="peek-label">PACK BLITZ</span>
              </div>
            </div>
          </div>
          <div className="rip-waiting">
            {peelDone
              ? "Opening… VRF draw running on the rollup"
              : "Drag the top of the pack up — or tap it"}
          </div>
          {game.error && <div className="rip-error">{game.error}</div>}
        </>
      )}

      {revealed && fresh && (
        <div className="rip-reveal">
          <div className="rip-count">
            PACK #{fresh.rollnum} · DICE {fresh.roll} · {fresh.latencyMs}MS
          </div>
          <FlipCard
            card={fresh.card}
            isNew
            flipped={flipped}
            onFlip={() => setFlipped(true)}
          />
          {!flipped && <div className="rip-hint">Tap card to Reveal!</div>}
          {!flipped && (
            <button className="rip-flip-btn" onClick={() => setFlipped(true)}>
              ↻ FLIP IT!
            </button>
          )}
          {flipped && (
            <div className="rip-reveal-name">
              {fresh.card.name} · {RARITY_META[fresh.card.rarity].label} · POWER{" "}
              {fresh.card.power}
            </div>
          )}
          <button className="rip-next" onClick={onClose}>
            View Next Card
          </button>
        </div>
      )}
    </div>
  );
}
