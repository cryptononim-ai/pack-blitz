import { useState } from "react";
import { usePackBlitz } from "./lib/packblitz";
import { CARD_POOL, RARITY_META, PROGRAM_ID, PACK_ART } from "./lib/config";
import type { Rarity } from "./lib/config";
import { PackCardView, CardSlot } from "./components/PackCard";

const BASE = import.meta.env.BASE_URL;
const ALL_CARDS = [
  ...CARD_POOL.common,
  ...CARD_POOL.rare,
  ...CARD_POOL.epic,
  ...CARD_POOL.legendary,
];

const FILTERS: { key: Rarity | "all"; label: string }[] = [
  { key: "all", label: "All" },
  { key: "common", label: "Common" },
  { key: "rare", label: "Rare" },
  { key: "epic", label: "Epic" },
  { key: "legendary", label: "Legendary" },
];

function short(addr: string) {
  return addr ? `${addr.slice(0, 4)}…${addr.slice(-4)}` : "—";
}

export default function App() {
  const game = usePackBlitz();
  const [filter, setFilter] = useState<Rarity | "all">("all");
  const shown =
    filter === "all" ? ALL_CARDS : ALL_CARDS.filter((c) => c.rarity === filter);
  const best = game.history.reduce<string | null>((acc, h) => {
    const order = { common: 0, rare: 1, epic: 2, legendary: 3 };
    if (!acc) return h.card.name;
    const cur = ALL_CARDS.find((c) => c.name === acc);
    if (!cur) return h.card.name;
    return order[h.card.rarity] > order[cur.rarity] ? h.card.name : acc;
  }, null);
  const bestCard = best ? ALL_CARDS.find((c) => c.name === best) : null;

  return (
    <div className="page">
      <header className="topbar">
        <a className="brand" href="#top">
          <span className="logo-mark">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden>
              <path d="M13 2 4.5 13.5H11L9.5 22 19 10h-6.5L13 2Z" fill="#8bff3d" />
            </svg>
          </span>
          <span className="logo">PACK BLITZ</span>
          <nav className="nav">
            <a href="#packs">Packs</a>
            <a href="#collection">Collection</a>
            <a href="#how">How it works</a>
          </nav>
        </a>
        <div className="wallet">
          <span className="pill free">FREE</span>
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

      <main id="top">
        <section className="welcome">
          <div className="welcome-left">
            <span className="welcome-kicker">Welcome,</span>
            <h1 className="welcome-title">NEW PLAYER</h1>
            <p className="welcome-sub">
              Rip packs on Solana. Every draw is a verifiable VRF roll on a
              MagicBlock Ephemeral Rollup — gasless, in about 100ms.
            </p>
          </div>
          <div className="highlights">
            <div className="highlight">
              <span className="highlight-label">RECENT HIT</span>
              {game.lastResult ? (
                <>
                  <img
                    className="highlight-thumb"
                    src={`${BASE}${RARITY_META[game.lastResult.card.rarity].art}`}
                    alt={game.lastResult.card.name}
                  />
                  <span className="highlight-name">{game.lastResult.card.name}</span>
                </>
              ) : (
                <span className="highlight-name muted">No pulls yet</span>
              )}
            </div>
            <div className="highlight">
              <span className="highlight-label">BEST PULL</span>
              {bestCard ? (
                <>
                  <img
                    className="highlight-thumb"
                    src={`${BASE}${RARITY_META[bestCard.rarity].art}`}
                    alt={bestCard.name}
                  />
                  <span className="highlight-name">{bestCard.name}</span>
                </>
              ) : (
                <span className="highlight-name muted">Open a pack</span>
              )}
            </div>
          </div>
        </section>

        <section className="hero-split" id="packs">
          <div className="panel rip">
            <div className="panel-live">
              <span className="live-dot" /> {game.packsOpened} ripping
            </div>
            <div className="panel-art">
              <img
                className={`pack-img ${game.phase === "rolling" ? "shaking" : ""}`}
                src={`${BASE}${PACK_ART}`}
                alt="Sealed Pack Blitz booster pack"
              />
              <div className="panel-badge">10 CARDS</div>
            </div>
            <h2 className="panel-title">
              RIP PACKS <span className="arrow">›</span>
            </h2>
            <p className="panel-desc">
              Reverse-engineered analogs of the packs you love! Same real
              experience… <em>just actually on-chain.</em>
            </p>
            <button
              className="btn big rip-btn"
              disabled={game.phase !== "ready"}
              onClick={() => void game.openPack()}
            >
              {game.phase === "rolling"
                ? "OPENING…"
                : game.phase === "ready"
                  ? "OPEN PACK — FREE"
                  : "OPEN PACK"}
            </button>
            <p className="panel-odds">
              Common 33% · Rare 33% · Epic 17% · Legendary 17%
            </p>
          </div>

          <div className="panel pull">
            <div className="panel-live">
              <span className="live-dot" /> {game.history.length} today
            </div>
            <div className="panel-art">
              {game.lastResult ? (
                <PackCardView
                  card={game.lastResult.card}
                  isNew={
                    !game.history
                      .slice(1)
                      .some((h) => h.card.id === game.lastResult?.card.id)
                  }
                />
              ) : (
                <div className="mystery-card">
                  <span className="mystery-q">?</span>
                  <span className="mystery-label">YOUR NEXT PULL</span>
                </div>
              )}
            </div>
            <h2 className="panel-title">
              LAST PULL <span className="arrow">›</span>
            </h2>
            <p className="panel-desc">
              {game.lastResult ? (
                <>
                  <em>Just ripped:</em> {game.lastResult.card.name} — Pack #
                  {game.lastResult.rollnum}, dice {game.lastResult.roll},{" "}
                  {game.lastLatency}ms.{" "}
                  <a
                    href={`https://explorer.solana.com/tx/${game.lastResult.signature}?cluster=custom&customUrl=${encodeURIComponent(game.ephemeralEndpoint ?? "https://devnet.magicblock.app")}`}
                    target="_blank"
                    rel="noreferrer"
                  >
                    view tx
                  </a>
                </>
              ) : (
                <>
                  Score a single hit from the set! Designed to offer{" "}
                  <em>exciting &amp; legit mystery pulls</em> with clear odds.
                </>
              )}
            </p>
            <p className="status-line">{game.status}</p>
          </div>
        </section>

        {game.error && <p className="error-line">{game.error}</p>}
        {game.phase === "needs-funds" && (
          <div className="funds-box">
            <p>
              The demo player ran out of devnet SOL. Fund it free (worthless
              test SOL):
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

        <section className="collection" id="collection">
          <div className="section-head">
            <h2>LIVE PULLS — THE SET</h2>
            <span className="muted">16 cards · provably fair VRF</span>
          </div>
          <div className="pills">
            {FILTERS.map((f) => (
              <button
                key={f.key}
                className={`filter-pill ${filter === f.key ? "active" : ""}`}
                onClick={() => setFilter(f.key)}
              >
                {f.label}
                <span className="pill-count">
                  {f.key === "all"
                    ? ALL_CARDS.length
                    : CARD_POOL[f.key].length}
                </span>
              </button>
            ))}
          </div>
          <div className="grid">
            {shown.map((c) => (
              <CardSlot key={c.id} card={c} owned={game.collection.includes(c.id)} />
            ))}
          </div>
        </section>

        <section className="history">
          <h2>RECENT PACKS</h2>
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
                    <td>
                      <img
                        className="row-thumb"
                        src={`${BASE}${RARITY_META[h.card.rarity].art}`}
                        alt=""
                      />
                      {h.card.name}
                    </td>
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

        <section className="how" id="how">
          <h2>HOW IT WORKS</h2>
          <ol className="steps">
            <li>
              <b>FIND A PACK.</b> One pack, 16 cards, posted odds — no wallet
              setup, the demo player is ready.
            </li>
            <li>
              <b>OPEN PACK.</b> Each pack requests randomness from MagicBlock
              VRF (free inside the rollup). An oracle proves the draw; nobody
              — not even us — can rig it.
            </li>
            <li>
              <b>REVEAL.</b> The VRF callback writes your 1–6 roll on-chain.
              The roll maps to a rarity, the card is picked from on-chain
              state, and your collection lives in your browser.
            </li>
            <li>
              <b>COMMIT.</b> Undelegate any time to sync your packs back to
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
            GitHub Actions. Devnet demo: packs are free, cards have no
            monetary value.
          </p>
          <p>
            <button className="btn ghost small" onClick={game.resetPlayer}>
              Reset my collection
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
