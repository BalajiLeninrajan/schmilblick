import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { AFK_MS, BEATS, type LobbyState, type PublicPlayer, type SeqPlay } from "../shared/protocol";
import { DEATH_DECK_DIVISOR, isDeathDeck, MAX_TAKE, type Dir } from "../shared/rules";
import { accentVar, ArrowIcon, CardBack, Crown, CuteCard, Die, Ghost, Mug } from "./art";
import { Avatar } from "./LobbyPage";
import { Sheet } from "./Sheet";
import type { useLobby } from "./useLobby";

type Beat = "d8" | "fly" | "death" | "blick" | "schmilblick" | "pass";
const ORDER: Beat[] = ["d8", "fly", "death", "blick", "schmilblick", "pass"];

interface Anim {
  play: SeqPlay;
  beat: Beat;
}

/** Runs the beats of the newest play. Plays already on screen when we arrive are not replayed. */
function usePlayAnimation(lastPlay: SeqPlay | null) {
  const [anim, setAnim] = useState<Anim | null>(null);
  const shown = useRef(lastPlay?.seq ?? 0);

  useEffect(() => {
    if (!lastPlay) {
      shown.current = 0;
      setAnim(null);
      return;
    }
    if (lastPlay.seq <= shown.current) return;
    shown.current = lastPlay.seq;

    const beats: [Beat, number][] = [
      ["d8", BEATS.d8],
      ["fly", BEATS.fly],
    ];
    if (lastPlay.death) beats.push(["death", BEATS.death]);
    if (lastPlay.schmilRoll !== null) beats.push(["blick", BEATS.schmilRoll]);
    if (lastPlay.schmilblick) beats.push(["schmilblick", BEATS.schmilblick]);
    if (lastPlay.nextId) beats.push(["pass", BEATS.pass]);

    let at = 0;
    const timers = beats.map(([beat, ms]) => {
      const id = setTimeout(() => setAnim({ play: lastPlay, beat }), at);
      at += ms;
      return id;
    });
    timers.push(setTimeout(() => setAnim(null), at));
    return () => timers.forEach(clearTimeout);
  }, [lastPlay?.seq]); // eslint-disable-line react-hooks/exhaustive-deps

  return anim;
}

const reached = (anim: Anim | null, beat: Beat) => !!anim && ORDER.indexOf(anim.beat) >= ORDER.indexOf(beat);

/** Shows random faces while rolling, then lands on `value`. */
function RollingDie({ sides, rolling, value, hot }: { sides: number; rolling: boolean; value: number | null; hot?: boolean }) {
  const [face, setFace] = useState<number>(value ?? sides);
  useEffect(() => {
    if (!rolling) {
      if (value !== null) setFace(value);
      return;
    }
    const id = setInterval(() => setFace(1 + Math.floor(Math.random() * sides)), 70);
    return () => clearInterval(id);
  }, [rolling, value, sides]);
  return (
    <div className={`sb-die-wrap${rolling ? " is-rolling" : value !== null ? " is-landed" : ""}${hot ? " is-hot" : ""}`}>
      <Die sides={sides} value={value === null && !rolling ? "?" : face} />
      <span className="cn-microlabel">d{sides}</span>
    </div>
  );
}

// Seats sit on an ellipse, clockwise from the bottom (where you sit), so a pass to the left travels clockwise.
const SEAT_R = { x: 40, y: 40 };
const seatAngle = (i: number, n: number, offset: number) => ((i - offset) / n) * Math.PI * 2 + Math.PI / 2;
const onEllipse = (a: number, shrink = 0) => ({ x: 50 + (SEAT_R.x - shrink) * Math.cos(a), y: 50 + (SEAT_R.y - shrink) * Math.sin(a) });

