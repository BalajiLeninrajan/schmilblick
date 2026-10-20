// Monte Carlo search for starting deck sizes. Writes src/shared/deckTable.ts.
//
// For each player count and game length, every candidate deck size is played SIMS times and
// scored. The score rewards:
//   - hitting the target number of turns per player for that length,
//   - games that end with a winner (a "no winner" ending is a letdown),
//   - games where at least one player dies but someone still wins (the dramatic middle).
// Deck sizes that are multiples of 7 are skipped, since the first player would die on turn one.
//
// Deaths cap how long a game can run: with an endless deck, about one received deck in seven is a
// death deck, so attrition ends the game after roughly 7 * (players - 1) turns. A length's target is
// its turns-per-player goal, capped at a share of that ceiling, so "long" means a near-battle-royale
// instead of a deck so big that the extra cards never get played.
//
// Nobody dies out of Tactique, so it has no ceiling: every game ends on the last card, and its target is
// just the turns-per-player goal. The search starts from a probe of how many turns each card buys and scans
// around that guess.
// Tactique bots are greedy: take the last cards when they can, attack whenever a card leaves a death deck,
// and Bidule whenever they can. Otherwise they play a random card other than a 7,
// the way people hold on to theirs. A 1 or an 8 goes a random way, since they can't see who holds a 7.

import { writeFileSync } from "node:fs";
import {
  BIDULE_CARD,
  MAX_PLAYERS,
  MIN_PLAYERS,
  MODES,
  biduleCards,
  canSteer,
  dealHand,
  handoffOf,
  isDeadly,
  isDeathDeck,
  legalCards,
  playFromHand,
  playTurn,
  resolveTurn,
  type DeckState,
  type Handoff,
  type Mode,
  type Play,
  type Rng,
  type SeatLike,
} from "../src/shared/rules.ts";

const SIMS = 4000;
// turns per player, and the share of the attrition ceiling a length may reach
const LENGTHS = {
  short: { perPlayer: 3, ceiling: 0.55 },
  medium: { perPlayer: 6, ceiling: 0.8 },
  long: { perPlayer: 10, ceiling: 0.93 },
} as const;

// mulberry32, seeded so the table is reproducible
function rngFrom(seed: number) {
  let a = seed >>> 0;
  return (n: number) => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return Math.floor((((t ^ (t >>> 14)) >>> 0) / 4294967296) * n);
  };
}

interface Stats {
  turns: number;
  noWinner: number;
  dramatic: number;
  deaths: number;
  schmilblicks: number;
}

function botCard(hand: number[], deck: number, state: DeckState, from: Handoff | null, rng: Rng) {
  const legal = legalCards(hand, deck, state, from);
  // On a deadly deck, the legal cards are all Bidules when there is one.
  const dying = state === "returned" || (isDeadly(deck, state) && biduleCards(legal, from).length === 0);
  const win = legal.find((c) => c >= deck);
  if (win !== undefined && !dying) return win;
  const kill = legal.find((c) => c < deck && isDeathDeck(deck - c));
  if (kill !== undefined) return kill;
  return keepSevens(legal, rng);
}

/** A random card, other than a 7 when there's a choice. */
function keepSevens(cards: number[], rng: Rng) {
  const rest = cards.filter((c) => c !== BIDULE_CARD);
  const from = rest.length ? rest : cards;
  return from[rng(from.length)];
}

function simulate(players: number, deck: number, mode: Mode): Stats {
  const rng = rngFrom(players * 1000 + deck + (mode === "tactique" ? 7_000_000 : 0));
  const s: Stats = { turns: 0, noWinner: 0, dramatic: 0, deaths: 0, schmilblicks: 0 };
  for (let g = 0; g < SIMS; g++) {
    const seats: SeatLike[] = Array.from({ length: players }, (_, i) => ({ id: String(i), alive: true }));
    let cur = String(rng(players));
    let d = deck;
    let state: DeckState = "normal";
    let deaths = 0;
    let last: Play | null = null;
    // Only Tactique deals hands, so Hasard draws the same random numbers it always has.
    const bags: Record<string, number[]> = Object.fromEntries(seats.map((p) => [p.id, []]));
    const hands: Record<string, number[]> =
      mode === "tactique" ? Object.fromEntries(seats.map((p) => [p.id, dealHand(bags[p.id], rng)])) : {};
    for (;;) {
      let p;
      if (mode === "hasard") p = playTurn(seats, cur, d, rng);
      else {
        const hand = hands[cur];
        const from = handoffOf(last, cur);
        const card = botCard(hand, d, state, from, rng);
        const steer = canSteer(card, d) ? (rng(2) ? "left" : "right") : undefined;
        p = resolveTurn(seats, cur, d, state, card, mode, rng, undefined, { steer, from });
        playFromHand(hand, card, bags[cur], rng);
        state = p.nextState;
        last = p;
      }
      s.turns++;
      if (p.death) deaths++;
      if (p.schmilblick) s.schmilblicks++;
      if (p.ending) {
        if (p.ending.kind === "noWinner") s.noWinner++;
        else if (deaths > 0) s.dramatic++;
        break;
      }
      cur = p.nextId!;
      d = p.remaining;
    }
    s.deaths += deaths;
  }
  return {
    turns: s.turns / SIMS,
    noWinner: s.noWinner / SIMS,
    dramatic: s.dramatic / SIMS,
    deaths: s.deaths / SIMS,
    schmilblicks: s.schmilblicks / SIMS,
  };
}

