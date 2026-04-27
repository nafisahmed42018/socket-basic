# ChatRoom

A real-time chat room built with **Node.js**, **Express**, and **Socket.IO**. Multiple browser tabs or devices can connect and exchange messages instantly — no page refresh required.

---

## Tech stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Server    | Node.js + Express 5               |
| Realtime  | Socket.IO 4                       |
| Frontend  | Vanilla HTML, CSS, JavaScript     |
| Transport | WebSocket (falls back to long-polling) |

No frontend framework, no build step, no bundler.

---

## Project structure

```
chat-room/
├── frontend/
│   ├── index.html      # app shell and DOM structure
│   ├── styles.css      # all styles (dark theme, layout, animations)
│   └── script.js       # socket.io client, message rendering, user list
├── server.js           # express server + socket.io event handlers
├── package.json
└── .gitignore
```

---

## Getting started

### Prerequisites

- [Node.js](https://nodejs.org/) v18 or newer

### Install

```bash
git clone https://github.com/nafisahmed42018/socket-basic.git
cd socket-basic
npm install
```

### Run

```bash
npm start
```

The server starts on `http://localhost:4000`.  
Open that URL in two or more browser tabs to see real-time messaging between clients.

---

## How it works

```
Browser A                    Node.js Server                 Browser B
    │                              │                              │
    │── connect (WebSocket) ──────►│◄──────── connect ───────────│
    │                              │                              │
    │                              │──── userList [A, B] ───────►│
    │◄──── userList [A, B] ───────│                              │
    │                              │                              │
    │── messageFromClient ────────►│ validate + sanitize         │
    │                              │──── messageToAllClients ────►│
    │◄──── messageToAllClients ───│                              │
    │                              │                              │
    │── disconnect ───────────────►│ removes A from socket map   │
    │                              │──── userList [B] ───────────►│
```

1. Every browser that visits the page opens a Socket.IO connection. Socket.IO starts with HTTP long-polling and upgrades to WebSocket automatically.
2. The server holds a live map of every connected socket (`io.sockets.sockets`). It broadcasts the full ID list to all clients on every join and leave — no manual tracking needed.
3. When a user sends a message the server validates and sanitizes it, then re-broadcasts it to **all** connected clients with the sender's socket ID attached so each client can style self vs. others differently.
4. When a socket disconnects (voluntarily or due to a network drop) Socket.IO removes it from the map before firing the `disconnect` event, so `broadcastUserList()` already sees the updated list.

---

## Features

### Realtime messaging
- Messages are delivered to all connected clients instantly over a persistent WebSocket connection.
- No polling, no page refresh.

### Self / other message bubbles
- Your messages appear on the **right** in blue.
- Other users' messages appear on the **left** in dark grey.
- Each message shows the sender name and timestamp.

### Message grouping
- Consecutive messages from the same sender are visually grouped — the name and timestamp are only shown on the first in a run, keeping the feed clean.

### Auto-generated guest identities
- Each connection is automatically assigned a guest name derived from its socket ID (e.g. `Guest-3f2a`).
- Every user gets a stable avatar colour from an 8-colour palette — the same user always has the same colour for the duration of the session.

### Live online user list
- The sidebar shows every currently connected user with a coloured avatar initial.
- The list updates instantly when someone joins or leaves.
- Your own entry is marked **(you)**.

### Connection status indicator
- A dot in the top-right of the chat panel shows live connection state.
- Green = connected, red = disconnected.

### Leave and rejoin
- A **Leave** button in the header voluntarily disconnects the socket.
- The server is notified immediately, the sidebar updates for all other users, and the input is disabled.
- Clicking **Rejoin** reconnects the same socket instance without a page reload.

### Join / leave notifications
- A notification bar briefly shows when you join or leave, then fades out automatically.

### Input sanitization and XSS protection
Both the client and server independently sanitize every message:

| Check | Client | Server |
|---|---|---|
| Must be a string | — | yes — non-strings are dropped |
| Strip control characters (0x00–0x1F) | yes | yes |
| Trim whitespace | yes | yes |
| Reject blank after cleanup | yes | yes |
| Max 500 characters | yes (`maxlength` + JS) | yes |
| Rate limit (max 5 msg/sec per socket) | — | yes |

On the client, all dynamic content is written to the DOM via `textContent` or validated DOM methods — never `innerHTML` with unsanitized values — so `<script>` tags and `onerror=` attributes in messages are always rendered as plain text.

### Responsive layout
- The sidebar is hidden on screens narrower than 640 px so the chat panel fills the full viewport on mobile.

### No external dependencies on the frontend
- Zero npm packages, frameworks, or CDN links on the client side. Pure HTML, CSS, and JavaScript. The only external script is `socket.io.min.js`, served directly by the Socket.IO server itself.

---

## References

### WebSocket
- [MDN — The WebSocket API](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API) — browser WebSocket API reference
- [MDN — Writing WebSocket client applications](https://developer.mozilla.org/en-US/docs/Web/API/WebSockets_API/Writing_WebSocket_client_applications)
- [RFC 6455 — The WebSocket Protocol](https://datatracker.ietf.org/doc/html/rfc6455) — the formal spec defining the upgrade handshake and frame format

### Socket.IO
- [Socket.IO — Official docs](https://socket.io/docs/v4/) — v4 documentation (server + client API)
- [Socket.IO — How it works](https://socket.io/docs/v4/how-it-works/) — transport negotiation, long-polling fallback, packet format
- [Socket.IO — Server API](https://socket.io/docs/v4/server-api/) — `io`, `socket`, rooms, namespaces
- [Socket.IO — Client API](https://socket.io/docs/v4/client-api/) — `io()`, `socket.connect()`, `socket.disconnect()`, events
- [Socket.IO — Emit cheatsheet](https://socket.io/docs/v4/emit-cheatsheet/) — quick reference for broadcast patterns

### Express
- [Express 5 — Official docs](https://expressjs.com/en/5x/api.html) — API reference for the HTTP server layer
