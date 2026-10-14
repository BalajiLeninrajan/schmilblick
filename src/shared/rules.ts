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
  | { kind: "noWinner"; loserId: string }; // the last player got a death deck

// Hasard is the assignment: a d8 picks how many cards you take.
// Tactique swaps the d8 for a hidden hand of cards you choose from, plus the Bidule block: a 7, or two
// cards that add up to 7. You play a hand down to nothing before drawing a new one, so a 7 can't sit in it
// forever. Each player draws from their own bag of 1 to 8, like Tetris pieces, so every card comes round.
// A 1 or an 8 played on its own lets you pick which way the deck goes, so an attack can pick its victim.
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
  roll: number; // d8 face in Hasard, the card played in Tactique (the sum, for a pair)
  cards?: number[]; // the cards played in Tactique: two for a pair Bidule
  took: number; // min(roll, received)
  remaining: number;
  death: boolean; // the player leaves after this play
  bidule: boolean; // blocked a death deck with a 7 and sent it back
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

/** A Tactique move: one card, or two that add up to 7 for a Bidule. Pairs are listed low card first. */
export type Move = number[];

/** The ways `hand` can Bidule: a 7, or two cards that add up to 7. */
export function biduleMoves(hand: number[]): Move[] {
  const moves: Move[] = hand.includes(BIDULE_CARD) ? [[BIDULE_CARD]] : [];
  for (let a = 1; a < BIDULE_CARD / 2; a++) if (hand.includes(a) && hand.includes(BIDULE_CARD - a)) moves.push([a, BIDULE_CARD - a]);
  return moves;
}

/** Moves a Tactique player may make from `hand` while holding `deck` in `state`. */
export function legalMoves(hand: number[], deck: number, state: DeckState): Move[] {
  if (state === "normal" && isDeathDeck(deck)) {
    const bidules = biduleMoves(hand);
    if (bidules.length) return bidules; // Bidule, or die
  }
  const singles = [...new Set(hand)];
  if (state === "returned") {
    const others = singles.filter((c) => c !== BIDULE_CARD);
    if (others.length) return others.map((c) => [c]);
  }
  return singles.map((c) => [c]);
}

/** Whether `move` lets its player pick the direction: a 1 or an 8 on its own that leaves cards to pass. */
export const canSteer = (move: Move, deck: number) => move.length === 1 && STEER_CARDS.includes(move[0]) && move[0] < deck;

export function sameMove(a: Move, b: Move) {
  const [x, y] = [a, b].map((m) => [...m].sort((p, q) => p - q));
  return x.length === y.length && x.every((c, i) => c === y[i]);
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

/** Takes `move` out of a Tactique hand, and deals a new hand from `bag` once the last card is gone. */
export function playFromHand(hand: number[], move: Move, bag: number[], rng: Rng) {
  for (const c of move) hand.splice(hand.indexOf(c), 1);
  if (hand.length === 0) hand.push(...dealHand(bag, rng));
}

/**
 * Resolves one turn: `playerId`, holding `deck` in `state`, takes as many cards as `cards` add up to
 * (a d8 roll, a played card, or a pair played for a Bidule). The deck goes the way its parity says,
 * or the way `steer` says when a Tactique player plays a 1 or an 8.
 * Mutates `seats` to mark deaths. The Schmilblick die rolls only after a turn the player survives.
 */
export function resolveTurn(
  seats: SeatLike[],
  playerId: string,
  deck: number,
  state: DeckState,
  cards: number[],
  mode: Mode,
  rng: Rng,
  sides: SchmilblickDie = DEFAULT_SCHMILBLICK_DIE,
  steer?: Dir,
): Play {
  const me = seats.find((s) => s.id === playerId)!;
  const value = cards.reduce((a, b) => a + b, 0);
  const took = Math.min(value, deck);
  const remaining = deck - took;
  const deadly = isDeadly(deck, state);
  const bidule = mode === "tactique" && state === "normal" && deadly && value === BIDULE_CARD;
  const death = deadly && !bidule;
  // A dying Tactique player can only leave a multiple of 7 by being forced to play a 7; that deck can't kill.
  const nextState: DeckState = bidule ? "returned" : mode === "tactique" && death && isDeathDeck(remaining) ? "safe" : "normal";
  const steered = mode === "tactique" && steer !== undefined && canSteer(cards, deck);
  const base = { playerId, received: deck, receivedState: state, roll: value, cards, took, remaining, death, bidule, nextState };

  if (remaining === 0) {
    const ending: Ending = death ? { kind: "noWinner", loserId: playerId } : { kind: "lastCard", winnerId: playerId };
    if (death) me.alive = false;
    return { ...base, schmilRoll: null, schmilblick: false, dir: null, nextId: null, ending };
  }

  const dir: Dir = steered ? steer! : remaining % 2 === 1 ? "left" : "right";
  const next = nextAlive(seats, playerId, dir);
  const route = { dir, steered, nextId: next.id };

  if (death) {
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
  return resolveTurn(seats, playerId, deck, "normal", [rng(MAX_TAKE) + 1], "hasard", rng, sides);
}
