import { usePackBlitz } from "./lib/packblitz";
import { CARD_POOL, RARITY_META, PROGRAM_ID } from "./lib/config";
import { PackCardView, CardSlot } from "./components/PackCard";

const ALL_CARDS = [
  ...CARD_POOL.common,
  ...CARD_POOL.rare,
  ...CARD_POOL.epic,
  ...CARD_POOL.legendary,
];

function short(addr: string) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "—";
}

export default function App() {
  const game = usePackBlitz();
  const best = game.history.reduce<string | null>((acc, h) => {
    const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
    if (!acc) return h.card.name;
    const cur = ALL_CARDS.find((c) => c.name === acc);
    if (!cur) return h.card.name;
    return order[h.card.rarity] > order[cur.rarity] ? h.card.name : acc;
  }, null);

  return (
    <div className="page">
      <header className="topbar">
        <div className="brand">
          <span className="logo">PACK BLITZ</span>
          <span className="tag">Solana Blitz v10 · Entertainment Finance</span>
        </div>
        <div className="wallet">
          <span className="pill">DEVNET</span>
          <span className="pill">{short(game.address)}</span>
          <span className="pill">
            {game.balance === null ? "— SOL" : `${game.balance.toFixed(2)} SOL`}
          </span>
          <span className={`pill ${game.isDelegated ? "ok" : "warn"}`}>
            {game.isDelegated ? "● On Rollup" : "○ Base Layer"}
          </span>
        </div>
      </header>

      <main>
        <section className="hero">
          <h1>Open packs. Beat the odds. Own the loot.</h1>
          <p className="sub">
            Every pack is a verifiable random draw (MagicBlock VRF) executed on
            an Ephemeral Rollup — gasless, in about 100 milliseconds. 16 cards
            to collect across 4 rarities.
          </p>
          <p className="status">{game.status}</p>
          {game.error && <p className="error-line">{game.error}</p>}

          {game.phase === "needs-funds" && (
            <div className="funds-box">
              <p>
                This player wallet needs devnet SOL before it can play. Fund
                it free (worthless test SOL):
              </p>
              <p className="mono">{game.address}</p>
              <p>
                <a href="https://solfaucet.com" target="_blank" rel="noreferrer">
                  solfaucet.com
                </a>{" "}
                or{" "}
                <a href="https://faucet.solana.com" target="_blank" rel="noreferrer">
                  faucet.solana.com
                </a>{" "}
                — paste the address, request devnet SOL, then press Retry.
              </p>
              <button className="btn" onClick={game.retryInit}>
                Retry
              </button>
            </div>
          )}

          <div className="stage">
            {game.lastResult ? (
              <PackCardView
                card={game.lastResult.card}
                isNew={!game.history.slice(1).some((h) => h.card.id === game.lastResult?.card.id)}
              />
            ) : (
              <div className={`pack-sealed ${game.phase === "rolling" ? "shaking" : ""}`}>
                <div className="pack-seal">PACK BLITZ</div>
                <div className="pack-hint">
                  {game.phase === "rolling" ? "DRAWING…" : "SEALED PACK"}
                </div>
              </div>
            )}
          </div>

          <div className="actions">
            <button
              className="btn big"
              disabled={game.phase !== "ready"}
              onClick={() => void game.openPack()}
            >
              {game.phase === "rolling"
                ? "Opening…"
                : game.phase === "ready"
                  ? "OPEN PACK — FREE"
                  : "OPEN PACK"}
            </button>
            {game.isDelegated ? (
              <button className="btn ghost" onClick={() => void game.undelegate()}>
                Commit & undelegate
              </button>
            ) : (
              game.phase === "ready" && (
                <button className="btn ghost" onClick={() => void game.redelegate()}>
                  Re-delegate to rollup
                </button>
              )
            )}
          </div>

          {game.lastResult && (
            <p className="reveal-line">
              Pack #{game.lastResult.rollnum} · dice {game.lastResult.roll} ·{" "}
              {game.lastResult.card.name} · {game.lastLatency}ms ·{" "}
              <a
                href={`https://explorer.solana.com/tx/${game.lastResult.signature}?cluster=custom&customUrl=${encodeURIComponent(game.ephemeralEndpoint ?? "https://devnet.magicblock.app")}`}
                target="_blank"
                rel="noreferrer"
              >
                view tx
              </a>
            </p>
          )}
        </section>

        <section className="stats">
          <div className="stat">
            <div className="stat-num">{game.packsOpened}</div>
            <div className="stat-label">Packs opened</div>
          </div>
          <div className="stat">
            <div className="stat-num">{game.collection.length}/16</div>
            <div className="stat-label">Collection</div>
          </div>
          <div className="stat">
            <div className="stat-num">{best ?? "—"}</div>
            <div className="stat-label">Best pull</div>
          </div>
          <div className="stat">
            <div className="stat-num">
              {game.lastLatency === null ? "—" : `${game.lastLatency}ms`}
            </div>
            <div className="stat-label">Last roll latency</div>
          </div>
        </section>

        <section className="collection">
          <h2>Collection</h2>
          <div className="grid">
            {ALL_CARDS.map((c) => (
              <CardSlot key={c.id} card={c} owned={game.collection.includes(c.id)} />
            ))}
          </div>
        </section>

        <section className="history">
          <h2>Recent packs</h2>
          {game.history.length === 0 ? (
            <p className="muted">No packs opened yet — your first pull shows up here.</p>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Card</th>
                  <th>Rarity</th>
                  <th>Roll</th>
                  <th>Latency</th>
                  <th>Tx</th>
                </tr>
              </thead>
              <tbody>
                {game.history.slice(0, 8).map((h, i) => (
                  <tr key={`${h.signature}-${i}`}>
                    <td>{h.card.name}</td>
                    <td>
                      <span
                        className="rarity-dot"
                        style={{ background: RARITY_META[h.card.rarity].glow }}
                      />
                      {RARITY_META[h.card.rarity].label}
                    </td>
                    <td>{h.roll}</td>
                    <td>{h.latencyMs}ms</td>
                    <td>
                      <a
                        href={`https://explorer.solana.com/tx/${h.signature}?cluster=custom&customUrl=${encodeURIComponent(game.ephemeralEndpoint ?? "https://devnet.magicblock.app")}`}
                        target="_blank"
                        rel="noreferrer"
                      >
                        {h.signature.slice(0, 4)}…{h.signature.slice(-4)}
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>

        <section className="how">
          <h2>How it works</h2>
          <ol>
            <li>
              <b>Delegate.</b> Your player account moves onto a MagicBlock
              Ephemeral Rollup — transactions there are gasless and confirm in
              milliseconds.
            </li>
            <li>
              <b>Open.</b> Each pack requests randomness from MagicBlock VRF
              (free inside the rollup). An oracle proves the draw; nobody —
              not even us — can rig it.
            </li>
            <li>
              <b>Reveal.</b> The VRF callback writes your 1–6 roll on-chain.
              The roll maps to a rarity, the card is picked from on-chain
              state, and your collection lives in your wallet.
            </li>
            <li>
              <b>Commit.</b> Undelegate any time to sync your packs back to
              Solana base layer.
            </li>
          </ol>
          <p className="muted">
            Program (devnet):{" "}
            <a
              href={`https://explorer.solana.com/address/${PROGRAM_ID.toBase58()}?cluster=devnet`}
              target="_blank"
              rel="noreferrer"
            >
              {PROGRAM_ID.toBase58()}
            </a>{" "}
            — MagicBlock&apos;s official roll-dice delegated program. Pack
            Blitz&apos;s own program is in <code>anchor/</code> and deploys via
            GitHub Actions. Devnet demo: the player keypair is generated in
            your browser, packs are free, cards have no monetary value.
          </p>
          <p>
            <button className="btn ghost small" onClick={game.resetPlayer}>
              Reset player (new keypair, clears collection)
            </button>
          </p>
        </section>
      </main>

      <footer>
        Pack Blitz — built for Solana Blitz v10 · MagicBlock Ephemeral Rollups + VRF · Devnet demo
      </footer>
    </div>
  );
}
