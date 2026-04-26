# WebSockets & Socket.IO

## The Problem with HTTP

HTTP is a request-response protocol. The client asks, the server answers, and the connection closes. If you want new data, you ask again. This works fine for loading a webpage, but falls apart for anything that needs live updates — a chat room, a live dashboard, or a multiplayer game.

The naive workarounds are **polling** (client asks every N seconds) and **long-polling** (client keeps a request open until the server has something to say). Both are expensive hacks. Polling hammers the server with mostly-empty responses. Long-polling is better but still re-establishes HTTP connections constantly, each carrying headers, cookies, and handshake overhead.

---

## WebSockets: A Real Persistent Connection

WebSocket is a protocol that starts life as an HTTP request and then upgrades itself into something fundamentally different.

```
Client → Server:  GET /chat HTTP/1.1
                  Connection: Upgrade
                  Upgrade: websocket

Server → Client:  HTTP/1.1 101 Switching Protocols
                  Upgrade: websocket
```

After that `101 Switching Protocols` response, HTTP is done. The connection is now a raw **TCP** socket — a persistent, full-duplex channel where either side can send data at any time without waiting for the other to ask first.

### Why TCP and Not HTTP

HTTP is built on top of TCP, but HTTP adds stateless request/response semantics on top. WebSocket bypasses that layer entirely and talks TCP directly (after the upgrade handshake). This means:

- **No headers on every message** — once connected, a WebSocket frame has as little as 2 bytes of overhead vs. hundreds of bytes of HTTP headers.
- **No connection teardown and re-establishment** — the TCP connection stays open for the lifetime of the session.
- **Either side can push** — the server doesn't wait for a request; it sends whenever it has data.

---

## Bi-Directional Communication

"Bi-directional" means data can flow in both directions simultaneously, and either side can initiate a message at any time.

```
Client ──────────────────► Server   (client sends player input)
Client ◄────────────────── Server   (server pushes game state update)
```

Compare this to HTTP, which is strictly unidirectional per cycle — the client always speaks first, and the server only speaks in response.

---

## Low Latency

Because the connection is persistent and there is no handshake overhead on each message, the round-trip time drops significantly. For a game running at 60 updates per second, this is the difference between smooth gameplay and rubberbanding.

| Mechanism     | Per-message overhead     | Latency profile  |
|---------------|--------------------------|------------------|
| HTTP polling  | Full headers + TCP setup | High, unpredictable |
| Long-polling  | Full headers, one way    | Medium           |
| WebSocket     | 2–10 bytes               | Low, consistent  |

---

## The Browser Problem: WebSocket is a Browser API

This is where things get interesting. The WebSocket protocol is a **browser standard** — the `WebSocket` class is built into every modern browser as a JavaScript API.

```js
// This runs in the browser
const socket = new WebSocket('ws://localhost:3000');

socket.onopen = () => console.log('connected');
socket.onmessage = (event) => console.log('received:', event.data);
socket.send('hello from the browser');
```

**The server has no such built-in.** Node.js, for example, has no native WebSocket server. The server needs a library that speaks the WebSocket protocol — it must handle the HTTP upgrade handshake, parse WebSocket frames, manage connections, and handle disconnects. This is exactly the gap that Socket.IO's server package fills, sitting on top of the `ws` library under the hood.

---

## Broadcasting: Talking to All Connected Clients

Once you have a WebSocket server, every connected client is a node in a shared graph. The server holds a reference to every open connection and can write to any or all of them at once.

```
          ┌────────────────────────────────────┐
          │            WebSocket Server        │
          │                                    │
          │  [conn A]  [conn B]  [conn C]  ... │
          └────┬───────────┬──────────┬────────┘
               │           │          │
           Browser A   Browser B   Browser C
```

When Player A moves, the server receives the position update and **broadcasts** it — writes the same message to every other open connection. All players see the update in near real time.

---

## Socket.IO: WebSockets with Batteries Included

Socket.IO is a library built on top of WebSocket that adds a layer of reliability, features, and developer ergonomics.

### What it adds over raw WebSockets

| Feature | Raw WebSocket | Socket.IO |
|---|---|---|
| Auto-reconnection | No | Yes |
| Fallback transports (long-polling) | No | Yes |
| Named events | No | Yes |
| Rooms and namespaces | No | Yes |
| Acknowledgements (callbacks) | No | Yes |
| Middleware | No | Yes |

### Named Events

Instead of sending raw strings or binary and parsing them yourself, Socket.IO lets you emit and listen for typed events:

```js
// server
io.on('connection', (socket) => {
  socket.on('player:move', (data) => {
    // data = { x, y, playerId }
    socket.broadcast.emit('player:moved', data); // send to everyone except sender
  });
});

// client
socket.emit('player:move', { x: 120, y: 340, playerId: 'abc' });
socket.on('player:moved', (data) => {
  updatePlayerPosition(data.playerId, data.x, data.y);
});
```

### Rooms

Socket.IO lets you group connections into rooms — useful for game lobbies, chat channels, or any scoped broadcast:

```js
// player joins a game room
socket.join('room:game-42');

// broadcast only to players in that room
io.to('room:game-42').emit('game:state', currentState);
```

### Fallback Transport

If WebSocket is blocked (some corporate firewalls, older environments), Socket.IO silently falls back to HTTP long-polling. The developer writes the same code either way.

---

## End-to-End Example: Multiplayer Game

Imagine a simple top-down game. Each player has an `(x, y)` position that other players need to see in real time.

### The problem without WebSockets

- Player A moves. Client sends HTTP POST.
- Server saves the position.
- Player B asks "where is everyone?" via HTTP GET every 500ms.
- Player B sees Player A's new position up to 500ms late.
- 100 players = 200 HTTP requests per second just for position polling.

### With Socket.IO

```
Player A presses W key
    │
    ▼
Client emits  ──────────────────► Server receives 'player:move'
'player:move'                          │
{ x: 105, y: 200 }                     │ validates + updates game state
                                       │
                                       ▼
                              io.to('room:game-42')
                                .emit('player:moved', {
                                     playerId: 'A',
                                     x: 105, y: 200
                                  })
                                       │
                          ┌────────────┼────────────┐
                          ▼            ▼             ▼
                       Player B    Player C      Player D
                     re-renders  re-renders    re-renders
```

```js
// server.js
const { Server } = require('socket.io');
const io = new Server(3000);

const gameState = {};

io.on('connection', (socket) => {
  console.log(`player connected: ${socket.id}`);

  socket.on('game:join', (roomId) => {
    socket.join(roomId);
    socket.emit('game:state', gameState); // send current state to the newcomer
  });

  socket.on('player:move', ({ roomId, x, y }) => {
    gameState[socket.id] = { x, y };

    // broadcast to everyone else in the room
    socket.to(roomId).emit('player:moved', {
      playerId: socket.id,
      x,
      y,
    });
  });

  socket.on('disconnect', () => {
    delete gameState[socket.id];
    io.emit('player:left', { playerId: socket.id });
  });
});
```

```js
// client.js (runs in the browser)
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');
const ROOM_ID = 'game-42';

socket.emit('game:join', ROOM_ID);

// local player input → send to server
document.addEventListener('keydown', (e) => {
  if (e.key === 'w') {
    localPlayer.y -= 5;
    socket.emit('player:move', { roomId: ROOM_ID, x: localPlayer.x, y: localPlayer.y });
    render();
  }
});

// other players' updates from server → update their positions
socket.on('player:moved', ({ playerId, x, y }) => {
  otherPlayers[playerId] = { x, y };
  render();
});

socket.on('player:left', ({ playerId }) => {
  delete otherPlayers[playerId];
  render();
});
```

### What makes this work

1. **Persistent TCP connection** — no handshake cost on every position update.
2. **Server-initiated push** — the server broadcasts the moment it receives a move, not when a client asks.
3. **Bi-directional** — client sends input up, server pushes world state down.
4. **Low latency** — a position update is ~50 bytes over an open socket, not a full HTTP round-trip.
5. **Rooms** — the broadcast is scoped to players in the same game instance, not every connected client.

---

---

## Socket.IO Transport: Long-Polling First, Then Upgrade

Socket.IO does not open a WebSocket immediately. It always starts with **HTTP long-polling**, then attempts to upgrade to WebSocket once the connection is stable. This two-phase approach is what makes Socket.IO resilient across networks that block or mangle WebSocket upgrades (certain proxies, load balancers, corporate firewalls).

### Phase 1 — Long-Polling (the handshake + fallback)

Long-polling is an HTTP technique where the client sends a request and the server holds it open until it has data to send. Once the response arrives, the client immediately fires another request.

```
Client                        Server
  │                              │
  │── GET /socket.io/?EIO=4 ───►│  client opens a "hanging" request
  │                              │  server holds it...
  │                              │  ...until it has data
  │◄── 200 { "sid": "abc" } ────│  server responds with session ID
  │                              │
  │── GET /socket.io/?sid=abc ──►│  client immediately re-opens
  │                              │  server holds it again...
  │◄── 200 { event data } ──────│  server pushes when ready
  │                              │
  │── GET /socket.io/?sid=abc ──►│  client re-opens again...
  │                              │  (cycle repeats)
  │                              │
```

