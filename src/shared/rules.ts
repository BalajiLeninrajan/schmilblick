// Schmilblick rules (CS343 A2 Q2), as pure functions shared by the worker and the tuner.

export const DEATH_DECK_DIVISOR = 7;
export const MAX_TAKE = 8; // d8
// The Schmilblick die. Rolling its top face means everyone drinks. The assignment uses a d10.
export const SCHMILBLICK_DICE = [4, 6, 8, 10] as const;
export type SchmilblickDie = (typeof SCHMILBLICK_DICE)[number];
export const DEFAULT_SCHMILBLICK_DIE: SchmilblickDie = 10;
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;

// Seats run clockwise. Facing the middle of the table, your left is clockwise.
export type Dir = "left" | "right";

export type Ending =
  | { kind: "lastCard"; winnerId: string } // took the last cards
  | { kind: "lastStanding"; winnerId: string } // everyone else died
  | { kind: "noWinner"; loserId: string } // the last player got a death deck
  | { kind: "mostCards"; winnerIds: string[]; cards: number }; // Tactique: most cards at the end, a tie shares the win

// Hasard is the assignment: a d8 picks how many cards you take.
// Tactique swaps the d8 for a hidden hand of cards you choose from, plus the Bidule block: a 7, or the card
// that makes 7 with the one the attacker just played. A Bidule sends the death deck back to the attacker, and
// whatever they take from it goes to the player who Bidule'd.
// You play a hand down to nothing before drawing a new one, so a 7 can't sit in it forever. Each player draws
// from their own bag of 1 to 8, like Tetris pieces, so every card comes round.
// A 1 or an 8 played on its own lets you pick which way the deck goes, so an attack can pick its victim.
// Instead of taking a card's worth, you can put it back on the deck: it scores nothing, but it can make a
// death deck.
// Nobody is knocked out of Tactique. A death wipes your total and you play on; the game ends on the last
// card, and the most cards wins.
export const MODES = ["hasard", "tactique"] as const;
export type Mode = (typeof MODES)[number];
export const HAND_SIZE = 3;
export const BIDULE_CARD = 7;
export const STEER_CARDS = [1, 8];

// How the deck you were handed behaves. Only Tactique ever leaves "normal".
//   returned: a Bidule sent it back to you; you can't Bidule it and you're out.
//   safe: a multiple of 7 that can't kill (a returned deck whose holder only had 7s).
export type DeckState = "normal" | "returned" | "safe";

export interface Play {
  playerId: string;
  received: number;
  receivedState: DeckState;
  roll: number; // d8 face in Hasard, the card played in Tactique
  took: number; // min(roll, received), or 0 for a card put back
  back?: boolean; // Tactique: the card went back on the deck instead
  remaining: number;
  death: boolean; // the player got a death deck: out in Hasard, wiped back to 0 cards in Tactique
  lost?: number; // Tactique: the total a death wiped (filled in by whoever keeps the totals)
  bidule: boolean; // blocked a death deck and sent it back to the attacker
  stolenBy?: string; // Tactique: the player whose Bidule sent this deck back, who gets what this play took
  wiped?: { id: string; lost: number }; // Tactique: a Bidule on the last cards can't send the deck back, so it wipes the attacker
  against?: number; // a Bidule that wasn't a 7: the attacker's card it made 7 with
  schmilRoll: number | null; // the Schmilblick die; null when the player died or the game ended
  schmilblick: boolean;
  dir: Dir | null; // null when the player took the last cards
  steered?: boolean; // the player picked dir with a 1 or an 8, instead of the deck's parity
  nextId: string | null;
  nextState: DeckState;
  ending: Ending | null;
}

export interface SeatLike {
  id: string;
  alive: boolean;
}

/** Uniform integer in [0, n). */
export type Rng = (n: number) => number;

export const isDeathDeck = (deck: number) => deck % DEATH_DECK_DIVISOR === 0;

/** Whether holding `deck` in `state` kills you unless you Bidule. */
export const isDeadly = (deck: number, state: DeckState) => state === "returned" || (state === "normal" && isDeathDeck(deck));

