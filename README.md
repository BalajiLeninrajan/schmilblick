# Schmilblick

The CS343 A2 Q2 card game, as a multiplayer web app. Make a lobby, share the four-letter code, and pass the deck around.

## Rules

- On your turn you roll a d8 and take that many cards, or what's left if fewer.
- An odd number left passes the deck to your left (clockwise). An even number passes it right.
- A deck that arrives as a multiple of 7 is a death deck. You still play it, then you're out.
- If you survive the turn, the Schmilblick die rolls (a d10 by default). Its top face is Schmilblick, and everyone still in drinks.
- Taking the last card or being the last player alive wins. Winning on a death deck means nobody wins.

## Settings

The host picks a game length and the Schmilblick die: d4 (rowdy), d6, d8, or d10 (the assignment's 1 in 10). Rolling the die's top face is a Schmilblick. The die doesn't change who wins, only how often everyone drinks, so deck sizes ignore it.

## Deck sizes

Lobbies pick short, medium or long instead of a card count. `pnpm tune` plays 4,000 simulated games for every deck size and player count (2 to 12), then writes `src/shared/deckTable.ts`.

Deaths cap game length. With an endless deck, about one turn in seven hands someone a death deck, so the game ends after roughly 7 × (players − 1) turns no matter how many cards are left. Each length aims for a turns-per-player goal (3, 6, 10), capped at 55%, 80% and 93% of that ceiling. Among the deck sizes that hit the target, the scorer prefers ones where somebody dies but somebody still wins, and avoids "nobody wins" endings. Multiples of 7 are never used, since they would kill the first player on turn one.

## Stack

- `worker/index.ts`: a Cloudflare Worker plus one `Lobby` Durable Object per code, using hibernatable WebSockets. The DO owns the game state, rolls the dice, and uses its alarm to roll for players who are AFK for 25s or offline for 3s.
- `src/shared`: rules, protocol, and animation timings that the server and client share. The server refuses the next roll until the clients have had time to animate the last one.
- `src/client`: Vite + React, styled with [catppuccin-neu](https://catppuccin-neu.balajileninrajan.dev).

## Commands

```sh
pnpm install
pnpm dev        # vite + workerd on localhost:5173
pnpm typecheck
pnpm tune       # regenerate deck sizes (about 2 minutes)
pnpm run deploy # build and wrangler deploy
```
