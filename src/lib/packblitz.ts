// Pack Blitz game engine — React hook wrapping the MagicBlock
// Ephemeral Rollup + VRF flow (adapted from the official roll-dice
// delegated example, simplified to a single in-flight pack open).
import { useCallback, useEffect, useRef, useState } from "react";
import * as anchor from "@coral-xyz/anchor";
import { Connection, Keypair, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { ConnectionMagicRouter } from "@magicblock-labs/ephemeral-rollups-sdk";
import idlJson from "./idl/random_dice_delegated.json";
import { DEMO_SECRET } from "./demo-keypair";
import {
  loadIdl,
  walletAdapterFrom,
  loadOrCreateKeypair,
  ensureFunds,
} from "./solana-utils";
import {
  PROGRAM_ID,
  PLAYER_SEED,
  ORACLE_QUEUE,
  BASE_ENDPOINT,
  ROUTER_ENDPOINT,
  ROUTER_WS_ENDPOINT,
  ER_ENDPOINT,
  RARITY_FROM_ROLL,
  cardForRoll,
} from "./config";
import type { PackCard } from "./config";

export type Phase =
  | "loading"
  | "needs-funds"
  | "ready"
  | "rolling"
  | "error";

export type PackResult = {
  roll: number;
  rollnum: number;
  card: PackCard;
  latencyMs: number;
  signature: string;
};

export type HistoryEntry = PackResult & { at: number };

const KEYPAIR_KEY = "packblitz-keypair";
const COLLECTION_KEY = "packblitz-collection";
const HISTORY_KEY = "packblitz-history";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function loadCollection(): string[] {
  try {
    return JSON.parse(localStorage.getItem(COLLECTION_KEY) ?? "[]") as string[];
  } catch {
    return [];
  }
}

function loadHistory(): HistoryEntry[] {
  try {
    return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]") as HistoryEntry[];
  } catch {
    return [];
  }
}

