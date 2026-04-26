// open a persistent socket.io connection to the server
const socket = io("http://localhost:4000");

// ─── DOM references ───────────────────────────────────────────────────────────
const messageList    = document.getElementById("messages");
const form           = document.getElementById("messages-form");
const input          = document.getElementById("user-message");
const connectionDot  = document.getElementById("connection-dot");
const connectionLabel= document.getElementById("connection-label");
const notification   = document.getElementById("notification");
const userListEl     = document.getElementById("user-list");

// ─── Identity ─────────────────────────────────────────────────────────────────
// generate a short guest username from the socket ID once we connect
// keeps the UI personal without needing a login flow
let myUsername = "";

// 8 distinct hues cycled through when assigning avatar colours
const AVATAR_COLORS = [
  "#4c6ef5","#f03e3e","#37b24d","#f59f00",
  "#ae3ec9","#1098ad","#e8590c","#d6336c",
];

// map socket-id → stable colour so the same user always has the same bubble colour
const colorMap = {};

function colorForId(id) {
  if (!colorMap[id]) {
    const idx = Object.keys(colorMap).length % AVATAR_COLORS.length;
    colorMap[id] = AVATAR_COLORS[idx];
  }
  return colorMap[id];
}

// derive a short display name from a socket id (e.g. "Guest-3f2a")
function nameForId(id) {
  return "Guest-" + id.slice(0, 4);
}

// ─── Connection status ────────────────────────────────────────────────────────
// update the dot and label in the header whenever the connection state changes
function setConnectionStatus(status) {
  connectionDot.className = "connection-dot " + status;
  connectionLabel.textContent =
    status === "connected" ? "Connected" : "Disconnected";
}

socket.on("connect", () => {
  myUsername = nameForId(socket.id);
  setConnectionStatus("connected");
});

socket.on("disconnect", () => {
  setConnectionStatus("disconnected");
});

// ─── System notifications ─────────────────────────────────────────────────────
// briefly show a join/leave notice in the bar above the input, then hide it
function showNotification(text) {
  notification.textContent = text;
  notification.classList.add("visible");
  clearTimeout(notification._timer);
  notification._timer = setTimeout(() => {
    notification.classList.remove("visible");
  }, 3000);
}

// ─── Online user list (sidebar) ───────────────────────────────────────────────
// rebuild the sidebar list from the full user array sent by the server
function renderUserList(users) {
  userListEl.innerHTML = "";
  users.forEach((id) => {
    const name  = nameForId(id);
    const color = colorForId(id);
    const li    = document.createElement("li");

    // coloured avatar circle showing the first letter of the username
    li.innerHTML = `
      <div class="user-avatar" style="background:${color}">${name[0].toUpperCase()}</div>
      <span>${name}${id === socket.id ? " (you)" : ""}</span>
    `;
    userListEl.appendChild(li);
  });
}

// ─── Receive user list updates from the server ────────────────────────────────
socket.on("userList", (users) => {
  renderUserList(users);
});

// ─── Receive broadcast messages ───────────────────────────────────────────────
// track the last sender so consecutive messages are visually grouped together
let lastSenderId = null;

socket.on("messageFromServerToAllClients", ({ senderId, text }) => {
  const isSelf    = senderId === socket.id;
  const isGrouped = senderId === lastSenderId;
  lastSenderId    = senderId;

  const senderName  = isSelf ? "You" : nameForId(senderId);
  const senderColor = colorForId(senderId);
  const time        = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

  const li = document.createElement("li");
  li.className = [
    "message",
    isSelf ? "message--self" : "message--other",
    isGrouped ? "message--grouped" : "",
  ].join(" ");

  // meta line shows avatar dot + name + timestamp; hidden on grouped messages via CSS
  li.innerHTML = `
    <div class="message__meta">
      <span style="color:${senderColor}">${senderName}</span>
      <span>${time}</span>
    </div>
    <div class="message__bubble">${escapeHtml(text)}</div>
  `;

  messageList.appendChild(li);

  // keep the feed scrolled to the latest message
  messageList.scrollTop = messageList.scrollHeight;
});

// ─── Send a message ───────────────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = input.value.trim();
  if (!text) return; // ignore blank submissions

  input.value = "";

  // emit the message up to the server; the server will broadcast it to everyone
  socket.emit("messageFromClientToServer", text);
});

// ─── Utility: prevent XSS ────────────────────────────────────────────────────
// escape any HTML in user-provided text before inserting into the DOM
function escapeHtml(str) {
  return str
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