/** The deck travels around the table, inside the ring of seats, in the direction it was passed. */
function PassingDeck({
  tableRef,
  from,
  to,
  n,
  offset,
  dir,
  remaining,
}: {
  tableRef: RefObject<HTMLDivElement | null>;
  from: number;
  to: number;
  n: number;
  offset: number;
  dir: Dir;
  remaining: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    const table = tableRef.current;
    if (!el || !table) return;
    const { width, height } = table.getBoundingClientRect();
    const a0 = seatAngle(from, n, offset);
    const a1 = seatAngle(to, n, offset);
    const turn = Math.PI * 2;
    const delta = dir === "left" ? (((a1 - a0) % turn) + turn) % turn || turn : -((((a0 - a1) % turn) + turn) % turn || turn);
    const steps = 24;
    const frames: Keyframe[] = [];
    for (let k = 0; k <= steps; k++) {
      const t = k / steps;
      const { x, y } = onEllipse(a0 + delta * t, 12 * Math.sin(Math.PI * t)); // dip toward the middle, clear of the seats
      const px = ((x - 50) / 100) * width;
      const py = ((y - 50) / 100) * height;
      const tilt = (dir === "left" ? 1 : -1) * 14 * Math.sin(Math.PI * t);
      const scale = 0.7 + 0.35 * Math.sin(Math.PI * t);
      frames.push({
        transform: `translate(${px}px, ${py}px) rotate(${tilt}deg) scale(${scale})`,
        opacity: t < 0.08 ? t / 0.08 : t > 0.9 ? (1 - t) / 0.1 : 1,
      });
    }
    const anims = [el, ...el.parentElement!.querySelectorAll<HTMLElement>(".sb-pass-trail")].map((node, i) =>
      node.animate(frames, {
        duration: BEATS.pass - 200,
        delay: i * 70,
        easing: "cubic-bezier(.45, .05, .3, 1)",
        fill: "both",
      }),
    );
    return () => anims.forEach((a) => a.cancel());
  }, [tableRef, from, to, n, offset, dir]);

  return (
    <>
      {[1, 2, 3].map((i) => (
        <div key={i} className="sb-passing sb-pass-trail" style={{ "--trail": i } as CSSProperties} aria-hidden="true">
          <CardBack className="sb-pass-card" />
        </div>
      ))}
      <div ref={ref} className="sb-passing">
        <CardBack className="sb-pass-card" />
        <span className="sb-pass-count">{remaining}</span>
      </div>
    </>
  );
}

function MiniFan({ count, seed }: { count: number; seed: number }) {
  const shown = Math.min(count, 5);
  return (
    <span className="sb-fan" aria-hidden="true">
      {Array.from({ length: shown }, (_, k) => (
        <CuteCard key={k} n={seed + k} style={{ "--k": k - (shown - 1) / 2 } as CSSProperties} />
      ))}
    </span>
  );
}

function Confetti() {
  const bits = useMemo(
    () =>
      Array.from({ length: 70 }, (_, i) => ({
        x: Math.random() * 100,
        d: Math.random() * 3,
        r: Math.random() * 720 - 360,
        s: 0.6 + Math.random() * 0.8,
        c: ["mauve", "pink", "peach", "yellow", "green", "sky", "lavender"][i % 7],
      })),
    [],
  );
  return (
    <div className="sb-confetti" aria-hidden="true">
      {bits.map((b, i) => (
        <i
          key={i}
          style={
            { left: `${b.x}%`, animationDelay: `${b.d}s`, "--r": `${b.r}deg`, "--s": b.s, background: `var(--${b.c})` } as CSSProperties
          }
        />
      ))}
    </div>
  );
}

function useNow(active: boolean) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(id);
  }, [active]);
  return now;
}