export function usePackBlitz() {
  const [phase, setPhase] = useState<Phase>("loading");
  const [status, setStatus] = useState("Starting up…");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState<number | null>(null);
  const [isDelegated, setIsDelegated] = useState(false);
  const [ephemeralEndpoint, setEphemeralEndpoint] = useState<string | null>(null);
  const [packsOpened, setPacksOpened] = useState(0);
  const [lastResult, setLastResult] = useState<PackResult | null>(null);
  const [lastLatency, setLastLatency] = useState<number | null>(null);
  const [history, setHistory] = useState<HistoryEntry[]>(() => loadHistory());
  const [collection, setCollection] = useState<string[]>(() => loadCollection());
  const [error, setError] = useState<string | null>(null);

  const keypairRef = useRef<Keypair | null>(null);
  const programRef = useRef<anchor.Program | null>(null);
  const ephProgramRef = useRef<anchor.Program | null>(null);
  const baseConnRef = useRef<Connection | null>(null);
  const ephConnRef = useRef<Connection | null>(null);
  const routerRef = useRef<ConnectionMagicRouter | null>(null);
  const pdaRef = useRef<PublicKey | null>(null);
  const rollnumRef = useRef(0);
  const lastRollRef = useRef(0);
  const subIdRef = useRef<number | null>(null);
  const initStartedRef = useRef(false);
  const rollingRef = useRef(false);

  const persistCollection = useCallback((ids: string[]) => {
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(ids));
  }, []);

  const persistHistory = useCallback((entries: HistoryEntry[]) => {
    localStorage.setItem(HISTORY_KEY, JSON.stringify(entries.slice(0, 20)));
  }, []);

  const refreshBalance = useCallback(async () => {
    if (!baseConnRef.current || !keypairRef.current) return;
    const lamports = await baseConnRef.current.getBalance(
      keypairRef.current.publicKey,
    );
    setBalance(lamports / LAMPORTS_PER_SOL);
  }, []);

  const pollDelegation = useCallback(
    async (want: boolean, timeoutMs = 30000): Promise<boolean> => {
      const router = routerRef.current;
      const pda = pdaRef.current;
      if (!router || !pda) return false;
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        try {
          const s = (await router.getDelegationStatus(pda)) as {
            isDelegated: boolean;
            fqdn?: string;
          };
          if (s.isDelegated === want) return true;
        } catch {
          // keep polling
        }
        await sleep(1000);
      }
      return false;
    },
    [],
  );

  const setupEphemeral = useCallback(async (fqdn: string | null) => {
    const kp = keypairRef.current;
    const pda = pdaRef.current;
    const idl = (programRef.current as anchor.Program | null)?.idl;
    if (!kp || !pda || !idl) return false;
    const endpoint = fqdn ?? ER_ENDPOINT;
    const wsEndpoint = endpoint.replace(/^https:\/\//, "wss://").replace(/^http:\/\//, "ws://");
    const conn = new Connection(endpoint, {
      wsEndpoint,
      commitment: "processed",
    });
    const provider = new anchor.AnchorProvider(
      conn,
      walletAdapterFrom(kp),
      anchor.AnchorProvider.defaultOptions(),
    );
    const ephProgram = new anchor.Program(idl, provider);
    if (subIdRef.current !== null && ephConnRef.current) {
      ephConnRef.current.removeAccountChangeListener(subIdRef.current).catch(() => undefined);
    }
    ephConnRef.current = conn;
    ephProgramRef.current = ephProgram;
    setEphemeralEndpoint(endpoint);
    subIdRef.current = conn.onAccountChange(
      pda,
      (info) => {
        try {
          const cur = ephProgram.coder.accounts.decode("player", info.data) as {
            lastResult: number;
            rollnum: number;
          };
          rollnumRef.current = cur.rollnum;
          lastRollRef.current = cur.lastResult;
          setPacksOpened(cur.rollnum);
        } catch {
          // ignore decode errors from stale snapshots
        }
      },
      "processed",
    );
    // Fresh loads must read the LIVE rollup state: the base-layer account
    // is stale while the PDA is delegated, so the packs-opened counter
    // would otherwise show 0 until the next roll.
    try {
      const acc = await conn.getAccountInfo(pda, "processed");
      if (acc) {
        const cur = ephProgram.coder.accounts.decode("player", acc.data) as {
          lastResult: number;
          rollnum: number;
        };
        rollnumRef.current = cur.rollnum;
        lastRollRef.current = cur.lastResult;
        setPacksOpened(cur.rollnum);
      }
    } catch {
      // subscription above will correct the counter on the next roll
    }
    return true;
  }, []);

  const delegate = useCallback(async (): Promise<boolean> => {
    const program = programRef.current;
    const router = routerRef.current;
    const kp = keypairRef.current;
    if (!program || !router || !kp) return false;
    try {
      setStatus("Finding the closest Ephemeral Rollup validator…");
      const v = await router.getClosestValidator();
      if (!v.identity || !v.fqdn) throw new Error("no validator found");
      await program.methods
        .delegate()
        .accounts({ user: kp.publicKey })
        .remainingAccounts([
          { pubkey: new PublicKey(v.identity), isSigner: false, isWritable: false },
        ])
        .rpc();
      setStatus("Delegating your player account to the rollup…");
      const ok = await pollDelegation(true);
      if (!ok) throw new Error("delegation timed out");
      setIsDelegated(true);
      await setupEphemeral(v.fqdn);
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    }
  }, [pollDelegation, setupEphemeral]);

  const init = useCallback(async () => {
    if (initStartedRef.current) return;
    initStartedRef.current = true;
    try {
      setPhase("loading");
      // Public demo: every visitor plays as the shared, pre-funded demo
      // player (devnet test SOL only) — no faucet step, packs open instantly.
      // Falls back to a per-browser keypair if the demo key is ever removed.
      setStatus("Loading the demo player…");
      const kp =
        DEMO_SECRET.length === 64
          ? Keypair.fromSecretKey(Uint8Array.from(DEMO_SECRET))
          : loadOrCreateKeypair(KEYPAIR_KEY);
      keypairRef.current = kp;
      setAddress(kp.publicKey.toBase58());

      const baseConn = new Connection(BASE_ENDPOINT, "confirmed");
      baseConnRef.current = baseConn;

      setStatus("Checking devnet SOL balance…");
      try {
        await ensureFunds(baseConn, kp);
      } catch (e) {
        // The public RPC faucet is closed; the player must be funded via
        // https://solfaucet.com or https://faucet.solana.com.
        const bal = await baseConn.getBalance(kp.publicKey);
        setBalance(bal / LAMPORTS_PER_SOL);
        if (bal < 0.05 * LAMPORTS_PER_SOL) {
          setPhase("needs-funds");
          setStatus("This player needs devnet SOL to play.");
          setError(e instanceof Error ? e.message : String(e));
          return;
        }
      }
      await refreshBalance();

      setStatus("Connecting to the Pack Blitz program…");
      const provider = new anchor.AnchorProvider(
        baseConn,
        walletAdapterFrom(kp),
        anchor.AnchorProvider.defaultOptions(),
      );
      const idl = await loadIdl(PROGRAM_ID, provider, idlJson);
      const program = new anchor.Program(idl, provider);
      programRef.current = program;

      const [pda] = PublicKey.findProgramAddressSync(
        [new TextEncoder().encode(PLAYER_SEED), kp.publicKey.toBuffer()],
        PROGRAM_ID,
      );
      pdaRef.current = pda;

      let account = await baseConn.getAccountInfo(pda);
      if (!account) {
        setStatus("Creating your on-chain player account…");
        await program.methods.initialize().rpc();
        account = await baseConn.getAccountInfo(pda);
      }
      if (account) {
        const cur = program.coder.accounts.decode("player", account.data) as {
          lastResult: number;
          rollnum: number;
        };
        rollnumRef.current = cur.rollnum;
        lastRollRef.current = cur.lastResult;
        setPacksOpened(cur.rollnum);
      }

      const router = new ConnectionMagicRouter(ROUTER_ENDPOINT, {
        wsEndpoint: ROUTER_WS_ENDPOINT,
      });
      routerRef.current = router;

      const st = (await router.getDelegationStatus(pda)) as {
        isDelegated: boolean;
        fqdn?: string;
      };
      if (st.isDelegated) {
        setIsDelegated(true);
        await setupEphemeral(st.fqdn ?? null);
      } else {
        const ok = await delegate();
        if (!ok) {
          setPhase("error");
          setStatus("Delegation failed — see the error below.");
          return;
        }
      }

      setPhase("ready");
      setStatus("Ready — open a pack. Every roll is a VRF draw on the rollup, gasless.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("error");
      setStatus("Something went wrong during setup.");
    }
  }, [delegate, refreshBalance, setupEphemeral]);

  useEffect(() => {
    void init();
    return () => {
      if (subIdRef.current !== null && ephConnRef.current) {
        ephConnRef.current.removeAccountChangeListener(subIdRef.current).catch(() => undefined);
        subIdRef.current = null;
      }
    };
  }, [init]);

  const openPack = useCallback(async () => {
    if (phase !== "ready" || rollingRef.current) return;
    const ephProgram = ephProgramRef.current;
    const ephConn = ephConnRef.current;
    const kp = keypairRef.current;
    const pda = pdaRef.current;
    if (!ephProgram || !ephConn || !kp || !pda) return;
    rollingRef.current = true;
    setPhase("rolling");
    setStatus("Pack opening — VRF draw running on the rollup…");
    setError(null);
    const seed = Math.floor(Math.random() * 256);
    const startRollnum = rollnumRef.current;
    const t0 = Date.now();
    try {
      const tx = await ephProgram.methods
        .rollDiceDelegated(seed)
        .accounts({ payer: kp.publicKey, player: pda, oracleQueue: ORACLE_QUEUE })
        .transaction();
      const { blockhash } = await ephConn.getLatestBlockhash();
      tx.recentBlockhash = blockhash;
      tx.feePayer = kp.publicKey;
      tx.sign(kp);
      const signature = await ephConn.sendRawTransaction(tx.serialize(), {
        skipPreflight: true,
      });

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
        rollnumRef.current = cur.rollnum;
        lastRollRef.current = cur.lastResult;
        setPacksOpened(cur.rollnum);
        if (
          (cur.rollnum > startRollnum ||
            (startRollnum >= 255 && cur.lastResult !== 0)) &&
          cur.lastResult > 0
        ) {
          result = cur;
          break;
        }
      }
      if (!result) throw new Error("VRF callback timed out (30s)");

      const latencyMs = Date.now() - t0;
      const card = cardForRoll(result.lastResult, result.rollnum);
      const pack: PackResult = {
        roll: result.lastResult,
        rollnum: result.rollnum,
        card,
        latencyMs,
        signature,
      };
      setLastResult(pack);
      setLastLatency(latencyMs);
      setHistory((prev) => {
        const next = [{ ...pack, at: Date.now() }, ...prev].slice(0, 20);
        persistHistory(next);
        return next;
      });
      setCollection((prev) => {
        if (prev.includes(card.id)) return prev;
        const next = [...prev, card.id];
        persistCollection(next);
        return next;
      });
      setPhase("ready");
      setStatus(
        `Revealed: ${card.name} (${RARITY_FROM_ROLL[result.lastResult]}) in ${latencyMs}ms. Open another?`,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("ready");
      setStatus("That pack failed to open — try again.");
    } finally {
      rollingRef.current = false;
    }
  }, [phase, persistCollection, persistHistory]);

  const undelegate = useCallback(async () => {
    const ephProgram = ephProgramRef.current;
    const kp = keypairRef.current;
    const pda = pdaRef.current;
    if (!ephProgram || !kp || !pda || !isDelegated) return;
    try {
      setStatus("Committing your packs back to Solana base layer…");
      await ephProgram.methods
        .undelegate()
        .accounts({ payer: kp.publicKey, user: pda })
        .rpc({ skipPreflight: true });
      const ok = await pollDelegation(false);
      if (ok) {
        setIsDelegated(false);
        setStatus("Committed. Your packs are safe on base layer — re-delegate to play again.");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  }, [isDelegated, pollDelegation]);

  const redelegate = useCallback(async () => {
    setError(null);
    const ok = await delegate();
    if (ok) {
      setPhase("ready");
      setStatus("Re-delegated — ready to open packs again.");
    } else {
      setPhase("error");
    }
  }, [delegate]);

  const retryInit = useCallback(() => {
    initStartedRef.current = false;
    setError(null);
    void init();
  }, [init]);

  const resetPlayer = useCallback(() => {
    // Demo player is shared: reset only clears this browser's collection
    // and history, never the keypair.
    localStorage.removeItem(COLLECTION_KEY);
    localStorage.removeItem(HISTORY_KEY);
    window.location.reload();
  }, []);

  return {
    phase,
    status,
    address,
    balance,
    isDelegated,
    isDemoPlayer: DEMO_SECRET.length === 64,
    ephemeralEndpoint,
    packsOpened,
    lastResult,
    lastLatency,
    history,
    collection,
    error,
    openPack,
    undelegate,
    redelegate,
    retryInit,
    resetPlayer,
  };
}