Each HTTP response carries buffered messages. Data posted from the client goes via HTTP POST on the same polling URL:

```
Client                        Server
  │                              │
  │── POST /socket.io/?sid=abc ─►│  client sends data (e.g. player:move)
  │◄── 200 OK ──────────────────│
  │                              │
```

### Phase 2 — WebSocket Upgrade

While polling is active, Socket.IO tries to upgrade to a real WebSocket connection. If the upgrade succeeds, polling is abandoned.

```
Client                           Server
  │                                 │
  │  [polling is running normally]  │
  │                                 │
  │── GET /socket.io/?transport=   ►│
  │        websocket&sid=abc        │  HTTP upgrade request
  │◄── 101 Switching Protocols ────│  server accepts
  │                                 │
  │════════ WebSocket open ════════►│
  │◄═══════════════════════════════│  polling discarded, WS takes over
  │                                 │
```

If the upgrade fails (e.g. a proxy strips the `Upgrade` header), long-polling silently stays as the transport. The developer's code doesn't change at all — Socket.IO handles the difference internally.

```
                    Socket.IO Transport Decision

                    ┌─────────────────────────┐
                    │  Connection attempt      │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Start HTTP long-poll   │
                    │  (always, as baseline)  │
                    └────────────┬────────────┘
                                 │
                                 ▼
                    ┌─────────────────────────┐
                    │  Try WebSocket upgrade  │
                    └──────┬──────────┬───────┘
                           │          │
                       success       fail
                           │          │
                           ▼          ▼
                    ┌──────────┐  ┌──────────────┐
                    │  Switch  │  │  Stay on     │
                    │  to WS   │  │  long-poll   │
                    └──────────┘  └──────────────┘
```

---

## Multiplexing: Multiple Channels Over One Connection

In a raw WebSocket, there is one connection and one stream of messages. If you want to separate concerns — say, a chat channel and a notification channel — you either open two connections or invent your own routing scheme.

Socket.IO solves this with **namespaces** and **multiplexing**: multiple logical channels over a single physical TCP connection.

```
  Physical TCP Connection (one socket, one port)
  ┌──────────────────────────────────────────────────────┐
  │                                                      │
  │   Namespace /chat       Namespace /game              │
  │   ┌───────────────┐     ┌────────────────────┐       │
  │   │ msg:send      │     │ player:move        │       │
  │   │ msg:received  │     │ player:moved       │       │
  │   │ user:typing   │     │ game:state         │       │
  │   └───────────────┘     └────────────────────┘       │
  │                                                      │
  │   Namespace /admin                                   │
  │   ┌───────────────┐                                  │
  │   │ user:ban      │                                  │
  │   │ server:stats  │                                  │
  │   └───────────────┘                                  │
  │                                                      │
  └──────────────────────────────────────────────────────┘
```

Without multiplexing, each namespace would require its own connection:

```
  WITHOUT multiplexing                WITH multiplexing

  Client ══════► /chat   (conn 1)     Client ══════► server (1 conn)
  Client ══════► /game   (conn 2)              │
  Client ══════► /admin  (conn 3)              ├──► /chat  (logical)
                                               ├──► /game  (logical)
  3 TCP connections,                           └──► /admin (logical)
  3 handshakes,
  3× memory on server                     1 TCP connection
```

### How the packets are tagged

Each Socket.IO packet carries a namespace prefix so the receiver knows which channel it belongs to:

```
  Raw wire frame (simplified):

  ┌─────┬──────────────┬──────────────────────────────┐
  │ type│  namespace   │  payload                     │
  ├─────┼──────────────┼──────────────────────────────┤
  │  2  │  /game       │  ["player:move",{"x":5,"y":9}]│
  │  2  │  /chat       │  ["msg:send",{"text":"hello"}]│
  │  2  │  /admin      │  ["user:ban",{"id":"xyz"}]    │
  └─────┴──────────────┴──────────────────────────────┘

  All three travel over the same TCP connection.
  The receiver demultiplexes by reading the namespace field.
```

### Code