function PlaysLog({ log, byId, nameOf }: { log: SeqPlay[]; byId: Map<string, PublicPlayer>; nameOf: (id: string | null) => string }) {
  if (log.length === 0) return <p className="cn-meta panel-body">Nothing yet.</p>;
  return (
    <ol className="cn-list-none cn-m-0 cn-divide sb-log">
      {log.map((p) => {
        const who = byId.get(p.playerId);
        return (
          <li key={p.seq} className="cn-row sb-log-row">
            {who && <Avatar p={who} />}
            <div className="cn-grow cn-min-0">
              <div className="cn-name cn-truncate">
                {who?.name ?? "?"} took {p.took}
              </div>
              <div className="cn-meta">
                rolled {p.roll} · {p.remaining} left{p.dir ? ` · ${p.dir} to ${nameOf(p.nextId)}` : ""}
              </div>
            </div>
            <div className="cn-row sb-log-tags">
              {p.death && <span className="tag cn-tone-red">Death</span>}
              {p.schmilblick && <span className="tag cn-tone-yellow">Schmilblick</span>}
              {p.ending?.kind === "lastCard" && <span className="tag cn-tone-green">Win</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** "Bo joins next game", "Bo and Cy join next game", "Bo, Cy and Di join next game" */
function joinsNext(players: PublicPlayer[]) {
  const names = players.map((p) => p.name);
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} and ${names.at(-1)}`;
  return `${list} ${names.length === 1 ? "joins" : "join"} next game`;
}

export function Game({ state, you, send }: { state: LobbyState; you: string; send: ReturnType<typeof useLobby>["send"] }) {
  const g = state.game!;
  const byId = useMemo(() => new Map(state.players.map((p) => [p.id, p])), [state.players]);
  const seats = g.seats.map((id) => byId.get(id)).filter(Boolean) as PublicPlayer[];
  const anim = usePlayAnimation(g.lastPlay);
  const play = anim?.play ?? null;
  const [logOpen, setLogOpen] = useState(false);

  // When the server will take the next roll, in local time.
  const [readyAt, setReadyAt] = useState(() => Date.now() + g.readyIn);
  useEffect(() => setReadyAt(Date.now() + g.readyIn), [g.readyIn, g.lastPlay?.seq, g.currentId]);
  const now = useNow(state.phase === "playing");

  // Cards fly out of the deck, which sits above the table's middle.
  const tableRef = useRef<HTMLDivElement>(null);
  const deckRef = useRef<HTMLDivElement>(null);
  const [deckOffset, setDeckOffset] = useState({ x: 0, y: 0 });
  useLayoutEffect(() => {
    const t = tableRef.current?.getBoundingClientRect();
    const d = deckRef.current?.getBoundingClientRect();
    if (t && d) setDeckOffset({ x: d.left + d.width / 2 - (t.left + t.width / 2), y: d.top + d.height / 2 - (t.top + t.height / 2) });
  }, [anim?.beat]);

  const n = g.seats.length;
  const mySeat = g.seats.indexOf(you);
  const offset = mySeat >= 0 ? mySeat : 0;
  const pos = (id: string | null) => {
    const i = id ? g.seats.indexOf(id) : -1;
    return i < 0 ? { x: 50, y: 50 } : onEllipse(seatAngle(i, n, offset));
  };

  // What the table shows right now, which trails the server while a play animates.
  const holder = play ? play.playerId : g.currentId;
  const deckShown = play ? (reached(anim, "fly") ? play.remaining : play.received) : g.deck;
  const ending = anim ? null : g.ending;
  const looksAlive = (p: PublicPlayer) => {
    if (p.alive) return true;
    if (!play) return false;
    if (p.id === play.playerId && play.death) return !reached(anim, "death");
    if (play.ending?.kind === "noWinner" && play.ending.loserId === p.id) return true;
    return false;
  };
  const cardsShown = (p: PublicPlayer) => (play && p.id === play.playerId && !reached(anim, "fly") ? p.cards - play.took : p.cards);
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? "someone") : "someone");

  const myTurn = state.phase === "playing" && !anim && g.currentId === you;
  const canRoll = myTurn && now >= readyAt - 300;
  const afkLeft = Math.ceil((readyAt + AFK_MS - now) / 1000);

  useEffect(() => {
    if (!canRoll) return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        send({ t: "roll" });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }, [canRoll, send]);

  // ---- caption ----
  let caption: React.ReactNode;
  if (play && anim) {
    const who = nameOf(play.playerId);
    switch (anim.beat) {
      case "d8":
        caption = `${who} rolls the d8…`;
        break;
      case "fly":
        caption =
          play.took < play.roll ? `Rolled ${play.roll}, but only ${play.took} left. ${who} takes them all.` : `${who} takes ${play.took}.`;
        break;
      case "death":
        caption = (
          <>
            <b>Death deck.</b> {play.received} is {DEATH_DECK_DIVISOR} × {play.received / DEATH_DECK_DIVISOR}, so {who} is out.
          </>
        );
        break;
      case "blick":
        caption = `The d${g.sides} tumbles. A ${g.sides} means Schmilblick…`;
        break;
      case "schmilblick":
        caption = "Schmilblick! Everyone still in drinks.";
        break;
      case "pass":
        caption = (
          <span className="cn-row cn-center">
            {play.remaining} left, {play.remaining % 2 ? "odd" : "even"}, so it goes {play.dir} to {nameOf(play.nextId)}
            {play.dir && (
              <span className="cn-icon">
                <ArrowIcon dir={play.dir} />
              </span>
            )}
          </span>
        );
        break;
    }
  } else if (ending) {
    caption = null;
  } else if (g.currentId) {
    const who = g.currentId === you ? "Your" : `${nameOf(g.currentId)}'s`;
    caption = isDeathDeck(g.deck) ? (
      <>
        {who} turn, holding {g.deck}. <b className="cn-text-red">Death deck 💀</b>
      </>
    ) : (
      `${who} turn, holding ${g.deck}.`
    );
  }

  const tableDead = seats.filter((p) => !looksAlive(p)).length;
  const watching = state.players.filter((p) => !g.seats.includes(p.id));
  const log = g.log
    .filter((p) => !play || p.seq < play.seq)
    .slice()
    .reverse();
  const flyBase = play ? g.startDeck - play.received : 0;
  const winner = ending && ending.kind !== "noWinner" ? byId.get(ending.winnerId) : null;

  return (
    <div className="sb-game">
      <div ref={tableRef} className={`sb-table${anim?.beat === "schmilblick" ? " is-schmilblick" : ""}`}>
        <div className="sb-felt" aria-hidden="true" />

        <div className="sb-table-tools sb-narrow-only">
          <button type="button" className="btn btn-secondary is-sm" onClick={() => setLogOpen(true)}>
            Plays
            <span className="cn-meta">{log.length}</span>
          </button>
          <span className="cn-meta sb-table-facts">
            {g.startDeck} cards · d{g.sides} · {tableDead} out
          </span>
        </div>

        {seats.map((p) => {
          const { x, y } = pos(p.id);
          const alive = looksAlive(p);
          const active = holder === p.id && !ending;
          const dying = anim?.beat === "death" && play?.playerId === p.id;
          const receiving = anim?.beat === "pass" && play?.nextId === p.id;
          const won = winner?.id === p.id;
          return (
            <div
              key={p.id}
              className={[
                "sb-seat",
                active && "is-active",
                !alive && "is-dead",
                dying && "is-dying",
                receiving && "is-receiving",
                won && "is-winner",
                p.id === you && "is-you",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ ...accentVar(p.accent), left: `${x}%`, top: `${y}%` }}
            >
              {won && <Crown className="sb-crown" />}
              {anim?.beat === "schmilblick" && alive && <Mug className="sb-mug" />}
              {dying && <Ghost className="sb-ghost-rise" />}
              <div className="sb-seat-body">
                <span className="sb-seat-avatar">{alive ? <Avatar p={p} /> : <Ghost className="sb-ghost" />}</span>
                <span className="cn-name cn-truncate sb-seat-name">{p.name}</span>
                <span className="cn-meta sb-seat-meta">
                  {cardsShown(p)} {cardsShown(p) === 1 ? "card" : "cards"}
                  {!p.connected && " · away"}
                </span>
              </div>
              <MiniFan count={cardsShown(p)} seed={p.id.charCodeAt(0)} />
            </div>
          );
        })}

        <div className="sb-center">
          {!ending && (
            <>
              <div ref={deckRef} className={`sb-deck${deckShown === 0 ? " is-empty" : ""}`} aria-label={`${deckShown} cards in the deck`}>
                {Array.from({ length: Math.min(6, Math.ceil(deckShown / 12)) }, (_, k) => (
                  <CardBack key={k} className="sb-deck-card" style={{ "--k": k } as CSSProperties} />
                ))}
                <span className={`sb-deck-count cn-value-lg${isDeathDeck(deckShown) && deckShown > 0 ? " is-death" : ""}`} key={deckShown}>
                  {deckShown}
                </span>
              </div>

              <div className="sb-dice" style={accentVar(byId.get(holder ?? "")?.accent ?? "mauve")}>
                <RollingDie sides={MAX_TAKE} rolling={anim?.beat === "d8"} value={play ? play.roll : null} />
                {play && play.schmilRoll !== null && reached(anim, "blick") && (
                  <RollingDie sides={g.sides} rolling={anim?.beat === "blick"} value={play.schmilRoll} hot={play.schmilblick} />
                )}
              </div>

              <p className="cn-copy cn-text-center sb-caption" aria-live="polite">
                {caption}
              </p>
            </>
          )}

          {state.phase === "playing" && !anim && (
            <div className="sb-turn-actions">
              {myTurn ? (
                <>
                  <button type="button" className="btn btn-primary sb-roll" disabled={!canRoll} onClick={() => send({ t: "roll" })}>
                    Roll the d8
                  </button>
                  {afkLeft <= 10 && afkLeft > 0 && <span className="cn-meta">Auto-rolls in {afkLeft}s</span>}
                </>
              ) : (
                <span className="cn-row cn-meta">
                  <span className="spinner" aria-hidden="true" /> Waiting for {nameOf(g.currentId)}
                </span>
              )}
            </div>
          )}

          {ending && (
            <div className="sb-ending">
              {winner ? (
                <>
                  <Crown className="sb-ending-icon" />
                  <h2 className="cn-display is-sm">{winner.id === you ? "You win!" : `${winner.name} wins!`}</h2>
                  <p className="cn-copy">{ending.kind === "lastCard" ? "Took the last card." : "Last one standing."}</p>
                </>
              ) : (
                <>
                  <Ghost className="sb-ending-icon" />
                  <h2 className="cn-display is-sm">Nobody wins</h2>
                  <p className="cn-copy">
                    {ending.kind === "noWinner" && `${nameOf(ending.loserId)} got the last deck, and it was a death deck.`}
                  </p>
                </>
              )}
              {state.hostId === you ? (
                <button type="button" className="btn btn-primary cn-mt-12" onClick={() => send({ t: "lobby" })}>
                  Back to the lobby
                </button>
              ) : (
                <p className="cn-meta cn-mt-12">The host can take everyone back to the lobby.</p>
              )}
            </div>
          )}
        </div>

        {anim?.beat === "fly" &&
          play &&
          Array.from({ length: play.took }, (_, k) => {
            const to = pos(play.playerId);
            return (
              <CuteCard
                key={`${play.seq}-${k}`}
                n={flyBase + k}
                className="sb-flying"
                style={
                  {
                    "--tx": to.x - 50,
                    "--ty": to.y - 50,
                    "--ox": `${deckOffset.x}px`,
                    "--oy": `${deckOffset.y}px`,
                    "--k": k,
                    "--spin": `${(k % 2 ? 1 : -1) * (12 + k * 5)}deg`,
                  } as CSSProperties
                }
              />
            );
          })}

        {anim?.beat === "pass" && play?.nextId && play.dir && (
          <PassingDeck
            key={play.seq}
            tableRef={tableRef}
            from={g.seats.indexOf(play.playerId)}
            to={g.seats.indexOf(play.nextId)}
            n={n}
            offset={offset}
            dir={play.dir}
            remaining={play.remaining}
          />
        )}

        {anim?.beat === "schmilblick" && (
          <div className="sb-schmilblick" aria-hidden="true">
            <span>Schmilblick!</span>
          </div>
        )}

        {winner && <Confetti />}
      </div>

      <aside className="panel sb-side sb-wide-only">
        <div className="panel-header">
          <h2>Plays</h2>
          <span className="cn-meta">
            {g.startDeck} cards · d{g.sides} · {tableDead} out
          </span>
        </div>
        <div className="sb-side-scroll scroll-well">
          <PlaysLog log={log} byId={byId} nameOf={nameOf} />
        </div>
        {watching.length > 0 && (
          <div className="panel-footer">
            <span className="cn-meta">{joinsNext(watching)}</span>
          </div>
        )}
      </aside>

      <Sheet kind="drawer" title="Plays" open={logOpen} onClose={() => setLogOpen(false)}>
        <PlaysLog log={log} byId={byId} nameOf={nameOf} />
        {watching.length > 0 && (
          <div className="panel-footer">
            <span className="cn-meta">{joinsNext(watching)}</span>
          </div>
        )}
      </Sheet>
    </div>
  );
}
