import { useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AFK_MS, BEATS, type LobbyState, type PublicPlayer, type SeqPlay } from "../shared/protocol";
import {
  BIDULE_CARD,
  biduleCards,
  canPutBack,
  canSteer,
  DEATH_DECK_DIVISOR,
  handoffOf,
  isDeadly,
  isDeathDeck,
  legalCards,
  MAX_TAKE,
  nextAlive,
  scored,
  type Dir,
} from "../shared/rules";
import { accentVar, ArrowIcon, CardBack, Crown, CuteCard, Die, Ghost, Mug } from "./art";
import { Avatar } from "./LobbyPage";
import { Sheet } from "./Sheet";
import type { useLobby } from "./useLobby";

// "d8" is the take reveal: the d8 tumbling in Hasard, the played card flipping in Tactique.
type Beat = "d8" | "fly" | "death" | "bidule" | "blick" | "schmilblick" | "pass";
const ORDER: Beat[] = ["d8", "fly", "death", "bidule", "blick", "schmilblick", "pass"];

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
    if (lastPlay.bidule) beats.push(["bidule", BEATS.bidule]);
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

/** A Tactique player's hand at their seat, face down so everyone can count it. Your own hand is already in front of you. */
function HandFan({ count }: { count: number }) {
  return (
    <span className="sb-fan is-hand" role="img" aria-label={`${count} ${count === 1 ? "card" : "cards"} in hand`}>
      {Array.from({ length: count }, (_, k) => (
        <CardBack key={k} style={{ "--k": k - (count - 1) / 2 } as CSSProperties} />
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

function PlaysLog({
  log,
  byId,
  nameOf,
  verb,
}: {
  log: SeqPlay[];
  byId: Map<string, PublicPlayer>;
  nameOf: (id: string | null) => string;
  verb: "rolled" | "played";
}) {
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
                {who?.name ?? "?"} {p.back ? `put back ${p.roll}` : `took ${p.took}`}
                {p.stolenBy && `, stolen by ${nameOf(p.stolenBy)}`}
                {p.wiped && `, wiped ${nameOf(p.wiped.id)}`}
              </div>
              <div className="cn-meta">
                {verb} {p.roll} · {p.remaining} left
                {p.dir ? ` · ${p.steered ? "sent " : ""}${p.dir} to ${nameOf(p.nextId)}` : ""}
              </div>
            </div>
            <div className="cn-row sb-log-tags">
              {p.death && <span className="tag cn-tone-red">Death</span>}
              {p.bidule && <span className="tag cn-tone-peach">Bidule</span>}
              {p.schmilblick && <span className="tag cn-tone-yellow">Schmilblick</span>}
              {/* In Tactique, the last card ends the game but the most cards wins. */}
              {p.ending?.kind === "lastCard" && verb === "rolled" && <span className="tag cn-tone-green">Win</span>}
            </div>
          </li>
        );
      })}
    </ol>
  );
}

/** Players who joined mid-game, as a stack of avatars. */
function NextGame({ players }: { players: PublicPlayer[] }) {
  return (
    <div className="cn-row">
      <span className="avatar-stack">
        {players.map((p) => (
          <span key={p.id} className="cn-fit" data-tip={`${p.name} joins next game`}>
            <Avatar p={p} />
          </span>
        ))}
      </span>
      <span className="cn-meta">Next game</span>
      <span className="cn-sr-only">{players.map((p) => p.name).join(", ")} will join the next game</span>
    </div>
  );
}

/** True on touch screens, where a first tap previews a card and a second tap plays it.
    A tap also fires mouseenter and focus, so those only preview on devices that can hover. */
const noHover = () => typeof matchMedia === "function" && matchMedia("(hover: none)").matches;