```js
// server — separate namespaces, same io instance
const chat  = io.of('/chat');
const game  = io.of('/game');
const admin = io.of('/admin');

chat.on('connection', (socket) => {
  socket.on('msg:send', (data) => {
    chat.emit('msg:received', data); // broadcast only to /chat subscribers
  });
});

game.on('connection', (socket) => {
  socket.on('player:move', (data) => {
    socket.to(data.roomId).emit('player:moved', data);
  });
});

// client — connect to multiple namespaces over one underlying connection
const chatSocket  = io('/chat');
const gameSocket  = io('/game');
```

---

## Packet Buffering

When a Socket.IO client disconnects temporarily — network blip, phone switching from WiFi to LTE, tab going to sleep — events emitted during that window don't just vanish. Socket.IO buffers them.

### Client-side buffer

By default, any event emitted while the client is disconnected is queued in memory. When the connection is re-established, the buffer is flushed in order.

```
  Client timeline:

  t=0   connected    ══════════════════════════╗
                                               ║
  t=5   network drop ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─║  disconnected
                                               ║
  t=6   emit('player:move', A)  → [BUFFERED]  ║
  t=7   emit('player:move', B)  → [BUFFERED]  ║
  t=8   emit('player:move', C)  → [BUFFERED]  ║
                                               ║
  t=9   reconnected  ══════════════════════════╝
                          │
                          ▼
               flush buffer in order:
               emit A → emit B → emit C
```

This is fine for some use cases (chat messages that must arrive) and wrong for others (player position — only the latest position matters, not every intermediate step).

You can disable buffering per-emit with the `volatile` flag:

```js
// this message is dropped if the client is not currently connected
// good for high-frequency position updates where stale data is useless
socket.volatile.emit('player:move', { x, y });
```

```
  Without volatile (default):           With volatile:

  Client disconnects                     Client disconnects
       │                                      │
  emit A → buffered                      emit A → DROPPED
  emit B → buffered                      emit B → DROPPED
  emit C → buffered                      emit C → DROPPED
       │                                      │
  reconnects                             reconnects
       │                                      │
  A, B, C sent in order                  nothing sent
  (server gets stale positions)          (server waits for fresh input)
```

### Server-side buffer (with acknowledgements)

Socket.IO also lets you request an **acknowledgement** — the sender holds the message until the receiver confirms it arrived:

```
  Client                          Server
    │                                │
    │── emit('msg:send', data) ─────►│
    │   [message held in buffer]     │  server processes
    │◄── ack callback called ────────│  server confirms
    │   [buffer cleared]             │
    │                                │
```

```js
// client waits for server to ack before considering the message "sent"
socket.emit('msg:send', { text: 'hello' }, (ack) => {
  console.log('server confirmed:', ack.status); // 'ok'
});

// server
socket.on('msg:send', (data, callback) => {
  saveMessage(data);
  callback({ status: 'ok' });
});
```

If the connection drops before the ack arrives, the message sits in the buffer and is re-sent on reconnect.

### Putting it together: buffer strategy for the game example

```
  Event type          Volatile?   Why
  ──────────────────────────────────────────────────────
  player:move         YES         Only current position matters.
                                  Stale positions cause rubberbanding.

  player:chat         NO          Every message must arrive in order.

  game:state-sync     NO + ack    Critical state — must confirm receipt.

  player:shoot        NO          Each shot must register, not be lost.
```

---

## Summary

```
HTTP:        Client ──ask──► Server ──answer──► done. Connection closed.

WebSocket:   Client ◄══════════════════════════╗
             Server ◄══════════ open forever ══╝
                         (either side talks any time)

Socket.IO connection lifecycle:

  1. Long-poll starts (HTTP, always)
       │
  2. WS upgrade attempted
       │
       ├── success ──► WebSocket takes over, poll discarded
       └── fail    ──► Long-poll stays active (transparent to dev)

Socket.IO features on top of WebSocket:

  ┌─────────────────────────────────────────────────┐
  │                   Socket.IO                     │
  │                                                 │
  │  Named events   Rooms      Namespaces           │
  │  (no raw str)   (scoped    (multiplexing:        │
  │                  broadcast) many channels,      │
  │                             one TCP conn)       │
  │                                                 │
  │  Packet buffer  Volatile   Acknowledgements     │
  │  (queue on      (drop if   (guaranteed          │
  │   disconnect)   offline)    delivery)           │
  │                                                 │
  └─────────────────────────────────────────────────┘
```

WebSocket hands you a raw persistent pipe. Socket.IO turns that pipe into a structured real-time messaging system with transport fallback, multiplexed channels, and delivery guarantees. For anything that requires continuous, low-latency, two-way communication — games, collaborative tools, live feeds — this stack is the right tool.
