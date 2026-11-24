// End-to-end on-chain smoke test for Pack Blitz (devnet).
// Flow: keypair -> airdrop -> initialize player PDA -> delegate to closest
// ER validator -> roll (VRF) on the Ephemeral Rollup -> await callback.
// Prints the roll result + latency. Exits 0 on success, 1 on failure.
//
// Devnet-only test keypair lives at scripts/test-keypair.json (created on
// first run, chmod 600). It holds worthless devnet SOL only.
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, Transaction, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import idlJson from "../src/lib/idl/random_dice_delegated.json";
import { loadIdl, walletAdapterFrom, ensureFunds } from "../src/lib/solana-utils";
import {
  PROGRAM_ID,
  PLAYER_SEED,
  ORACLE_QUEUE,
  BASE_ENDPOINT,
  ROUTER_ENDPOINT,
  ROUTER_WS_ENDPOINT,
  ER_ENDPOINT,
  ER_WS_ENDPOINT,
  RARITY_FROM_ROLL,
  cardForRoll,
} from "../src/lib/config";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const KEYPAIR_PATH = path.join(__dirname, "test-keypair.json");

function loadOrCreateTestKeypair(): Keypair {
  if (fs.existsSync(KEYPAIR_PATH)) {
    const raw = JSON.parse(fs.readFileSync(KEYPAIR_PATH, "utf8"));
    return Keypair.fromSecretKey(Uint8Array.from(raw));
  }
  const kp = Keypair.generate();
  fs.writeFileSync(KEYPAIR_PATH, JSON.stringify(Array.from(kp.secretKey)));
  fs.chmodSync(KEYPAIR_PATH, 0o600);
  console.log("created test keypair:", kp.publicKey.toBase58());
  return kp;
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// HTTP-only send + confirm. The VM's egress proxy breaks websockets, so
// web3.js ws-based confirmTransaction always times out here — even though
// the transaction itself lands fine. Poll getSignatureStatuses instead.
async function sendAndConfirmHttp(
  conn: Connection,
  tx: Transaction,
  signers: Keypair[],
  timeoutMs = 60000,
): Promise<string> {
  const { blockhash } = await conn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = signers[0].publicKey;
  tx.sign(...signers);
  const sig = await conn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const res = await conn.getSignatureStatuses([sig]);
    const st = res.value[0];
    if (st?.err) throw new Error(`tx failed: ${JSON.stringify(st.err)} (${sig})`);
    if (st?.confirmationStatus === "confirmed" || st?.confirmationStatus === "finalized") {
      return sig;
    }
    await sleep(500);
  }
  throw new Error(`tx not confirmed in ${timeoutMs}ms: ${sig}`);
}

