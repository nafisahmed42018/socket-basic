# ChatRoom

A real-time chat room built with **Node.js**, **Express**, and **Socket.IO**. Multiple browser tabs or devices can connect and exchange messages instantly — no page refresh required.

---

## Tech stack

| Layer     | Technology                        |
|-----------|-----------------------------------|
| Server    | Node.js + Express 5               |
| Realtime  | Socket.IO 4                       |
| Frontend  | Vanilla HTML, CSS, JavaScript     |
| Transport | WebSocket (falls back to polling) |

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
    │                              │─── userList [A, B] ────────►│
    │◄─── userList [A, B] ────────│                              │
    │                              │                              │
    │── messageFromClient ────────►│                              │
    │                              │─── messageToAllClients ─────►│
    │◄─── messageToAllClients ────│                              │
    │                              │                              │
    │── disconnect ───────────────►│                              │
    │                              │─── userList [B] ────────────►│
```

1. Every browser that visits the page opens a Socket.IO connection.
2. The server maintains the list of connected socket IDs and broadcasts it on every join/leave.
3. When a user sends a message the server re-broadcasts it to **all** connected clients, including the sender, with the sender's socket ID attached so each client can style self vs. others differently.

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
- Consecutive messages from the same sender are visually grouped — the name and timestamp are only shown on the first message in a run, keeping the feed clean.

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

### Join / leave notifications
- A notification bar above the input briefly shows when a user connects or disconnects, then fades out automatically.

### XSS protection
- All user-supplied message text is HTML-escaped before it is inserted into the DOM, preventing script injection attacks.

### Responsive layout
- The sidebar is hidden on screens narrower than 640 px so the chat panel fills the full viewport on mobile.

### No external dependencies on the frontend
- Zero npm packages, frameworks, or CDN links on the client side. Pure HTML, CSS, and JavaScript. The only external script is `socket.io.min.js`, served directly by the Socket.IO server itself.
