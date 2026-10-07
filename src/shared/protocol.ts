import type { GameLength } from "./deckTable";
import type { DeckState, Ending, Mode, Play, SchmilblickDie } from "./rules";

// Every accent token catppuccin-neu defines. A 12th player repeats the first color.
export const ACCENTS = ["mauve", "peach", "green", "pink", "sky", "yellow", "red", "teal", "lavender", "blue", "rosewater"] as const;
export type Accent = (typeof ACCENTS)[number];

export interface PublicPlayer {
  id: string;
  name: string;
  accent: Accent;
  connected: boolean;
  spectator: boolean; // joined mid-game, sits in from the next game
  alive: boolean;
  cards: number; // cards taken this game
}

export interface SeqPlay extends Play {
  seq: number;
}

export interface GameState {
  startDeck: number;
  deck: number; // what the current player holds
  currentId: string | null;
  seats: string[]; // player ids, clockwise
  lastPlay: SeqPlay | null;
  log: SeqPlay[]; // newest last
  ending: Ending | null;
  /** ms until the server accepts the next roll, measured when this state was sent */
  readyIn: number;
  sides: SchmilblickDie; // the Schmilblick die for this game
  mode: Mode;
  deckState: DeckState; // how the deck the current player holds behaves (Tactique)
}

export interface LobbyState {
  code: string;
  phase: "lobby" | "playing" | "over";
  length: GameLength;
  sides: SchmilblickDie;
  mode: Mode;
  hostId: string | null;
  players: PublicPlayer[];
  game: GameState | null;
}

export type ClientMsg =
  | { t: "join"; name: string }
  | { t: "length"; length: GameLength }
  | { t: "die"; sides: SchmilblickDie }
  | { t: "mode"; mode: Mode }
  | { t: "play"; card: number }
  | { t: "start" }
  | { t: "roll" }
  | { t: "lobby" }
  | { t: "leave" };

export type ServerMsg =
  | { t: "state"; state: LobbyState; you: string; hand: number[] | null } // hand: your Tactique cards, hidden from others
  | { t: "error"; message: string };

export const NAME_MAX = 18;
export const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export const CODE_LENGTH = 4;
export const isCode = (s: string) => new RegExp(`^[${CODE_ALPHABET}]{${CODE_LENGTH}}$`).test(s);

// Animation beats, shared so the server waits exactly as long as clients animate.
export const BEATS = {
  d8: 1100,
  fly: 900,
  death: 1300,
  schmilRoll: 1000,
  schmilblick: 2600,
  bidule: 2400,
  pass: 1600,
} as const;

export function playDuration(p: Play) {
  return (
    BEATS.d8 +
    BEATS.fly +
    (p.death ? BEATS.death : 0) +
    (p.bidule ? BEATS.bidule : 0) +
    (p.schmilRoll !== null ? BEATS.schmilRoll : 0) +
    (p.schmilblick ? BEATS.schmilblick : 0) +
    (p.nextId ? BEATS.pass : 0)
  );
}

export const AFK_MS = 25_000; // a connected player who doesn't roll gets rolled for
export const OFFLINE_MS = 3_000; // a disconnected player gets rolled for quickly