function score(st: Stats, targetTurns: number) {
  const lengthMiss = Math.abs(st.turns / targetTurns - 1);
  return -2 * lengthMiss - 1.5 * st.noWinner + 0.5 * st.dramatic;
}

type Row = Record<keyof typeof LENGTHS, { cards: number; turns: number; deaths: number; noWinner: number }>;
const table = {} as Record<Mode, Record<number, Row>>;

for (const mode of MODES) {
  table[mode] = {};
  console.log(`== ${mode}`);
  for (let n = MIN_PLAYERS; n <= MAX_PLAYERS; n++) {
    table[mode][n] = {} as Row;
    if (mode === "tactique") {
      let floor = 10;
      const probe = 300;
      const perCard = simulate(n, probe, mode).turns / probe;
      for (const [name, { perPlayer }] of Object.entries(LENGTHS) as [keyof typeof LENGTHS, (typeof LENGTHS)[keyof typeof LENGTHS]][]) {
        const target = perPlayer * n;
        const guess = Math.max(floor, Math.round(target / perCard));
        let best = { deck: 0, s: -Infinity, st: null as Stats | null };
        for (let deck = Math.max(floor, guess - 12); deck <= guess + 12; deck++) {
          if (isDeathDeck(deck)) continue;
          const st = simulate(n, deck, mode);
          const sc = score(st, target);
          if (sc > best.s) best = { deck, s: sc, st };
        }
        const st = best.st!;
        table[mode][n][name] = {
          cards: best.deck,
          turns: +st.turns.toFixed(1),
          deaths: +st.deaths.toFixed(2),
          noWinner: +st.noWinner.toFixed(3),
        };
        floor = best.deck + Math.max(5, n * 2);
        console.log(
          `${String(n).padStart(2)}p ${name.padEnd(6)} cards=${String(best.deck).padStart(3)} turns=${st.turns.toFixed(1).padStart(5)} (target ${target}) deaths=${st.deaths.toFixed(2)}`,
        );
      }
      continue;
    }
    let floor = 10;
    const ceiling = simulate(n, 5001, mode).turns; // mean turns when the deck never runs out
    for (const [name, { perPlayer, ceiling: share }] of Object.entries(LENGTHS) as [
      keyof typeof LENGTHS,
      (typeof LENGTHS)[keyof typeof LENGTHS],
    ][]) {
      const target = Math.min(perPlayer * n, share * ceiling);
      let best = { deck: 0, s: -Infinity, st: null as Stats | null };
      // Each length must use more cards than the one before it.
      for (let deck = floor; deck <= Math.max(floor + 60, Math.round(target * 4.5 * 1.4)); deck++) {
        if (isDeathDeck(deck)) continue;
        const st = simulate(n, deck, mode);
        const sc = score(st, target);
        if (sc > best.s) best = { deck, s: sc, st };
      }
      const st = best.st!;
      table[mode][n][name] = {
        cards: best.deck,
        turns: +st.turns.toFixed(1),
        deaths: +st.deaths.toFixed(2),
        noWinner: +st.noWinner.toFixed(3),
      };
      floor = best.deck + Math.max(5, n * 2);
      console.log(
        `${String(n).padStart(2)}p ${name.padEnd(6)} cards=${String(best.deck).padStart(3)} turns=${st.turns.toFixed(1).padStart(5)} (target ${target.toFixed(1)}, ceiling ${ceiling.toFixed(1)}) deaths=${st.deaths.toFixed(2)} noWinner=${(st.noWinner * 100).toFixed(1)}% dramatic=${(st.dramatic * 100).toFixed(1)}% drinks=${st.schmilblicks.toFixed(2)}`,
      );
    }
  }
}

const out = `// Generated by scripts/tune-decks.ts. Run \`pnpm tune\` to rebuild.
// cards: starting deck, turns: mean total turns, deaths: mean deaths, noWinner: share of games nobody wins.

import type { Mode } from "./rules";

export type GameLength = "short" | "medium" | "long";

export interface DeckPreset {
  cards: number;
  turns: number;
  deaths: number;
  noWinner: number;
}

export const DECK_TABLE: Record<Mode, Record<number, Record<GameLength, DeckPreset>>> = ${JSON.stringify(table, null, 2)};
`;
writeFileSync(new URL("../src/shared/deckTable.ts", import.meta.url), out);