async function main() {
  const kp = loadOrCreateTestKeypair();
  console.log("player:", kp.publicKey.toBase58());

  const baseConn = new Connection(BASE_ENDPOINT, "confirmed");
  try {
    await ensureFunds(baseConn, kp);
  } catch (e) {
    console.log("airdrop via magicblock RPC failed, trying api.devnet.solana.com");
    const devConn = new Connection("https://api.devnet.solana.com", "confirmed");
    const bal = await devConn.getBalance(kp.publicKey);
    if (bal < 0.05 * LAMPORTS_PER_SOL) {
      const sig = await devConn.requestAirdrop(kp.publicKey, LAMPORTS_PER_SOL);
      await devConn.confirmTransaction(sig, "confirmed");
    }
  }
  console.log("balance:", (await baseConn.getBalance(kp.publicKey)) / LAMPORTS_PER_SOL, "SOL");

  const provider = new anchor.AnchorProvider(
    baseConn,
    walletAdapterFrom(kp),
    anchor.AnchorProvider.defaultOptions(),
  );
  const idl = await loadIdl(PROGRAM_ID, provider, idlJson);
  const program = new anchor.Program(idl, provider);

  const [pda] = PublicKey.findProgramAddressSync(
    [Buffer.from(PLAYER_SEED), kp.publicKey.toBuffer()],
    PROGRAM_ID,
  );
  console.log("player PDA:", pda.toBase58());

  let account = await baseConn.getAccountInfo(pda);
  if (!account) {
    console.log("initializing player PDA...");
    const initTx = await program.methods.initialize().transaction();
    await sendAndConfirmHttp(baseConn, initTx, [kp]);
    account = await baseConn.getAccountInfo(pda);
    console.log("initialized.");
  }
  const startState = program.coder.accounts.decode("player", account!.data) as {
    lastResult: number;
    rollnum: number;
  };
  console.log("start state:", JSON.stringify(startState));

  // --- Delegate to the closest ER validator ---
  const router = new ConnectionMagicRouter(ROUTER_ENDPOINT, {
    wsEndpoint: ROUTER_WS_ENDPOINT,
  });
  let status = (await router.getDelegationStatus(pda)) as {
    isDelegated: boolean;
    fqdn?: string;
  };
  console.log("delegation status:", JSON.stringify(status));
  if (!status.isDelegated) {
    const v = await router.getClosestValidator();
    console.log("closest validator:", JSON.stringify(v));
    if (!v.identity || !v.fqdn) throw new Error("no validator identity/fqdn");
    const delTx = await program.methods
      .delegate()
      .accounts({ user: kp.publicKey })
      .remainingAccounts([
        { pubkey: new PublicKey(v.identity), isSigner: false, isWritable: false },
      ])
      .transaction();
    await sendAndConfirmHttp(baseConn, delTx, [kp]);
    console.log("delegate tx sent, polling status...");
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      await sleep(1000);
      status = (await router.getDelegationStatus(pda)) as {
        isDelegated: boolean;
        fqdn?: string;
      };
      if (status.isDelegated) break;
    }
    if (!status.isDelegated) throw new Error("delegation timed out");
    console.log("delegated to:", status.fqdn);
  }

  // --- Roll on the ER ---
  const fqdn = status.fqdn ?? ER_ENDPOINT;
  const wsEndpoint = fqdn.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
  const ephConn = new Connection(fqdn, { wsEndpoint, commitment: "processed" });
  const ephProvider = new anchor.AnchorProvider(
    ephConn,
    walletAdapterFrom(kp),
    anchor.AnchorProvider.defaultOptions(),
  );
  const ephProgram = new anchor.Program(idl, ephProvider);

  const seed = Math.floor(Math.random() * 256);
  const t0 = Date.now();
  const tx = await ephProgram.methods
    .rollDiceDelegated(seed)
    .accounts({ payer: kp.publicKey, player: pda, oracleQueue: ORACLE_QUEUE })
    .transaction();
  const { blockhash } = await ephConn.getLatestBlockhash();
  tx.recentBlockhash = blockhash;
  tx.feePayer = kp.publicKey;
  tx.sign(kp);
  const sig = await ephConn.sendRawTransaction(tx.serialize(), { skipPreflight: true });
  console.log("roll tx sent:", sig, "| seed:", seed);

  const deadline = Date.now() + 30000;
  let result: { lastResult: number; rollnum: number } | null = null;
  while (Date.now() < deadline) {
    await sleep(250);
    const acc = await ephConn.getAccountInfo(pda, "processed");
    if (!acc) continue;
    const cur = ephProgram.coder.accounts.decode("player", acc.data) as {
      lastResult: number;
      rollnum: number;
    };
    if (cur.rollnum > startState.rollnum && cur.lastResult > 0) {
      result = cur;
      break;
    }
  }
  if (!result) throw new Error("VRF callback timed out (30s)");

  const latency = Date.now() - t0;
  const card = cardForRoll(result.lastResult, result.rollnum);
  console.log("------------------------------------------------");
  console.log("ROLL RESULT:", result.lastResult, "| rollnum:", result.rollnum);
  console.log("RARITY:", RARITY_FROM_ROLL[result.lastResult]);
  console.log("CARD:", card.name, `(${card.rarity}, power ${card.power})`);
  console.log("LATENCY (tx send -> callback observed):", latency, "ms");
  console.log("EXPLORER: https://explorer.solana.com/tx/" + sig + "?cluster=custom&customUrl=" + encodeURIComponent(fqdn));
  console.log("SMOKE TEST PASSED");
}

main().catch((e) => {
  console.error("SMOKE TEST FAILED:", e);
  process.exit(1);
});
