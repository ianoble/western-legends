# Western Legends (standalone)

Vue client and boardgame.io game logic for **Western Legends**, using [@noble/bg-engine](https://github.com/) patterns shared with Crown Duels and The Golden Ages.

## Prereqs

- Sibling checkout: `noble-bg-engine` next to this folder (`../noble-bg-engine`).
- From `noble-bg-engine`, build the server so it bundles `game-western-legends.js` from this repo’s `src/logic/index.ts`:

```bash
cd ../noble-bg-engine
npm run build -w packages/engine
npm run build -w packages/server
npm start -w packages/server
```

## Dev

```bash
npm install
npm run dev
```

### `VITE_SERVER_URL` and WebSockets

The client uses boardgame.io’s Socket.IO transport to the **same base URL** as the HTTP API (see `src/config.ts`: `SERVER_URL` defaults to `http://localhost:8000`).

- **Must match** the noble-bg-engine server you start (scheme, host, and port). If the server runs on another port, set e.g. `VITE_SERVER_URL=http://localhost:3000` before `npm run dev`.
- The browser opens a WebSocket to that host; mixed content rules apply (an `https` page cannot talk to `http://localhost` in production without a proxy).
- After changing `VITE_SERVER_URL`, restart the Vite dev server.

### Board background image (optional)

Place a file at `public/board/western-legends-board.jpg` (your own scan or photo). If the file is missing, the table view still shows a dark scrim over a plain backdrop.

### Digital setup

When the lobby **starts the match** (enough players joined per your server rules), boardgame.io runs the game’s `setup()` once. That creates hands, decks, gold, and the legend goal for every seat — there is no separate in-app “start play” step. The collapsible **Physical setup reference** in the game view is only a reminder for the real table; it does not drive server state.

## Tests

```bash
npm test
```
