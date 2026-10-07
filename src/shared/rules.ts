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

export interface Play {
  playerId: string;
  received: number;
  roll: number; // d8 face
  took: number; // min(roll, received)
  remaining: number;
  death: boolean; // received % 7 == 0, so the player leaves after this play
  schmilRoll: number | null; // the Schmilblick die; null when the player died or the game ended
  schmilblick: boolean;
  dir: Dir | null; // null when the player took the last cards
  nextId: string | null;
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

/**
 * Plays one turn for `playerId` holding `deck` cards. Mutates `seats` to mark a death.
 * The d8 roll comes first, then the Schmilblick die, matching the assignment's PRNG call order.
 */
export function playTurn(
  seats: SeatLike[],
  playerId: string,
  deck: number,
  rng: Rng,
  sides: SchmilblickDie = DEFAULT_SCHMILBLICK_DIE,
): Play {
  const me = seats.find((s) => s.id === playerId)!;
  const roll = rng(MAX_TAKE) + 1;
  const took = Math.min(roll, deck);
  const remaining = deck - took;
  const death = isDeathDeck(deck);
  const base = { playerId, received: deck, roll, took, remaining, death };

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
      ending = isDeathDeck(remaining) ? { kind: "noWinner", loserId: next.id } : { kind: "lastStanding", winnerId: next.id };
      if (isDeathDeck(remaining)) next.alive = false;
    }
    return { ...base, schmilRoll: null, schmilblick: false, dir, nextId: next.id, ending };
  }

  const schmilRoll = rng(sides) + 1;
  return { ...base, schmilRoll, schmilblick: schmilRoll === sides, dir, nextId: next.id, ending: null };
}
