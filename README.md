# Pack Blitz

**Open packs. Beat the odds. Own the loot.**

Pack Blitz is a real-time pack-opening game built for **Solana Blitz v10**
(Entertainment Finance). Every pack is a verifiable random draw executed on
a MagicBlock **Ephemeral Rollup** — gasless, in about 100 milliseconds — using
MagicBlock **VRF**. 16 collectible cards across 4 rarities (Common, Rare,
Epic, Legendary).

- 🎮 **Live demo (devnet):** _(GitHub Pages URL after first deploy)_
- 🏆 **Hackathon:** Solana Blitz v10, 20–27 Nov 2026 — submit at
  https://build.magicblock.app/?stage=blitz#submit
- 📺 **Demo video:** _(link after recording)_

## How it works

1. **Delegate.** Your player account moves onto a MagicBlock Ephemeral
   Rollup — transactions there are gasless and confirm in milliseconds.
2. **Open.** Each pack requests randomness from MagicBlock VRF (free inside
   the rollup). An oracle proves the draw; nobody can rig it.
3. **Reveal.** The VRF callback writes your 1–6 roll on-chain. The roll maps
   to a rarity (1–2 Common, 3–4 Rare, 5 Epic, 6 Legendary) and the card is
   picked deterministically from on-chain state (`rollnum`).
4. **Commit.** Undelegate any time to sync your packs back to Solana base layer.

## The program

The game runs against MagicBlock's official roll-dice **delegated** program
on devnet (`nkPMzRtKV4feTsDfst5P6sH8Rzf4VNe3p9Y1MzMiAme`) — the same program
behind https://roll-dice.magicblock.app/delegated — because the build
environment cannot compile Rust (see below). Pack Blitz's **own** Anchor
program lives in `anchor/` (identical interface, `open_pack` /
`callback_open_pack` instead of `roll_dice_delegated` /
`callback_roll_dice_simple`) and deploys to devnet via GitHub Actions
(`.github/workflows/deploy-program.yml`). Switching the frontend to our own
program is a one-constant change (`PROGRAM_ID` in `src/lib/config.ts` +
the generated IDL in `src/lib/idl/`).

Program ID (own program, devnet):
`53K2NJcMTxk36mVecCnSXzX29NmytimWh6a591oYuZSU`

## Run it locally

```bash
npm install
npm run dev        # Vite dev server
npm run build      # production build -> dist/
```

The app generates a devnet player keypair in your browser (localStorage)
and funds it with a devnet airdrop when possible. The public RPC faucet is
currently closed, so if the wallet is empty, fund it free at
https://solfaucet.com or https://faucet.solana.com and press Retry.

## Smoke test (on-chain, devnet)

```bash
npx tsx scripts/smoke-test.ts
```

Initializes the player PDA, delegates to the closest ER validator, opens
one pack via VRF, and prints the roll, the card, and the latency.

## Why this stack

- **Ephemeral Rollups** — pack opens are high-frequency, low-value
  interactions. On base layer each would cost a fee and a confirmation
  wait; on the rollup they are gasless and ~100ms.
- **VRF** — pack odds must be provably fair. Blockhash randomness can be
  predicted or manipulated; VRF comes with a cryptographic proof.
- **Session-style UX** — the demo keypair signs once per session; opening
  packs needs no wallet popup per pack (the same pattern as MagicBlock's
  session keys).

## Credits

- Pack-opening flow, delegation wiring, and IDL adapted from MagicBlock's
  official roll-dice example
  (https://github.com/magicblock-labs/magicblock-engine-examples/tree/main/roll-dice/anchor/app,
  MIT).
- MagicBlock docs: https://docs.magicblock.gg

## Disclaimer

Devnet demo. Packs are free, cards have no monetary value, and the demo
player keypair lives in your browser's localStorage. Never use a mainnet
keypair here.
