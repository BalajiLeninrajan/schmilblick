import { useEffect, useState } from "react";
import { DECK_TABLE, type GameLength } from "../shared/deckTable";
import { NAME_MAX, type LobbyState, type PublicPlayer } from "../shared/protocol";
import { MAX_PLAYERS, MIN_PLAYERS, type SchmilblickDie } from "../shared/rules";
import { navigate, Wordmark } from "./App";
import { accentVar, CopyIcon, Crown, CuteCard, LockIcon } from "./art";
import { Game } from "./Game";
import { RulesButton, Sheet } from "./Sheet";
import { savedName, useLobby } from "./useLobby";

type Send = ReturnType<typeof useLobby>["send"];

export function Avatar({ p, lg }: { p: PublicPlayer; lg?: boolean }) {
  return (
    <span className={`avatar${lg ? " is-lg" : ""}`} style={accentVar(p.accent)} aria-hidden="true">
      {p.name.slice(0, 1).toUpperCase()}
    </span>
  );
}

function useCopied() {
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const t = setTimeout(() => setCopied(false), 1400);
    return () => clearTimeout(t);
  }, [copied]);
  return [copied, setCopied] as const;
}

function ShareCode({ code }: { code: string }) {
  const [copied, setCopied] = useCopied();
  const url = `${location.origin}/${code}`;
  return (
    <button
      type="button"
      className="chip sb-code-chip"
      data-tip={copied ? "Copied" : "Copy invite link"}
      onClick={() => navigator.clipboard?.writeText(url).then(() => setCopied(true))}
    >
      <span className="cn-code">{code}</span>
      <CopyIcon />
    </button>
  );
}

function NameForm({ initial, submitLabel, onSubmit }: { initial: string; submitLabel: string; onSubmit: (name: string) => void }) {
  const [name, setName] = useState(initial);
  return (
    <form
      className="panel-body cn-stack"
      onSubmit={(e) => {
        e.preventDefault();
        if (name.trim()) onSubmit(name.trim());
      }}
    >
      <div className="field">
        <label htmlFor="player-name">Your name</label>
        <input
          id="player-name"
          className="input"
          maxLength={NAME_MAX}
          placeholder="Gloria"
          autoFocus
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <div>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}

const LENGTHS: { id: GameLength; label: string }[] = [
  { id: "short", label: "Short" },
  { id: "medium", label: "Medium" },
  { id: "long", label: "Long" },
];

const DICE: SchmilblickDie[] = [4, 6, 8, 10];

function Room({ state, you, send }: { state: LobbyState; you: string; send: Send }) {
  const [renaming, setRenaming] = useState(false);
  const isHost = state.hostId === you;
  const seated = state.players.filter((p) => !p.spectator);
  const online = seated.filter((p) => p.connected).length;
  const me = state.players.find((p) => p.id === you);
  const count = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, seated.length));
  const row = DECK_TABLE[count];
  const host = state.players.find((p) => p.id === state.hostId);

  return (
    <div className="sb-room sb-two-col" data-density="compact">
      <section className="panel">
        <div className="panel-header">
          <h2>Players</h2>
          <div className="band-actions">
            <span className="cn-meta">
              {seated.length} / {MAX_PLAYERS}
            </span>
            <button type="button" className="btn btn-ghost is-sm" onClick={() => setRenaming(true)}>
              Rename
            </button>
          </div>
        </div>
        <div className="panel-body">
          <ul className="cn-list-none cn-m-0 cn-divide sb-roster scroll-well">
            {state.players.map((p) => (
              <li key={p.id} className={`cn-row sb-roster-item${p.connected ? "" : " is-away"}`}>
                <Avatar p={p} />
                <span className="cn-name cn-grow cn-truncate">{p.name}</span>
                {p.id === you && <span className="tag cn-tone-mauve">You</span>}
                {p.spectator && <span className="tag cn-tone-blue">Next game</span>}
                {!p.connected && <span className="tag cn-tone-red">Away</span>}
                {p.id === state.hostId && (
                  <span data-tip="Host">
                    <Crown className="sb-host-crown" />
                  </span>
                )}
              </li>
            ))}
          </ul>
        </div>
      </section>

      <section className="panel">
        <div className="panel-header">
          <h2>Game settings</h2>
          {!isHost && (
            <span className="cn-row cn-meta">
              <LockIcon />
              Only {host?.name ?? "the host"} can change these
            </span>
          )}
        </div>
        <div className="panel-body cn-stack">
          {isHost ? (
            <>
              <div className="cn-stack cn-gap-8">
                <span className="cn-label">Length</span>
                <div
                  className="segmented sb-seg-row sb-seg-stack"
                  role="group"
                  aria-label="Game length"
                  style={{ "--n": 3 } as React.CSSProperties}
                >
                  {LENGTHS.map((l) => (
                    <button
                      key={l.id}
                      type="button"
                      aria-pressed={state.length === l.id}
                      onClick={() => send({ t: "length", length: l.id })}
                    >
                      <b>{l.label}</b>
                      <small>{row[l.id].cards} cards</small>
                    </button>
                  ))}
                </div>
              </div>
              <div className="cn-stack cn-gap-8">
                <span className="cn-label">Schmilblick die</span>
                <div
                  className="segmented sb-seg-row sb-seg-stack"
                  role="group"
                  aria-label="Schmilblick die"
                  style={{ "--n": 4 } as React.CSSProperties}
                >
                  {DICE.map((sides) => (
                    <button key={sides} type="button" aria-pressed={state.sides === sides} onClick={() => send({ t: "die", sides })}>
                      <b>d{sides}</b>
                    </button>
                  ))}
                </div>
              </div>
            </>
          ) : (
            <dl className="kv cn-m-0">
              <dt>Length</dt>
              <dd>
                {LENGTHS.find((l) => l.id === state.length)?.label} · {row[state.length].cards} cards
              </dd>
              <dt>Schmilblick die</dt>
              <dd>d{state.sides}</dd>
            </dl>
          )}
        </div>
        <div className="panel-footer">
          {isHost ? (
            <>
              <button type="button" className="btn btn-primary" disabled={online < MIN_PLAYERS} onClick={() => send({ t: "start" })}>
                Deal the deck
              </button>
              {online < MIN_PLAYERS && <span className="cn-meta">Waiting for a second player</span>}
            </>
          ) : (
            <span className="cn-row cn-meta">
              <span className="spinner" aria-hidden="true" /> Waiting for the host to deal
            </span>
          )}
        </div>
      </section>

      <Sheet kind="modal" title="Rename" open={renaming} onClose={() => setRenaming(false)}>
        {renaming && (
          <NameForm
            initial={me?.name ?? ""}
            submitLabel="Save"
            onSubmit={(name) => {
              send({ t: "join", name });
              setRenaming(false);
            }}
          />
        )}
      </Sheet>
    </div>
  );
}

