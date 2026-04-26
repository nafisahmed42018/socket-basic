const express = require("express");
const { Server } = require("socket.io");

const app = express();

// serve the frontend/ folder as static files
app.use(express.static("frontend"));

const expressServer = app.listen(4000);

const io = new Server(expressServer, {
  cors: ["http://localhost:4000"],
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
// broadcast the current list of connected socket IDs to every client
// the client derives display names from these IDs
function broadcastUserList() {
  const ids = Array.from(io.sockets.sockets.keys());
  io.emit("userList", ids);
}

// ─── Connection handler ───────────────────────────────────────────────────────
io.on("connection", (socket) => {
  console.log(socket.id, "connected — total:", io.sockets.sockets.size);

  // send the updated user list to every client whenever someone joins
  broadcastUserList();

  // "messageFromClientToServer" carries the raw text string from the sender
  // wrap it with the sender's socket ID so the client can style self vs. others
  socket.on("messageFromClientToServer", (text) => {
    io.emit("messageFromServerToAllClients", {
      senderId: socket.id,
      text,
    });
  });

  // send the updated user list to every client whenever someone leaves
  socket.on("disconnect", () => {
    console.log(socket.id, "disconnected — total:", io.sockets.sockets.size);
    broadcastUserList();
  });
});
