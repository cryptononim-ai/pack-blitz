# Pack Blitz program (Anchor)

The on-chain program for Pack Blitz — Solana Blitz v10.

- `initialize` — create the player PDA (`[b"playerd2", user]`).
- `open_pack` — request VRF randomness (MagicBlock VRF, ephemeral queue).
- `callback_open_pack` — VRF callback; stores the 1-6 roll + bumps `rollnum`.
- `delegate` / `undelegate` — move the player PDA to/from an Ephemeral Rollup.

## Build & deploy

Local builds need Rust 1.89 + Solana 3.1.9 + Anchor 1.0.2, which the ONI
build VM cannot download (rust-lang.org / release.anza.xyz are blocked).
Deploy from GitHub Actions instead — see
`.github/workflows/deploy-program.yml`. It needs two repo secrets:

- `SOLANA_DEPLOY_KEYPAIR` — deployer wallet secret key (JSON array), devnet only.
- `SOLANA_PROGRAM_KEYPAIR` — program keypair secret key (JSON array).

Program ID (devnet): `53K2NJcMTxk36mVecCnSXzX29NmytimWh6a591oYuZSU`

After a successful deploy the workflow commits `target/idl/pack_blitz.json`
back to the repo; copy it to `src/lib/idl/pack_blitz.json` and set
`PROGRAM_ID` in `src/lib/config.ts` to switch the frontend from MagicBlock's
demo program to our own.