export function Game({
  state,
  you,
  hand,
  send,
}: {
  state: LobbyState;
  you: string;
  hand: number[] | null;
  send: ReturnType<typeof useLobby>["send"];
}) {
  const g = state.game!;
  const tactique = g.mode === "tactique";
  const [preview, setPreview] = useState<number | null>(null);
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
  const cardsShown = (p: PublicPlayer) => {
    if (play && p.id === play.stolenBy) return reached(anim, "fly") ? p.cards : p.cards - play.took;
    if (play?.wiped?.id === p.id) return reached(anim, "bidule") ? p.cards : play.wiped.lost;
    if (!play || p.id !== play.playerId) return p.cards;
    if (play.lost !== undefined && !reached(anim, "death")) return play.lost; // a Tactique death wipes it at the death beat
    return reached(anim, "fly") ? p.cards : p.cards - scored(play, g.mode);
  };
  const nameOf = (id: string | null | undefined) => (id ? (byId.get(id)?.name ?? "someone") : "someone");

  const myTurn = state.phase === "playing" && !anim && g.currentId === you;
  const canRoll = myTurn && now >= readyAt - 300;
  const afkLeft = Math.ceil((readyAt + AFK_MS - now) / 1000);
  // Who handed you the deck, and with which card: a Bidule can make 7 with it.
  const from = handoffOf(g.lastPlay, g.currentId);
  const legal = tactique && hand ? legalCards(hand, g.deck, g.deckState, from) : [];
  // On a death deck you hold a Bidule for, the Bidules are your only cards.
  const mustBidule = g.deckState === "normal" && isDeathDeck(g.deck) && !!hand && biduleCards(hand, from).length > 0;
  // Drag a card onto the deck to put it back instead of taking it. Not on a deck that would kill you.
  const mayPutBack = tactique && canPutBack(g.deck, g.deckState);
  const canPick = (card: number) => canRoll && legal.includes(card);
  // A 1 or an 8 waiting for its player to pick which way the deck goes.
  const [aim, setAim] = useState<{ card: number; back: boolean } | null>(null);
  const [aimDir, setAimDir] = useState<Dir | null>(null);
  const liveSeats = seats.map((p) => ({ id: p.id, alive: p.alive }));
  const neighbor = (dir: Dir) => nameOf(nextAlive(liveSeats, you, dir).id);
  /** Whether playing `card` asks which way to send the deck. Not for a Bidule, or when both ways reach the same player. */
  const steerable = (card: number, back = false) =>
    !mustBidule && canSteer(card, g.deck, back) && nextAlive(liveSeats, you, "left").id !== nextAlive(liveSeats, you, "right").id;
  /** Plays `card`: takes it, or puts it back. A 1 or an 8 waits for a direction first. */
  const pick = (card: number, back = false) => {
    if (!canPick(card) || (back && !mayPutBack)) return;
    setPreview(null);
    if (steerable(card, back)) setAim(aim?.card === card && aim.back === back ? null : { card, back });
    else {
      setAim(null);
      send({ t: "play", card, back: back || undefined });
    }
  };
  const steer = (dir: Dir) => {
    if (aim === null) return;
    setAim(null);
    setAimDir(null);
    send({ t: "play", card: aim.card, dir, back: aim.back || undefined });
  };

  // Dragging a card from your hand: onto the deck puts it back, onto your seat takes it.
  type DropTarget = "deck" | "seat" | null;
  const [drag, setDrag] = useState<{ card: number; i: number; x: number; y: number; target: DropTarget } | null>(null);
  const press = useRef<{ card: number; i: number; x: number; y: number } | null>(null);
  const dragged = useRef(false); // swallows the click a drag ends with
  const dropTarget = (x: number, y: number): DropTarget => {
    const d = deckRef.current?.getBoundingClientRect();
    const pad = 28; // the deck is small; give the drop some slack
    if (mayPutBack && d && x > d.left - pad && x < d.right + pad && y > d.top - pad && y < d.bottom + pad) return "deck";
    const seat = document.elementFromPoint(x, y)?.closest("[data-seat]");
    return seat?.getAttribute("data-seat") === you ? "seat" : null;
  };
  const onCardDown = (e: React.PointerEvent, card: number, i: number) => {
    if (!canPick(card) || e.button !== 0) return;
    press.current = { card, i, x: e.clientX, y: e.clientY };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onCardMove = (e: React.PointerEvent) => {
    const p = press.current;
    if (!p) return;
    if (!drag && Math.hypot(e.clientX - p.x, e.clientY - p.y) < 8) return;
    setPreview(null);
    setDrag({ card: p.card, i: p.i, x: e.clientX, y: e.clientY, target: dropTarget(e.clientX, e.clientY) });
  };
  const onCardUp = () => {
    const d = drag;
    press.current = null;
    if (!d) return;
    dragged.current = true;
    setDrag(null);
    if (d.target) pick(d.card, d.target === "deck");
  };
  const onCardCancel = () => {
    press.current = null;
    setDrag(null);
  };

  useEffect(() => {
    setPreview(null);
    setAim(null);
    setAimDir(null);
    setDrag(null);
    press.current = null;
  }, [g.currentId, g.lastPlay?.seq]);

  useEffect(() => {
    if (!canRoll) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (tactique) {
        // 1, 2, 3 take the cards in your hand from left to right, and Shift puts them back instead (the keyboard's drag).
        // The arrow keys send a 1 or an 8 that way, and Escape cancels it.
        if (e.key === "Escape") setAim(null);
        if (aim !== null && (e.key === "ArrowLeft" || e.key === "ArrowRight")) steer(e.key === "ArrowLeft" ? "left" : "right");
        const slot = /^Digit[1-9]$/.test(e.code) ? Number(e.code.slice(5)) : NaN;
        const card = hand?.[slot - 1];
        if (card !== undefined) pick(card, e.shiftKey);
        return;
      }
      if ((e.key === " " || e.key === "Enter") && !(e.target instanceof HTMLButtonElement)) {
        e.preventDefault();
        send({ t: "roll" });
      }
    };
    addEventListener("keydown", onKey);
    return () => removeEventListener("keydown", onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  /** What playing `card` would do (putting it `back`, sending it `dir` for a 1 or an 8), for the preview. */
  const verdictOf = (mine: number, top: { name: string; cards: number }) =>
    mine > top.cards ? "You win!" : mine === top.cards ? `You tie with ${top.name}.` : `${top.name} still took more.`;
  const previewText = (card: number, dir?: Dir, back = false) => {
    if (back) {
      const remaining = g.deck + card;
      const lethal = isDeathDeck(remaining);
      if (!dir && steerable(card, true)) return `Puts back a ${card}, making ${remaining}${lethal ? ", a death deck 💀" : ""}. You pick who gets it.`;
      const way = dir ?? (remaining % 2 ? "left" : "right");
      const to = neighbor(way);
      return `Puts back a ${card}, making ${remaining}, ${way} to ${to}.${lethal ? ` Death deck for ${to} 💀` : ""} You score nothing.`;
    }
    const deadly = isDeadly(g.deck, g.deckState);
    const bidule = mustBidule; // every card you can play is a Bidule then
    const remaining = g.deck - Math.min(card, g.deck);
    if (remaining === 0) {
      if (deadly && !bidule) return "Takes the last cards and ends the game, but the death deck wipes you back to 0.";
      const mine = (byId.get(you)?.cards ?? 0) + card;
      // A Bidule on the last cards wipes the attacker.
      const wiped = bidule ? from?.id : undefined;
      const top = seats
        .filter((p) => p.id !== you)
        .map((p) => (p.id === wiped ? { ...p, cards: 0 } : p))
        .reduce((a, p) => (p.cards > a.cards ? p : a), { name: "", cards: 0 });
      if (wiped) return `Bidule! Takes the last cards, wipes ${nameOf(wiped)}, and ends the game on ${mine}. ${verdictOf(mine, top)}`;
      return `Takes the last cards and ends the game on ${mine}. ${verdictOf(mine, top)}`;
    }
    const lethal = !deadly && isDeathDeck(remaining);
    const out = deadly ? ` Then you're wiped back to 0.` : "";
    if (!dir && steerable(card)) return `Leaves ${remaining}${lethal ? ", a death deck 💀" : ""}. You pick who gets it.${out}`;
    const way = dir ?? (remaining % 2 ? "left" : "right");
    if (bidule) return `Bidule! Sends ${remaining} back to ${from ? nameOf(from.id) : neighbor(way)}, and you steal whatever they take.`;
    const to = neighbor(way);
    return `Leaves ${remaining}, ${way} to ${to}.${lethal ? ` Death deck for ${to} 💀` : ""}${out}`;
  };

  // ---- caption ----
  let caption: React.ReactNode;
  if (play && anim) {
    const who = nameOf(play.playerId);
    switch (anim.beat) {
      case "d8":
        caption = !tactique ? `${who} rolls the d8…` : play.back ? `${who} puts back a ${play.roll}.` : `${who} plays a ${play.roll}.`;
        break;
      case "fly":
        caption = play.back
          ? `${who} puts ${play.roll} back on the deck, making ${play.remaining}.`
          : play.took < play.roll
            ? `${tactique ? "Played" : "Rolled"} ${play.roll}, but only ${play.took} left. ${who} takes them all.`
            : `${who} takes ${play.took}.`;
        if (play.stolenBy) caption = `${caption} ${nameOf(play.stolenBy)} steals them.`;
        break;
      case "death":
        caption =
          play.receivedState === "returned" ? (
            <>
              <b>Bidule'd.</b> {who} can't block a deck that came back, so {tactique ? `${who} loses all ${play.lost ?? 0} cards` : `${who} is out`}.
            </>
          ) : (
            <>
              <b>Death deck.</b> {play.received} is {DEATH_DECK_DIVISOR} × {play.received / DEATH_DECK_DIVISOR}, so{" "}
              {tactique ? `${who} loses all ${play.lost ?? 0} cards` : `${who} is out`}.
            </>
          );
        break;
      case "bidule":
        caption = `Bidule! ${who} blocks with ${play.against ? `a ${play.roll} (${play.against} + ${play.roll} = 7)` : "a 7"}${play.nextId ? ` and sends it back to ${nameOf(play.nextId)}` : ""}.${play.wiped ? ` No cards left to send back, so ${nameOf(play.wiped.id)} loses all ${play.wiped.lost}.` : ""}`;
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
            {play.bidule
              ? `${play.remaining} goes back to ${nameOf(play.nextId)}`
              : play.steered
              ? `${who} sends ${play.remaining} ${play.dir} to ${nameOf(play.nextId)}`
              : `${play.remaining} left, ${play.remaining % 2 ? "odd" : "even"}, so it goes ${play.dir} to ${nameOf(play.nextId)}`}
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
    const mine = g.currentId === you;
    const who = mine ? "Your" : `${nameOf(g.currentId)}'s`;
    if (tactique && mine && drag)
      caption = drag.target
        ? previewText(drag.card, undefined, drag.target === "deck")
        : mayPutBack
          ? "Drop it on the deck to put it back, or on your seat to take it."
          : "Drop it on your seat to take it. No putting back on a death deck.";
    else if (tactique && mine && preview !== null) caption = previewText(preview);
    else if (tactique && mine && aim !== null) caption = previewText(aim.card, aimDir ?? undefined, aim.back);
    else if (g.deckState === "returned")
      caption = (
        <>
          {who} turn, holding {g.deck}. <b className="cn-text-red">Bidule'd 💀</b>
          {mine &&
            (tactique
              ? ` Whatever you play, you're wiped back to 0${from ? `, and ${nameOf(from.id)} steals what you take` : ""}.`
              : " Play your last card.")}
        </>
      );
    else if (g.deckState === "normal" && isDeathDeck(g.deck))
      caption = (
        <>
          {who} turn, holding {g.deck}. <b className="cn-text-red">Death deck 💀</b>
          {mine &&
            tactique &&
            (mustBidule
              ? from && from.card < BIDULE_CARD
                ? ` Bidule with a 7, or a ${BIDULE_CARD - from.card} to make 7 with ${nameOf(from.id)}'s ${from.card}!`
                : " Play your 7 for a Bidule!"
              : " Nothing in your hand blocks it, so you'll be wiped back to 0.")}
        </>
      );
    else caption = `${who} turn, holding ${g.deck}.`;
  }

  const tableDead = seats.filter((p) => !looksAlive(p)).length;
  const watching = state.players.filter((p) => !g.seats.includes(p.id));
  const log = g.log
    .filter((p) => !play || p.seq < play.seq)
    .slice()
    .reverse();
  const flyBase = play ? g.startDeck - play.received : 0;
  const winners = !ending || ending.kind === "noWinner" ? [] : ending.kind === "mostCards" ? ending.winnerIds : [ending.winnerId];
  const winTitle = winners.includes(you)
    ? winners.length === 1
      ? "You win!"
      : "You share the win!"
    : `${winners.map(nameOf).join(" and ")} ${winners.length === 1 ? "wins" : "win"}!`;

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
            {tactique ? "Tactique · " : ""}
            {g.startDeck} cards · d{g.sides}
            {!tactique && ` · ${tableDead} out`}
          </span>
        </div>

        {seats.map((p) => {
          const { x, y } = pos(p.id);
          const alive = looksAlive(p);
          const active = holder === p.id && !ending;
          const dying = anim?.beat === "death" && play?.playerId === p.id;
          const receiving = anim?.beat === "pass" && play?.nextId === p.id;
          const won = winners.includes(p.id);
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
                p.id === you && drag && "is-drop",
                p.id === you && drag?.target === "seat" && "is-drop-hot",
              ]
                .filter(Boolean)
                .join(" ")}
              style={{ ...accentVar(p.accent), left: `${x}%`, top: `${y}%` }}
              data-seat={p.id}
            >
              {won && <Crown className="sb-crown" />}
              {anim?.beat === "schmilblick" && alive && <Mug className="sb-mug" />}
              {dying && <Ghost className="sb-ghost-rise" />}
              <div className="sb-seat-body">
                <span className="sb-seat-avatar">{alive ? <Avatar p={p} /> : <Ghost className="sb-ghost" />}</span>
                <span className="cn-name cn-truncate sb-seat-name">{p.name}</span>
                <span className="cn-meta sb-seat-meta">
                  {cardsShown(p)} {tactique ? "taken" : cardsShown(p) === 1 ? "card" : "cards"}
                  {!p.connected && " · away"}
                </span>
              </div>
              {tactique ? (
                p.id !== you && <HandFan count={g.handSizes?.[p.id] ?? 0} />
              ) : (
                <MiniFan count={cardsShown(p)} seed={p.id.charCodeAt(0)} />
              )}
            </div>
          );
        })}

        <div className="sb-center">
          {!ending && (
            <>
              <div
                ref={deckRef}
                className={`sb-deck${deckShown === 0 ? " is-empty" : ""}${drag && mayPutBack ? " is-drop" : ""}${drag?.target === "deck" ? " is-drop-hot" : ""}`}
                aria-label={`${deckShown} cards in the deck`}
              >
                {Array.from({ length: Math.min(6, Math.ceil(deckShown / 12)) }, (_, k) => (
                  <CardBack key={k} className="sb-deck-card" style={{ "--k": k } as CSSProperties} />
                ))}
                <span className={`sb-deck-count cn-value-lg${isDeathDeck(deckShown) && deckShown > 0 ? " is-death" : ""}`} key={deckShown}>
                  {deckShown}
                </span>
              </div>

              <div className="sb-dice" style={accentVar(byId.get(holder ?? "")?.accent ?? "mauve")}>
                {tactique ? (
                  play && <CuteCard key={play.seq} n={play.roll} value={play.roll} className="sb-played" />
                ) : (
                  <RollingDie sides={MAX_TAKE} rolling={anim?.beat === "d8"} value={play ? play.roll : null} />
                )}
                {play && play.schmilRoll !== null && reached(anim, "blick") && (
                  <RollingDie sides={g.sides} rolling={anim?.beat === "blick"} value={play.schmilRoll} hot={play.schmilblick} />
                )}
              </div>

              <p className="cn-copy cn-text-center sb-caption" aria-live="polite">
                {caption}
              </p>
            </>
          )}

          {/* Your Tactique hand stays up while plays animate. Everything else waits for the table to settle. */}
          {state.phase === "playing" && (!anim || (tactique && hand)) && (
            <div className="sb-turn-actions">
              {tactique && hand ? (
                <>
                  <div className={`sb-hand${canRoll ? " is-live" : ""}`} role="group" aria-label="Your hand">
                    {hand.map((card, i) => {
                      const playable = canPick(card);
                      const aimed = aim?.card === card && hand.indexOf(card) === i;
                      const picked = preview === card || aimed;
                      return (
                        <button
                          key={`${i}-${card}`}
                          type="button"
                          className={`sb-hand-card${picked ? " is-picked" : ""}${mustBidule && playable ? " is-bidule" : ""}${drag?.i === i ? " is-dragging" : ""}`}
                          disabled={!playable}
                          aria-label={`Take ${card}${mayPutBack ? `, or Shift+${i + 1} to put it back` : ""}`}
                          aria-pressed={aimed}
                          onPointerDown={(e) => onCardDown(e, card, i)}
                          onPointerMove={onCardMove}
                          onPointerUp={onCardUp}
                          onPointerCancel={onCardCancel}
                          onMouseEnter={() => playable && !noHover() && setPreview(card)}
                          onMouseLeave={() => !noHover() && setPreview(null)}
                          onFocus={() => playable && !noHover() && setPreview(card)}
                          onClick={() => {
                            if (dragged.current) return void (dragged.current = false);
                            if (noHover() && preview !== card) setPreview(card);
                            else pick(card);
                          }}
                        >
                          <CuteCard n={card} value={card} />
                        </button>
                      );
                    })}
                  </div>
                  {aim !== null && canRoll && (
                    <div className="cn-row sb-steer" role="group" aria-label={`Send the deck with your ${aim.card}`}>
                      {(["left", "right"] as const).map((d) => (
                        <button
                          key={d}
                          type="button"
                          className="btn btn-secondary is-sm"
                          onClick={() => steer(d)}
                          onMouseEnter={() => setAimDir(d)}
                          onMouseLeave={() => setAimDir(null)}
                          onFocus={() => setAimDir(d)}
                          onBlur={() => setAimDir(null)}
                        >
                          {d === "left" && (
                            <span className="cn-icon">
                              <ArrowIcon dir="left" />
                            </span>
                          )}
                          {neighbor(d)}
                          {d === "right" && (
                            <span className="cn-icon">
                              <ArrowIcon dir="right" />
                            </span>
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                  {anim ? null : myTurn ? (
                    afkLeft <= 10 && afkLeft > 0 && <span className="cn-meta">Auto-plays in {afkLeft}s</span>
                  ) : (
                    <span className="cn-row cn-meta">
                      <span className="spinner" aria-hidden="true" /> Waiting for {nameOf(g.currentId)}
                    </span>
                  )}
                </>
              ) : myTurn ? (
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
              {winners.length > 0 ? (
                <>
                  <Crown className="sb-ending-icon" />
                  <h2 className="cn-display is-sm">{winTitle}</h2>
                  <p className="cn-copy">
                    {ending.kind === "mostCards"
                      ? `Took ${ending.cards} ${winners.length > 1 ? "cards each" : "cards"}, the most at the table.`
                      : ending.kind === "lastCard"
                        ? "Took the last card."
                        : "Last one standing."}
                  </p>
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

        {drag &&
          createPortal(
            <CuteCard n={drag.card} value={drag.card} className="sb-drag-card" style={{ left: drag.x, top: drag.y }} />,
            document.body,
          )}

        {anim?.beat === "fly" &&
          play &&
          Array.from({ length: play.took }, (_, k) => {
            const to = pos(play.stolenBy ?? play.playerId);
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

        {anim?.beat === "bidule" && (
          <div className="sb-schmilblick is-bidule" aria-hidden="true">
            <span>Bidule!</span>
          </div>
        )}

        {winners.length > 0 && <Confetti />}
      </div>

      <aside className="panel sb-side sb-wide-only">
        <div className="panel-header">
          <h2>Plays</h2>
          <span className="cn-meta">
            {tactique ? "Tactique · " : ""}
            {g.startDeck} cards · d{g.sides}
            {!tactique && ` · ${tableDead} out`}
          </span>
        </div>
        <div className="sb-side-scroll scroll-well">
          <PlaysLog log={log} byId={byId} nameOf={nameOf} verb={tactique ? "played" : "rolled"} />
        </div>
        {watching.length > 0 && (
          <div className="panel-footer">
            <NextGame players={watching} />
          </div>
        )}
      </aside>

      <Sheet kind="drawer" title="Plays" open={logOpen} onClose={() => setLogOpen(false)}>
        <PlaysLog log={log} byId={byId} nameOf={nameOf} verb={tactique ? "played" : "rolled"} />
        {watching.length > 0 && (
          <div className="panel-footer">
            <NextGame players={watching} />
          </div>
        )}
      </Sheet>
    </div>
  );
}
