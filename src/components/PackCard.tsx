import { RARITY_META } from "../lib/config";
import type { PackCard } from "../lib/config";

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
      style={{ background: meta.gradient, boxShadow: `0 0 24px ${meta.glow}55` }}
    >
      <div className="card-rarity">{meta.label}</div>
      <div className="card-art">{card.name.charAt(0)}</div>
      <div className="card-name">{card.name}</div>
      <div className="card-flavor">{card.flavor}</div>
      <div className="card-power">POWER {card.power}</div>
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
          ? { background: meta.gradient, boxShadow: `0 0 14px ${meta.glow}44` }
          : undefined
      }
      title={owned ? `${card.name} — ${meta.label}` : `??? — ${meta.label}`}
    >
      <div className="slot-art">{owned ? card.name.charAt(0) : "?"}</div>
      <div className="slot-name">{owned ? card.name : "???"}</div>
      <div className="slot-rarity">{meta.label}</div>
    </div>
  );
}