/** Cards a play adds to its player's total. In Tactique, what you take on the turn you die doesn't count. */
export const scored = (play: Pick<Play, "took" | "death">, mode: Mode) => (mode === "tactique" && play.death ? 0 : play.took);

/** How Tactique ends: whoever holds the most cards wins. */
export function mostCards(seats: { id: string; cards: number }[]): Ending {
  const cards = Math.max(...seats.map((s) => s.cards));
  return { kind: "mostCards", winnerIds: seats.filter((s) => s.cards === cards).map((s) => s.id), cards };
}

export function nextAlive(seats: SeatLike[], fromId: string, dir: Dir): SeatLike {
  const n = seats.length;
  const step = dir === "left" ? 1 : n - 1;
  let i = seats.findIndex((s) => s.id === fromId);
  for (let k = 0; k < n; k++) {
    i = (i + step) % n;
    if (seats[i].alive && seats[i].id !== fromId) return seats[i];
  }
  throw new Error("no other live player");
}

/** Who handed you the deck, and the card they played to do it. */
export interface Handoff {
  id: string;
  card: number;
}

/** How the deck reached `currentId`: from the last play, or null for the starting deck. */
export const handoffOf = (last: Play | null, currentId: string | null): Handoff | null =>
  last && currentId && last.nextId === currentId ? { id: last.playerId, card: last.roll } : null;

/** Cards in `hand` that Bidule a death deck: a 7, or the card that makes 7 with the attacker's. */
export function biduleCards(hand: number[], from: Handoff | null): number[] {
  const blocks = from && from.card < BIDULE_CARD ? [BIDULE_CARD, BIDULE_CARD - from.card] : [BIDULE_CARD];
  return [...new Set(hand.filter((c) => blocks.includes(c)))];
}

/** Cards a Tactique player may play from `hand` while holding `deck` in `state`, handed over by `from`. */
export function legalCards(hand: number[], deck: number, state: DeckState, from: Handoff | null): number[] {
  if (state === "normal" && isDeathDeck(deck)) {
    const bidules = biduleCards(hand, from);
    if (bidules.length) return bidules; // Bidule, or die
  }
  const cards = [...new Set(hand)];
  if (state === "returned") {
    const others = cards.filter((c) => c !== BIDULE_CARD);
    if (others.length) return others;
  }
  return cards;
}

/** Whether `card` lets its player pick the direction: a 1 or an 8 that leaves cards to pass. Never a Bidule. */
export const canSteer = (card: number, deck: number, back = false) => STEER_CARDS.includes(card) && (back || card < deck);

/** Whether a Tactique player may put a card back instead of taking. Never on a deck that would kill them. */
export const canPutBack = (deck: number, state: DeckState) => !isDeadly(deck, state);

/** A Tactique player's choices beyond the card itself. */
export interface TurnChoice {
  steer?: Dir; // where a 1 or an 8 sends the deck
  from?: Handoff | null; // who handed the deck over, for a Bidule
  back?: boolean; // put the card back on the deck instead of taking
}

/** Draws from a player's bag: one of each card from 1 to 8, shuffled, refilled once it runs out. */
export function drawCard(bag: number[], rng: Rng) {
  if (bag.length === 0) {
    bag.push(...Array.from({ length: MAX_TAKE }, (_, i) => i + 1));
    for (let i = bag.length - 1; i > 0; i--) {
      const j = rng(i + 1);
      [bag[i], bag[j]] = [bag[j], bag[i]];
    }
  }
  return bag.pop()!;
}

export const dealHand = (bag: number[], rng: Rng) => Array.from({ length: HAND_SIZE }, () => drawCard(bag, rng));

/** Takes `card` out of a Tactique hand, and deals a new hand from `bag` once the last card is gone. */
export function playFromHand(hand: number[], card: number, bag: number[], rng: Rng) {
  hand.splice(hand.indexOf(card), 1);
  if (hand.length === 0) hand.push(...dealHand(bag, rng));
}

