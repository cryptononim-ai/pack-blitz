import { Connection, Keypair, PublicKey, SystemProgram, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import fs from "fs";
async function main() {
  const conn = new Connection("https://api.devnet.solana.com", "confirmed");
  const from = Keypair.fromSecretKey(Uint8Array.from(JSON.parse(fs.readFileSync("scripts/test-keypair.json", "utf8"))));
  const to = new PublicKey("DTWs9DGezYJCR6si8BowyQi6x5FuqvfVoDnHHewjDaRn");
  const lamports = Math.round(0.8 * LAMPORTS_PER_SOL);
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const tx = new Transaction({ blockhash, lastValidBlockHeight, feePayer: from.publicKey })
    .add(SystemProgram.transfer({ fromPubkey: from.publicKey, toPubkey: to, lamports }));
  tx.sign(from);
  const sig = await conn.sendRawTransaction(tx.serialize());
  console.log("sig:", sig);
  for (let i = 0; i < 30; i++) {
    const st = await conn.getSignatureStatuses([sig]);
    if (st.value[0]?.confirmationStatus === "confirmed" || st.value[0]?.confirmationStatus === "finalized") { console.log("confirmed:", st.value[0].confirmationStatus); break; }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log("deployer now:", (await conn.getBalance(to)) / LAMPORTS_PER_SOL, "SOL");
  console.log("test now:", (await conn.getBalance(from.publicKey)) / LAMPORTS_PER_SOL, "SOL");
}
main().catch((e) => { console.error(e); process.exit(1); });
