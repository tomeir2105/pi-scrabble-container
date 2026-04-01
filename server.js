import fs from "node:fs";
import http from "node:http";
import next from "next";
import { Server } from "socket.io";
import {
  addPlayerToRoom,
  attachSocketToPlayer,
  createRoom,
  createRoomCode,
  detachSocket,
  exchangeTiles,
  passTurn,
  playMove,
  serializeRoomForPlayer,
  startGame,
  undoLastTurn,
  updateRoomConfig
} from "./lib/game.js";
import { assertAuthConfig, AUTH_COOKIE_NAME, parseCookies, verifySessionToken } from "./lib/auth.js";

const GAME_LANGUAGE = process.env.GAME_LANGUAGE || "he";
const dev = process.env.NODE_ENV !== "production";
const hostname = "0.0.0.0";
const port = Number(process.env.PORT || 3010);
const nextApp = next({ dev, hostname, port });
const handle = nextApp.getRequestHandler();
const rooms = new Map();
const PUBLIC_PATH_PREFIXES = ["/_next/", "/login", "/api/auth/login", "/api/auth/logout", "/favicon.ico"];

assertAuthConfig();

function normalizeName(value) {
  const cleaned = String(value || "")
    .normalize("NFKC")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/[^\p{L}\p{N}\s_-]/gu, "")
    .trim()
    .replace(/\s+/g, " ")
    .slice(0, 24);
  return cleaned || "שחקן";
}

function normalizeRoomCode(value) {
  return String(value || "")
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 5);
}

function normalizePlayerId(value) {
  const cleaned = String(value || "").normalize("NFKC").trim().slice(0, 80);
  if (!cleaned || !/^[a-z0-9-]{8,80}$/i.test(cleaned)) {
    throw new Error("נדרשת זהות שחקן תקינה.");
  }
  return cleaned;
}

function isPublicPath(pathname) {
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(prefix));
}

function getAuthFromRequest(request) {
  const cookies = parseCookies(request.headers.cookie || "");
  return verifySessionToken(cookies[AUTH_COOKIE_NAME] || "");
}

async function loadDictionary() {
  if (GAME_LANGUAGE !== "en") {
    return new Set();
  }

  try {
    const { default: wordListPath } = await import("word-list");
    const file = fs.readFileSync(wordListPath, "utf8");
    return new Set(
      file
        .split("\n")
        .map((entry) => entry.trim().toLowerCase())
        .filter(Boolean)
    );
  } catch (error) {
    console.warn("Dictionary load failed. Falling back to open word validation.", error);
    return new Set();
  }
}

function getRoom(roomId) {
  const room = rooms.get(roomId);
  if (!room) {
    throw new Error("החדר לא נמצא.");
  }
  return room;
}

function maybeDeleteRoom(room) {
  if (!room) {
    return;
  }
  const hasConnectedPlayer = room.players.some((player) => player.connected);
  if (!hasConnectedPlayer && !room.started) {
    rooms.delete(room.id);
  }
}

function emitRoomState(io, room) {
  room.players.forEach((player) => {
    if (!player.socketId) {
      return;
    }
    io.to(player.socketId).emit("room:state", serializeRoomForPlayer(room, player.id));
  });
}

function leaveExistingRoom(io, socket) {
  const previousRoomId = socket.data.roomId;
  if (!previousRoomId) {
    return;
  }

  socket.leave(previousRoomId);
  const room = rooms.get(previousRoomId);
  if (!room) {
    socket.data.roomId = null;
    socket.data.playerId = null;
    return;
  }

  detachSocket(room, socket.id);
  socket.data.roomId = null;
  socket.data.playerId = null;
  emitRoomState(io, room);
  maybeDeleteRoom(room);
}

const dictionary = await loadDictionary();

nextApp.prepare().then(() => {
  const server = http.createServer((request, response) => {
    const requestUrl = new URL(request.url || "/", `http://${request.headers.host || "localhost"}`);
    const { pathname } = requestUrl;
    const authenticated = getAuthFromRequest(request);

    if (!authenticated && !isPublicPath(pathname)) {
      response.statusCode = 302;
      response.setHeader("Location", "/login");
      response.end();
      return;
    }

    if (authenticated && pathname === "/login") {
      response.statusCode = 302;
      response.setHeader("Location", "/");
      response.end();
      return;
    }

    handle(request, response);
  });
  const io = new Server(server, {
    cors: {
      origin: "*"
    }
  });

  io.use((socket, nextMiddleware) => {
    const cookies = parseCookies(socket.handshake.headers.cookie || "");
    if (!verifySessionToken(cookies[AUTH_COOKIE_NAME] || "")) {
      nextMiddleware(new Error("Unauthorized"));
      return;
    }
    nextMiddleware();
  });

  io.on("connection", (socket) => {
    socket.data.roomId = null;
    socket.data.playerId = null;

    socket.on("room:create", (payload, respond = () => {}) => {
      try {
        leaveExistingRoom(io, socket);
        const playerName = normalizeName(payload?.name);
        const playerId = normalizePlayerId(payload?.playerId);
        const roomId = createRoomCode(new Set(rooms.keys()));
        const room = createRoom({ roomId, playerId, playerName });
        rooms.set(roomId, room);
        attachSocketToPlayer(room, playerId, socket.id);
        socket.data.roomId = roomId;
        socket.data.playerId = playerId;
        socket.join(roomId);
        emitRoomState(io, room);
        respond({ ok: true, roomId });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("room:join", (payload, respond = () => {}) => {
      try {
        leaveExistingRoom(io, socket);
        const roomId = normalizeRoomCode(payload?.roomId);
        const playerName = normalizeName(payload?.name);
        const playerId = normalizePlayerId(payload?.playerId);
        const room = getRoom(roomId);
        addPlayerToRoom(room, { playerId, playerName });
        attachSocketToPlayer(room, playerId, socket.id);
        socket.data.roomId = roomId;
        socket.data.playerId = playerId;
        socket.join(roomId);
        emitRoomState(io, room);
        respond({ ok: true, roomId });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("game:start", (_, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        startGame(room, socket.data.playerId);
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("room:update-config", (payload, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        updateRoomConfig(room, socket.data.playerId, payload?.rules);
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("game:play", (payload, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        playMove(room, socket.data.playerId, payload?.placements, { dictionary });
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("game:pass", (_, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        passTurn(room, socket.data.playerId);
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("game:exchange", (payload, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        exchangeTiles(room, socket.data.playerId, payload?.tileIds);
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("game:undo-last-turn", (_, respond = () => {}) => {
      try {
        const room = getRoom(socket.data.roomId);
        undoLastTurn(room, socket.data.playerId);
        emitRoomState(io, room);
        respond({ ok: true });
      } catch (error) {
        respond({ ok: false, error: error.message });
      }
    });

    socket.on("disconnect", () => {
      const room = rooms.get(socket.data.roomId);
      if (!room) {
        return;
      }
      detachSocket(room, socket.id);
      emitRoomState(io, room);
      maybeDeleteRoom(room);
    });
  });

  server.listen(port, hostname, () => {
    console.log(`Scrable Live running on http://${hostname}:${port}`);
  });
});
