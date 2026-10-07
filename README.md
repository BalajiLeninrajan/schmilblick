# Schmilblick

A multiplayer web version of the card game from CS343 Assignment 2. Now you can lose to your friends instead of Peter Buhr.

Play at https://schmilblick.balajileninrajan.dev. Make a room, share the four-letter code, and pass the deck.

## Rules

- On your turn, roll a d8 and take that many cards.
- An odd number left passes the deck left. An even number passes it right.
- If the deck you got is a multiple of 7, it's a death deck. You play it, then you're out.
- Survive a turn and the Schmilblick die rolls. Its top number means everyone drinks.
- Take the last card or be the last one standing to win.

The host picks the game length and the Schmilblick die (d4 to d10). Deck sizes come from simulating thousands of games per player count (`pnpm tune`).

## Development

```sh
pnpm install
pnpm dev
pnpm run deploy
```

A Cloudflare Worker runs one Durable Object per room. The client is Vite, React and [catppuccin-neu](https://catppuccin-neu.balajileninrajan.dev).

## License

MIT
