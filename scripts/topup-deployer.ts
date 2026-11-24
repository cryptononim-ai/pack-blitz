// One-off ops script: top up the CI deployer with 1 devnet SOL from the
// test wallet (the failed deploy's orphan buffer ate ~1.88 SOL in rent;
// the deployer is down to ~0.12 SOL). Devnet-only, zero value.
// HTTP polling for confirmation (websockets don't work via this VM's proxy).
import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const fromSecret = JSON.parse(fs.readFileSync("/home/hatch/workspace/blitz-pack/pack-blitz/scripts/test-keypair.json", "utf8"));
  const from = Keypair.fromSecretKey(Uint8Array.from(fromSecret));
  const to = new PublicKey("DTWs9DGezYJCR6si8BowyQi6x5FuqvfVoDnHHewjDaRn");
  const amount = 1 * LAMPORTS_PER_SOL;
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const bal = await conn.getBalance(from.publicKey);
  console.log("from:", from.publicKey.toBase58(), "balance:", bal / LAMPORTS_PER_SOL, "SOL");
  if (bal < amount + 0.01 * LAMPORTS_PER_SOL) throw new Error("insufficient balance");
  const tx = new Transaction().add(
    SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports: amount }),
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
  console.log("to balance now:", (await conn.getBalance(to)) / LAMPORTS_PER_SOL, "SOL");
  console.log("TOPUP DONE:", sig);
}

main().catch((e) => { console.error("TOPUP FAILED:", e); process.exit(1); });
