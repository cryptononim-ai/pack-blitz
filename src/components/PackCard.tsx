import { RARITY_META } from "../lib/config";
import type { PackCard } from "../lib/config";

const BASE = import.meta.env.BASE_URL;
const artUrl = (p: string) => `${BASE}${p}`;

export function PackCardView({
  card,
  isNew,
  size = "large",
}: {
  card: PackCard;
  isNew?: boolean;
  size?: "large" | "small";
}) {
  const meta = RARITY_META[card.rarity];
  return (
    <div
      className={`pack-card ${size}`}
      style={{ borderColor: meta.glow, boxShadow: `0 0 32px ${meta.glow}66` }}
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
      {isNew && <div className="card-new">NEW!</div>}
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