export function LobbyPage({ code }: { code: string }) {
  const { state, you, conn, error, send } = useLobby(code);
  const [toast, setToast] = useState<string | null>(null);

  useEffect(() => {
    if (!error) return;
    setToast(error.message);
    const t = setTimeout(() => setToast(null), 3200);
    return () => clearTimeout(t);
  }, [error]);

  const joined = !!state && !you.startsWith("pending:") && state.players.some((p) => p.id === you);
  const needsName = !!state && !joined && conn === "open";
  const inGame = !!state && state.phase !== "lobby";

  return (
    <>
      <header className="topbar is-split is-compact sb-lobby-bar">
        <Wordmark />
        <div className="cn-row">
          {conn !== "open" && conn !== "missing" && (
            <span className="chip" data-tip="Reconnecting">
              <span className="spinner" aria-hidden="true" />
            </span>
          )}
          <ShareCode code={code} />
          <RulesButton />
          {joined && (
            <button
              type="button"
              className="btn btn-ghost is-sm"
              onClick={() => {
                send({ t: "leave" });
                navigate("/");
              }}
            >
              Leave
            </button>
          )}
        </div>
      </header>

      <main className={inGame && !needsName ? "sb-stage" : "page-main is-narrow page-enter sb-lobby"}>
        {conn === "missing" ? (
          <div className="empty-state">
            <CuteCard n={2} className="sb-empty-card" />
            <h1 className="cn-title">No room called {code}</h1>
            <p className="cn-copy">It may have closed after sitting empty for a few hours.</p>
            <button type="button" className="btn btn-primary cn-mt-12" onClick={() => navigate("/")}>
              Make a new one
            </button>
          </div>
        ) : !state ? (
          <div className="empty-state">
            <span className="spinner" aria-hidden="true" />
          </div>
        ) : needsName ? (
          <section className="panel">
            <div className="panel-header">
              <h2>Pull up a chair</h2>
            </div>
            {(state.phase !== "lobby" || state.players.filter((p) => !p.spectator).length >= MAX_PLAYERS) && (
              <div className="panel-body cn-pb-0">
                <p className="banner cn-tone-blue cn-m-0">This table is mid-game or full. You'll watch, and sit in for the next one.</p>
              </div>
            )}
            <NameForm initial={savedName()} submitLabel="Join" onSubmit={(name) => send({ t: "join", name })} />
          </section>
        ) : state.phase === "lobby" ? (
          joined && <Room state={state} you={you} send={send} />
        ) : (
          <Game state={state} you={you} send={send} />
        )}
      </main>

      {toast && (
        <div className="toast-stack" aria-live="polite">
          <div className="toast" role="status">
            <div>
              <b>Hold on</b>
              <span>{toast}</span>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
