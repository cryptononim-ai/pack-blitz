import { RARITY_META } from "../lib/config";
import type { PackCard } from "../lib/config";

const BASE = import.meta.env.BASE_URL;
const artUrl = (p: string) => `${BASE}${p}`;

export function PackCardView({
  card,
  isNew,
  size = "large",
  shine = false,
}: {
  card: PackCard;
  isNew?: boolean;
  size?: "large" | "small";
  /** Fresh pull: card flies in + shines. */
  shine?: boolean;
}) {
  const meta = RARITY_META[card.rarity];
  return (
    <div
      className={`pack-card ${size}${shine ? " shining" : ""}`}
      style={{
        borderColor: meta.glow,
        boxShadow: `0 0 32px ${meta.glow}66`,
        ["--glow" as string]: meta.glow,
      }}
    >
      <img className="card-img" src={artUrl(meta.art)} alt={card.name} />
      <div className="card-overlay">
        <div className="card-rarity" style={{ background: meta.glow, color: "#0b0d12" }}>
          {meta.label}
        </div>
        <div className="card-name">{card.name}</div>
        <div className="card-flavor">{card.flavor}</div>
        <div className="card-power">POWER {card.power}</div>
      </div>
      {shine && <div className="card-shine" aria-hidden />}
      {shine && <div className="card-flash" aria-hidden />}
      {isNew && <div className="card-new">NEW!</div>}
    </div>
  );
}

export function CardBack({ glow }: { glow: string }) {
  return (
    <div
      className="card-back"
      style={{ ["--glow" as string]: glow }}
    >
      <div className="back-mark">
        <svg viewBox="0 0 24 24" fill="none" aria-hidden>
          <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" fill="#f5b90b" />
        </svg>
      </div>
      <div className="back-title">PACK BLITZ</div>
      <div className="back-hint">TAP TO REVEAL</div>
    </div>
  );
}

/** Tap-to-flip reveal: card back first, tap flips to the front (packs.com loop). */
export function FlipCard({
  card,
  isNew,
  flipped,
  onFlip,
}: {
  card: PackCard;
  isNew?: boolean;
  flipped: boolean;
  onFlip: () => void;
}) {
  const meta = RARITY_META[card.rarity];
  return (
    <div
      className={`flip-card flying${flipped ? " flipped" : ""}`}
      onClick={onFlip}
      role="button"
      aria-label={flipped ? card.name : "Tap card to reveal"}
    >
      <div className="flip-inner">
        <div className="flip-face back">
          <CardBack glow={meta.glow} />
        </div>
        <div className="flip-face front">
          <PackCardView card={card} isNew={isNew} shine={flipped} />
        </div>
      </div>
    </div>
  );
}

export function CardSlot({
  card,
  owned,
}: {
  card: PackCard;
  owned: boolean;
}) {
  const meta = RARITY_META[card.rarity];
  return (
    <div
      className={`card-slot ${owned ? "owned" : "locked"}`}
      style={
        owned
          ? { borderColor: meta.glow, boxShadow: `0 0 16px ${meta.glow}44` }
          : undefined
      }
      title={owned ? `${card.name} — ${meta.label}` : `??? — ${meta.label}`}
    >
      <div className="slot-img-wrap">
        <img className="slot-img" src={artUrl(meta.art)} alt={owned ? card.name : "locked card"} />
        {!owned && <div className="slot-lock">?</div>}
      </div>
      <div className="slot-name">{owned ? card.name : "???"}</div>
      <div className="slot-meta">
        <span className="slot-rarity" style={{ color: meta.glow }}>
          {meta.label}
        </span>
        <span className="slot-odds">{meta.chance}</span>
      </div>
      <div className="slot-power">PWR {card.power}</div>
    </div>
  );
}
