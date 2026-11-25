import { PublicKey } from "@solana/web3.js";

// ---------------------------------------------------------------------------
// MagicBlock network (devnet) — Pack Blitz's OWN Anchor program.
// The VRF + Ephemeral Rollup program was MagicBlock's roll-dice example
// (roll-dice, https://roll-dice.magicblock.app/delegated); Pack Blitz now
// runs on its own program (Track 2) with the same interface.
//
// NOTE (25 Nov 2026): the own program's VRF callback is FIXED — the
// #[vrf_callback] macro's generated constraint code burned the whole CU
// budget; the diagnostic build checks the scoped VRF identity in-handler
// instead. Probe 25 Nov ~08:24 WIB: "callback entered, client_seed=8",
// 7,361 of 200,000 CU, ConstraintAddress only because the probe used a
// FAKE identity (correct rejection). Program ID 53K2...; programdata
// 370,352 B on-chain (was 370,397 B).
// ---------------------------------------------------------------------------
export const PROGRAM_ID = new PublicKey(
  "53K2NJcMTxk36mVecCnSXzX29NmytimWh6a591oYuZSU",
);
export const PLAYER_SEED = "playerd2";
export const ORACLE_QUEUE = new PublicKey(
  "5hBR571xnXppuCPveTrctfTU7tJLSN94nq7kv7FRK5Tc",
);
export const BASE_ENDPOINT = "https://rpc.magicblock.app/devnet";
export const ROUTER_ENDPOINT = "https://devnet-router.magicblock.app";
export const ROUTER_WS_ENDPOINT = "wss://devnet-router.magicblock.app";
export const ER_ENDPOINT = "https://devnet.magicblock.app";
export const ER_WS_ENDPOINT = "wss://devnet.magicblock.app";
export const MIN_BALANCE_LAMPORTS = 0.05;
export const BLOCKHASH_CACHE_MAX_AGE_MS = 30000;
export const BLOCKHASH_REFRESH_INTERVAL_MS = 15000;
export const ROLL_TIMEOUT_MS = 2000;
export const ROLL_RESULT_DEADLINE_MS = 30000;

// ---------------------------------------------------------------------------
// Pack Blitz game
// The VRF roll returns 1-6. Rarity mapping (weights sum to 6):
//   1-2 Common (33%) · 3-4 Rare (33%) · 5 Epic (17%) · 6 Legendary (17%)
// ---------------------------------------------------------------------------
export type Rarity = "common" | "rare" | "epic" | "legendary";

export const RARITY_FROM_ROLL: Record<number, Rarity> = {
  1: "common",
  2: "common",
  3: "rare",
  4: "rare",
  5: "epic",
  6: "legendary",
};

export const RARITY_META: Record<
  Rarity,
  { label: string; chance: string; gradient: string; glow: string; art: string }
> = {
  common: {
    label: "Common",
    chance: "33%",
    gradient: "linear-gradient(160deg,#8b9bb4,#5b6b82)",
    glow: "#8b9bb4",
    art: "art/common.jpg",
  },
  rare: {
    label: "Rare",
    chance: "33%",
    gradient: "linear-gradient(160deg,#3b82f6,#1d4ed8)",
    glow: "#3b82f6",
    art: "art/rare.jpg",
  },
  epic: {
    label: "Epic",
    chance: "17%",
    gradient: "linear-gradient(160deg,#a855f7,#7e22ce)",
    glow: "#a855f7",
    art: "art/epic.jpg",
  },
  legendary: {
    label: "Legendary",
    chance: "17%",
    gradient: "linear-gradient(160deg,#f59e0b,#b45309)",
    glow: "#f59e0b",
    art: "art/legendary.jpg",
  },
};

// Sealed pack artwork shown in the RIP PACKS hero panel.
export const PACK_ART = "art/pack.jpg";

export type PackCard = {
  id: string;
  name: string;
  rarity: Rarity;
  power: number;
  flavor: string;
};

// 4 cards per rarity — 16 to collect. Card index is picked deterministically
// from on-chain state (rollnum + roll), so the same roll history always
// reproduces the same collection.
export const CARD_POOL: Record<Rarity, PackCard[]> = {
  common: [
    { id: "c1", name: "Banana Trader", rarity: "common", power: 12, flavor: "Buys high, sells higher. Somehow." },
    { id: "c2", name: "Degen Hamster", rarity: "common", power: 9, flavor: "Runs on the wheel, trades on vibes." },
    { id: "c3", name: "Paper Hands Pete", rarity: "common", power: 7, flavor: "Sold the bottom. Twice." },
    { id: "c4", name: "Moon Bagger", rarity: "common", power: 14, flavor: "Still holding since 2021." },
  ],
  rare: [
    { id: "r1", name: "Slime Merchant", rarity: "rare", power: 31, flavor: "Sells packs, keeps the good ones." },
    { id: "r2", name: "Chart Wizard", rarity: "rare", power: 34, flavor: "Reads candles like bedtime stories." },
    { id: "r3", name: "Liquid Larry", rarity: "rare", power: 28, flavor: "Provides liquidity, takes profits." },
    { id: "r4", name: "Pump Pixie", rarity: "rare", power: 36, flavor: "Sprinkles green candles everywhere." },
  ],
  epic: [
    { id: "e1", name: "Golden Gorilla", rarity: "epic", power: 62, flavor: "Never sells. Never blinks." },
    { id: "e2", name: "Oracle Owl", rarity: "epic", power: 58, flavor: "Sees the VRF before it happens. Almost." },
    { id: "e3", name: "Neon Ninja", rarity: "epic", power: 65, flavor: "Strikes in 100 milliseconds." },
    { id: "e4", name: "Vault Viper", rarity: "epic", power: 60, flavor: "Guards the rollup. Hisses at gas fees." },
  ],
  legendary: [
    { id: "l1", name: "Wizardio", rarity: "legendary", power: 99, flavor: "The judge's choice. The myth itself." },
    { id: "l2", name: "Jungle King", rarity: "legendary", power: 97, flavor: "Every pack bows to the king." },
    { id: "l3", name: "The House", rarity: "legendary", power: 95, flavor: "The house always wins. You are the house." },
    { id: "l4", name: "Diamond Phoenix", rarity: "legendary", power: 100, flavor: "Burns, rises, moons. Repeat." },
  ],
};

export function cardForRoll(roll: number, rollnum: number): PackCard {
  const rarity = RARITY_FROM_ROLL[roll] ?? "common";
  const pool = CARD_POOL[rarity];
  const idx = (rollnum * 5 + roll * 3) % pool.length;
  return pool[idx];
}
