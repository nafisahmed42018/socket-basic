const express = require("express");
const { Server } = require("socket.io");

const app = express();

app.use(express.static("frontend"));

const expressServer = app.listen(4000);

const io = new Server(expressServer, {
  cors: ["http://localhost:4000"],
});

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 500;
// minimum milliseconds between messages from one socket (5 msg/sec)
const RATE_LIMIT_MS = 200;

// ─── Sanitization ─────────────────────────────────────────────────────────────
// strip every ASCII control character (0x00–0x1F, 0x7F) except tab (0x09)
// these can't be displayed and can be used to smuggle escape sequences
function stripControlChars(str) {
  return str.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "");
}

function sanitize(raw) {
  if (typeof raw !== "string") return null;

  const cleaned = stripControlChars(raw).trim();

  if (cleaned.length === 0) return null; // blank after cleanup
  if (cleaned.length > MAX_MESSAGE_LENGTH) return null; // oversized

  return cleaned;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function broadcastUserList() {
  const ids = Array.from(io.sockets.sockets.keys());
  io.emit("userList", ids);
}

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(socket.id, "connected — total:", io.sockets.sockets.size);

  broadcastUserList();

  // track when this socket last successfully sent a message for rate limiting
  let lastMessageAt = 0;

  socket.on("messageFromClientToServer", (raw) => {
    // rate limit: silently drop messages that arrive too fast
    const now = Date.now();
    if (now - lastMessageAt < RATE_LIMIT_MS) return;
    lastMessageAt = now;

    // sanitize — reject anything that doesn't pass validation
    const text = sanitize(raw);
    if (!text) return;

    io.emit("messageFromServerToAllClients", {
      senderId: socket.id,
      text,
    });
  });

  socket.on("disconnect", () => {
    console.log(socket.id, "disconnected — total:", io.sockets.sockets.size);
    broadcastUserList();
  });
});