/**
 * Resolves one turn: `playerId`, holding `deck` in `state`, takes `value` cards (a d8 roll or a played card),
 * or puts `value` back on the deck. The deck goes the way its parity says, the way `steer` says when a
 * Tactique player plays a 1 or an 8, or back to whoever handed it over (`from`) after a Bidule.
 * Mutates `seats` to knock out Hasard players. The Schmilblick die rolls only after a turn the player survives.
 */
export function resolveTurn(
  seats: SeatLike[],
  playerId: string,
  deck: number,
  state: DeckState,
  value: number,
  mode: Mode,
  rng: Rng,
  sides: SchmilblickDie = DEFAULT_SCHMILBLICK_DIE,
  { steer, from = null, back: wantsBack = false }: TurnChoice = {},
): Play {
  const me = seats.find((s) => s.id === playerId)!;
  const back = mode === "tactique" && wantsBack && canPutBack(deck, state);
  const took = back ? 0 : Math.min(value, deck);
  const remaining = back ? deck + value : deck - took;
  const deadly = isDeadly(deck, state);
  const bidule = mode === "tactique" && state === "normal" && deadly && biduleCards([value], from).length > 0;
  const death = deadly && !bidule;
  const out = death && mode === "hasard"; // a Tactique death wipes your total instead
  // A dying Tactique player can only leave a multiple of 7 by being forced to play a 7; that deck can't kill.
  const nextState: DeckState = bidule ? "returned" : mode === "tactique" && death && isDeathDeck(remaining) ? "safe" : "normal";
  const steered = mode === "tactique" && !bidule && steer !== undefined && canSteer(value, deck, back);
  const against = bidule && value !== BIDULE_CARD ? from!.card : undefined;
  const stolenBy = mode === "tactique" && state === "returned" && from ? from.id : undefined;
  const base = {
    playerId,
    received: deck,
    receivedState: state,
    roll: value,
    against,
    took,
    ...(stolenBy && { stolenBy }),
    ...(back && { back }),
    remaining,
    death,
    bidule,
    nextState,
  };

  if (remaining === 0) {
    const ending: Ending = out ? { kind: "noWinner", loserId: playerId } : { kind: "lastCard", winnerId: playerId };
    if (out) me.alive = false;
    return { ...base, schmilRoll: null, schmilblick: false, dir: null, nextId: null, ending };
  }

  // A Bidule goes back to the attacker. The starting deck has no attacker, so a 7 on it follows its parity.
  const sender = bidule && from ? seats.find((s) => s.id === from.id && s.alive) : undefined;
  let dir: Dir = steered ? steer! : remaining % 2 === 1 ? "left" : "right";
  if (sender) dir = nextAlive(seats, playerId, "left").id === sender.id ? "left" : "right";
  const next = sender ?? nextAlive(seats, playerId, dir);
  const route = { dir, steered, nextId: next.id };

  if (out) {
    me.alive = false;
    const alive = seats.filter((s) => s.alive);
    let ending: Ending | null = null;
    if (alive.length === 1) {
      // The survivor receives the deck and wins, unless that deck is also a death deck.
      const lethal = nextState === "normal" && isDeathDeck(remaining);
      ending = lethal ? { kind: "noWinner", loserId: next.id } : { kind: "lastStanding", winnerId: next.id };
      if (lethal) next.alive = false;
    }
    return { ...base, ...route, schmilRoll: null, schmilblick: false, ending };
  }
  if (death) return { ...base, ...route, schmilRoll: null, schmilblick: false, ending: null };

  const schmilRoll = rng(sides) + 1;
  return { ...base, ...route, schmilRoll, schmilblick: schmilRoll === sides, ending: null };
}

/** A Hasard turn. The d8 roll comes first, then the Schmilblick die, matching the assignment's PRNG call order. */
export function playTurn(
  seats: SeatLike[],
  playerId: string,
  deck: number,
  rng: Rng,
  sides: SchmilblickDie = DEFAULT_SCHMILBLICK_DIE,
): Play {
  return resolveTurn(seats, playerId, deck, "normal", rng(MAX_TAKE) + 1, "hasard", rng, sides);
}
