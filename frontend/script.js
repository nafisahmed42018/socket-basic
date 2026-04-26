// open a persistent socket.io connection to the server
const socket = io("http://localhost:4000");

// ─── DOM references ───────────────────────────────────────────────────────────
const messageList     = document.getElementById("messages");
const form            = document.getElementById("messages-form");
const input           = document.getElementById("user-message");
const connectionDot   = document.getElementById("connection-dot");
const connectionLabel = document.getElementById("connection-label");
const notification    = document.getElementById("notification");
const userListEl      = document.getElementById("user-list");

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_MESSAGE_LENGTH = 500;

// ─── Identity ─────────────────────────────────────────────────────────────────
let myUsername = "";

const AVATAR_COLORS = [
  "#4c6ef5","#f03e3e","#37b24d","#f59f00",
  "#ae3ec9","#1098ad","#e8590c","#d6336c",
];

const colorMap = {};

function colorForId(id) {
  if (!colorMap[id]) {
    const idx = Object.keys(colorMap).length % AVATAR_COLORS.length;
    colorMap[id] = AVATAR_COLORS[idx];
  }
  return colorMap[id];
}

// derive a short display name from a socket id (e.g. "Guest-3f2a")
// socket IDs are alphanumeric so no escaping is needed, but we slice to 4
// chars anyway to prevent any unexpectedly long or exotic IDs reaching the DOM
function nameForId(id) {
  return "Guest-" + id.slice(0, 4);
}

// ─── Client-side sanitization ─────────────────────────────────────────────────
// validate and clean text before it is emitted to the server
// the server runs its own sanitization as well — this is the first line of defense
function sanitizeInput(raw) {
  if (typeof raw !== "string") return null;

  // strip ASCII control characters (can smuggle terminal/HTML escape sequences)
  const cleaned = raw.replace(/[\x00-\x08\x0B-\x1F\x7F]/g, "").trim();

  if (cleaned.length === 0)                return null;
  if (cleaned.length > MAX_MESSAGE_LENGTH) return null;

  return cleaned;
}

// validate the shape of a payload received from the server before rendering
// guards against a malicious or malfunctioning server sending unexpected data
function isValidPayload(payload) {
  return (
    payload !== null &&
    typeof payload === "object" &&
    typeof payload.senderId === "string" && payload.senderId.length > 0 &&
    typeof payload.text     === "string" && payload.text.length     > 0
  );
}

// ─── Safe DOM helpers ─────────────────────────────────────────────────────────
// create an element, set its text safely via textContent (never innerHTML),
// optionally set a class name and inline style property
function el(tag, { className, text, style } = {}) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text; // textContent never parses HTML
  if (style) Object.assign(node.style, style);
  return node;
}

// ─── Connection status ────────────────────────────────────────────────────────
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
function showNotification(text) {
  // textContent is safe — no HTML interpretation
  notification.textContent = text;
  notification.classList.add("visible");
  clearTimeout(notification._timer);
  notification._timer = setTimeout(() => {
    notification.classList.remove("visible");
  }, 3000);
}

// ─── Online user list (sidebar) ───────────────────────────────────────────────
function renderUserList(users) {
  // validate: must be an array of non-empty strings
  if (!Array.isArray(users)) return;

  userListEl.innerHTML = "";

  users.forEach((id) => {
    if (typeof id !== "string" || id.length === 0) return;

    const name  = nameForId(id);
    const color = colorForId(id);
    const li    = document.createElement("li");

    // build the avatar and name using DOM methods, not innerHTML,
    // so no value ever gets parsed as HTML
    const avatar = el("div", {
      className: "user-avatar",
      text: name[0].toUpperCase(),
      style: { background: color },
    });

    const label = el("span", {
      text: name + (id === socket.id ? " (you)" : ""),
    });

    li.appendChild(avatar);
    li.appendChild(label);
    userListEl.appendChild(li);
  });
}

socket.on("userList", (users) => {
  renderUserList(users);
});

// ─── Receive broadcast messages ───────────────────────────────────────────────
let lastSenderId = null;

socket.on("messageFromServerToAllClients", (payload) => {
  // reject malformed payloads before touching the DOM
  if (!isValidPayload(payload)) return;

  const { senderId, text } = payload;
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

  // ── meta row (sender name + time) ──────────────────────────────────────────
  // built with DOM methods so senderName and time are always plain text,
  // never interpreted as markup regardless of what the server sends
  const meta = el("div", { className: "message__meta" });

  const nameSpan = el("span", { text: senderName });
  nameSpan.style.color = senderColor; // senderColor comes from our own hardcoded palette

  const timeSpan = el("span", { text: time });

  meta.appendChild(nameSpan);
  meta.appendChild(timeSpan);

  // ── bubble ─────────────────────────────────────────────────────────────────
  // textContent sets the message as plain text — the browser will never
  // interpret it as HTML, so <script>, onerror=, etc. are all inert
  const bubble = el("div", { className: "message__bubble", text });

  li.appendChild(meta);
  li.appendChild(bubble);
  messageList.appendChild(li);

  messageList.scrollTop = messageList.scrollHeight;
});

// ─── Send a message ───────────────────────────────────────────────────────────
form.addEventListener("submit", (e) => {
  e.preventDefault();

  const text = sanitizeInput(input.value);

  // sanitizeInput returns null for blank, oversized, or control-char-only input
  if (!text) {
    input.value = "";
    return;
  }

  input.value = "";
  socket.emit("messageFromClientToServer", text);
});
