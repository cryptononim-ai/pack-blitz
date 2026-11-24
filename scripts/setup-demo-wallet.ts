// One-off ops script: create the shared demo player wallet for the public
// Pack Blitz demo and fund it with 1 devnet SOL from the test wallet.
// Devnet-only, zero monetary value. HTTP polling for confirmation
// (websockets don't work through this VM's proxy).
// The demo keypair is intentionally embedded in the frontend bundle
// (src/lib/demo-keypair.ts) so any judge can open packs instantly — no
// faucet step (the public devnet faucet is closed). Anyone can drain the
// ~1 test SOL; worst case the demo stops opening packs until refilled.
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fromSecret = JSON.parse(fs.readFileSync("/home/hatch/workspace/blitz-pack/pack-blitz/scripts/test-keypair.json", "utf8"));
  const from = Keypair.fromSecretKey(Uint8Array.from(fromSecret));
  const demo = Keypair.generate();
  const amount = 1 * LAMPORTS_PER_SOL;
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");

  const bal = await conn.getBalance(from.publicKey);
  console.log("from:", from.publicKey.toBase58(), "balance:", bal / LAMPORTS_PER_SOL, "SOL");
  if (bal < amount + 0.01 * LAMPORTS_PER_SOL) throw new Error("insufficient balance");

  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: demo.publicKey, lamports: amount }),
  );
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = from.publicKey;
  tx.sign(from);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log("transfer sig:", sig);
  const deadline = Date.now() + 60000;
  while (Date.now() < deadline) {
    const res = await conn.getSignatureStatuses([sig]);
    const st = res.value[0];
    if (st?.err) throw new Error(`tx failed: ${JSON.stringify(st.err)}`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") break;
    await sleep(500);
  }
  console.log("demo balance now:", (await conn.getBalance(demo.publicKey)) / LAMPORTS_PER_SOL, "SOL");
  console.log("TRANSFER DONE:", sig);
  console.log("DEMO_ADDRESS:", demo.publicKey.toBase58());
  console.log("DEMO_SECRET_JSON:", JSON.stringify(Array.from(demo.secretKey)));
  fs.writeFileSync("/home/hatch/workspace/blitz-pack/.secrets/demo-keypair.json", JSON.stringify(Array.from(demo.secretKey)));
  fs.chmodSync("/home/hatch/workspace/blitz-pack/.secrets/demo-keypair.json", 0o600);
  console.log("demo keypair backup saved to ~/workspace/blitz-pack/.secrets/demo-keypair.json (0600)");
}

main().catch((e) => { console.error("SETUP FAILED:", e); process.exit(1); });
