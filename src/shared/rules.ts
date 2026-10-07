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
// Tactique swaps the d8 for a hidden hand of cards you choose from, plus the Bidule block.
export const MODES = ["hasard", "tactique"] as const;
export type Mode = (typeof MODES)[number];
export const HAND_SIZE = 3;
export const BIDULE_CARD = 7;

// How the deck you were handed behaves. Only Tactique ever leaves "normal".
//   returned: a Bidule sent it back to you; you can't Bidule it and you're out.
//   safe: a multiple of 7 that can't kill (a returned deck whose holder only had 7s).
export type DeckState = "normal" | "returned" | "safe";

export interface Play {
  playerId: string;
  received: number;
  receivedState: DeckState;
  roll: number; // d8 face in Hasard, the card played in Tactique
  took: number; // min(roll, received)
  remaining: number;
  death: boolean; // the player leaves after this play
  bidule: boolean; // blocked a death deck with a 7 and sent it back
  schmilRoll: number | null; // the Schmilblick die; null when the player died or the game ended
  schmilblick: boolean;
  dir: Dir | null; // null when the player took the last cards
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

/** Cards a Tactique player may play from `hand` while holding `deck` in `state`. */
export function legalCards(hand: number[], deck: number, state: DeckState): number[] {
  if (state === "normal" && isDeathDeck(deck) && hand.includes(BIDULE_CARD)) return [BIDULE_CARD]; // Bidule, or die
  if (state === "returned") {
    const others = hand.filter((c) => c !== BIDULE_CARD);
    return others.length ? others : hand;
  }
  return hand;
}

export const drawCard = (rng: Rng) => rng(MAX_TAKE) + 1;

/**
 * Resolves one turn: `playerId`, holding `deck` in `state`, takes `value` cards (a d8 roll or a played card).
 * Mutates `seats` to mark deaths. The Schmilblick die rolls only after a turn the player survives.
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
): Play {
  const me = seats.find((s) => s.id === playerId)!;
  const took = Math.min(value, deck);
  const remaining = deck - took;
  const deadly = state === "returned" || (state === "normal" && isDeathDeck(deck));
  const bidule = mode === "tactique" && state === "normal" && deadly && value === BIDULE_CARD;
  const death = deadly && !bidule;
  // A dying Tactique player can only leave a multiple of 7 by being forced to play a 7; that deck can't kill.
  const nextState: DeckState = bidule ? "returned" : mode === "tactique" && death && isDeathDeck(remaining) ? "safe" : "normal";
  const base = { playerId, received: deck, receivedState: state, roll: value, took, remaining, death, bidule, nextState };

  if (remaining === 0) {
    const ending: Ending = death ? { kind: "noWinner", loserId: playerId } : { kind: "lastCard", winnerId: playerId };
    if (death) me.alive = false;
    return { ...base, schmilRoll: null, schmilblick: false, dir: null, nextId: null, ending };
  }

  const dir: Dir = remaining % 2 === 1 ? "left" : "right";
  const next = nextAlive(seats, playerId, dir);

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
    return { ...base, schmilRoll: null, schmilblick: false, dir, nextId: next.id, ending };
  }

  const schmilRoll = rng(sides) + 1;
  return { ...base, schmilRoll, schmilblick: schmilRoll === sides, dir, nextId: next.id, ending: null };
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
