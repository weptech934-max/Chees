import express from 'express';
import http from 'http';
import path from 'path';
import fs from 'fs';
import crypto from 'crypto';
import { WebSocketServer, WebSocket } from 'ws';
import { createServer as createViteServer } from 'vite';
import {
  createInitialGameState,
  makeMove,
  calculateEloDelta,
  PieceColor,
  ChessGameState,
} from './src/chess/engine';
import {
  TIME_CONTROLS,
  TimeControlOption,
  PlayerProfile,
  RoomStatePayload,
  LiveRoomSummary,
  ArchivedGameRecord,
  LobbySnapshotPayload,
  ClientWsMessage,
  ServerWsMessage,
} from './src/chess/types';

const PORT = 3000;
const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'arena-db.json');

interface StoredUser extends PlayerProfile {
  passwordHash: string;
}

interface DatabaseSchema {
  users: Record<string, StoredUser>;
  tokens: Record<string, string>; // token -> userId
  games: ArchivedGameRecord[];
}

function hashPassword(pw: string): string {
  return crypto.createHash('sha256').update(`gm_salt_${pw}`).digest('hex');
}

function createSeedDatabase(): DatabaseSchema {
  const now = new Date().toISOString();
  const seedUsers: Record<string, StoredUser> = {
    usr_carlsen_gm: {
      id: 'usr_carlsen_gm',
      username: 'Magnus_Valkyrie',
      passwordHash: hashPassword('chess123'),
      rating: 1840,
      wins: 42,
      losses: 6,
      draws: 5,
      createdAt: now,
      updatedAt: now,
    },
    usr_polgar_gm: {
      id: 'usr_polgar_gm',
      username: 'Judit_Tactics',
      passwordHash: hashPassword('chess123'),
      rating: 1765,
      wins: 34,
      losses: 9,
      draws: 4,
      createdAt: now,
      updatedAt: now,
    },
    usr_hikaru_blitz: {
      id: 'usr_hikaru_blitz',
      username: 'PineappleBlitz',
      passwordHash: hashPassword('chess123'),
      rating: 1710,
      wins: 29,
      losses: 11,
      draws: 3,
      createdAt: now,
      updatedAt: now,
    },
    usr_firouzja_26: {
      id: 'usr_firouzja_26',
      username: 'Alireza_Mirage',
      passwordHash: hashPassword('chess123'),
      rating: 1625,
      wins: 21,
      losses: 10,
      draws: 2,
      createdAt: now,
      updatedAt: now,
    },
  };

  // Create a seeded classic tactical miniature for immediate post-game analysis inspection
  let sampleState = createInitialGameState();
  const sampleSeq = [
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'g1', to: 'f3' },
    { from: 'b8', to: 'c6' },
    { from: 'f1', to: 'c4' },
    { from: 'f8', to: 'c5' },
    { from: 'd2', to: 'd3' },
    { from: 'g8', to: 'f6' },
    { from: 'e1', to: 'g1' },
    { from: 'd7', to: 'd6' },
    { from: 'c1', to: 'g5' },
    { from: 'h7', to: 'h6' },
    { from: 'g5', to: 'h4' },
    { from: 'g7', to: 'g5' },
    { from: 'h4', to: 'g3' },
    { from: 'e8', to: 'g8' },
  ];
  for (const step of sampleSeq) {
    const res = makeMove(sampleState, step);
    if (res) sampleState = res.nextState;
  }

  let mateState = createInitialGameState();
  const scholarSeq = [
    { from: 'e2', to: 'e4' },
    { from: 'e7', to: 'e5' },
    { from: 'f1', to: 'c4' },
    { from: 'b8', to: 'c6' },
    { from: 'd1', to: 'h5' },
    { from: 'g8', to: 'f6' },
    { from: 'h5', to: 'f7' },
  ];
  for (const step of scholarSeq) {
    const res = makeMove(mateState, step);
    if (res) mateState = res.nextState;
  }

  const seedGames: ArchivedGameRecord[] = [
    {
      id: 'game_seed_italian_01',
      roomCode: 'GM901A',
      whiteId: 'usr_carlsen_gm',
      whiteName: 'Magnus_Valkyrie',
      whiteRatingBefore: 1828,
      whiteRatingAfter: 1840,
      blackId: 'usr_polgar_gm',
      blackName: 'Judit_Tactics',
      blackRatingBefore: 1777,
      blackRatingAfter: 1765,
      winner: 'w',
      resultReason: 'resignation',
      timeControl: TIME_CONTROLS[3], // 3+2 Blitz
      moves: sampleState.moveHistory,
      finalFen: sampleState.fen,
      finishedAt: new Date(Date.now() - 1000 * 60 * 18).toISOString(),
    },
    {
      id: 'game_seed_scholar_02',
      roomCode: 'GM404B',
      whiteId: 'usr_hikaru_blitz',
      whiteName: 'PineappleBlitz',
      whiteRatingBefore: 1696,
      whiteRatingAfter: 1710,
      blackId: 'usr_firouzja_26',
      blackName: 'Alireza_Mirage',
      blackRatingBefore: 1639,
      blackRatingAfter: 1625,
      winner: 'w',
      resultReason: 'checkmate',
      timeControl: TIME_CONTROLS[0], // 1+0 Bullet
      moves: mateState.moveHistory,
      finalFen: mateState.fen,
      finishedAt: new Date(Date.now() - 1000 * 60 * 42).toISOString(),
    },
  ];

  return {
    users: seedUsers,
    tokens: {},
    games: seedGames,
  };
}

function loadDatabase(): DatabaseSchema {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const raw = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(raw) as DatabaseSchema;
      if (parsed && parsed.users && parsed.games) {
        return parsed;
      }
    }
  } catch (err) {
    console.error('Failed to load DB, initializing fresh:', err);
  }
  const initial = createSeedDatabase();
  saveDatabase(initial);
  return initial;
}

function saveDatabase(db: DatabaseSchema): void {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2), 'utf8');
  } catch (err) {
    console.error('Failed to write DB:', err);
  }
}

const db = loadDatabase();

function toPublicProfile(u: StoredUser): PlayerProfile {
  return {
    id: u.id,
    username: u.username,
    rating: u.rating,
    wins: u.wins,
    losses: u.losses,
    draws: u.draws,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

function issueToken(userId: string): string {
  const token = `tok_${crypto.randomBytes(18).toString('hex')}`;
  db.tokens[token] = userId;
  saveDatabase(db);
  return token;
}

function getUserByToken(token?: string | null): StoredUser | null {
  if (!token) return null;
  const clean = token.replace(/^Bearer\s+/i, '').trim();
  const uid = db.tokens[clean];
  if (!uid) return null;
  return db.users[uid] || null;
}

// Active Multiplayer Rooms & Matchmaking State
interface ServerRoom {
  roomCode: string;
  isPrivate: boolean;
  status: 'waiting' | 'active' | 'finished';
  timeControl: TimeControlOption;
  white: {
    id: string;
    username: string;
    rating: number;
    connected: boolean;
    disconnectedAt: number | null;
    ratingDelta?: number;
  } | null;
  black: {
    id: string;
    username: string;
    rating: number;
    connected: boolean;
    disconnectedAt: number | null;
    ratingDelta?: number;
  } | null;
  spectators: Map<string, string>; // userId -> username
  sockets: Set<WebSocket>;
  gameState: ChessGameState;
  whiteTimeMs: number;
  blackTimeMs: number;
  lastClockTickAt: number | null;
  drawOfferedBy: PieceColor | null;
  rematchOfferedBy: PieceColor | null;
  nextRoomCode: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

const rooms = new Map<string, ServerRoom>();

interface QueueEntry {
  userId: string;
  username: string;
  rating: number;
  timeControlId: string;
  ws: WebSocket;
  joinedAt: number;
}

const matchmakingQueue: QueueEntry[] = [];
const socketToUser = new Map<WebSocket, StoredUser>();
const socketToRoom = new Map<WebSocket, string>();

function generateRoomCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  do {
    code = '';
    for (let i = 0; i < 6; i++) {
      code += chars[Math.floor(Math.random() * chars.length)];
    }
  } while (rooms.has(code));
  return code;
}

function serializeRoom(room: ServerRoom): RoomStatePayload {
  return {
    roomCode: room.roomCode,
    isPrivate: room.isPrivate,
    status: room.status,
    timeControl: room.timeControl,
    white: room.white ? { ...room.white } : null,
    black: room.black ? { ...room.black } : null,
    spectatorCount: room.spectators.size,
    spectatorNames: Array.from(room.spectators.values()),
    gameState: room.gameState,
    whiteTimeMs: Math.max(0, Math.round(room.whiteTimeMs)),
    blackTimeMs: Math.max(0, Math.round(room.blackTimeMs)),
    drawOfferedBy: room.drawOfferedBy,
    rematchOfferedBy: room.rematchOfferedBy,
    nextRoomCode: room.nextRoomCode,
    createdAt: room.createdAt,
    startedAt: room.startedAt,
    finishedAt: room.finishedAt,
  };
}

function buildLobbySnapshot(): LobbySnapshotPayload {
  const queueCounts: Record<string, number> = {};
  for (const tc of TIME_CONTROLS) {
    queueCounts[tc.id] = 0;
  }
  for (const q of matchmakingQueue) {
    queueCounts[q.timeControlId] = (queueCounts[q.timeControlId] || 0) + 1;
  }

  const liveRooms: LiveRoomSummary[] = [];
  for (const r of rooms.values()) {
    if (r.status === 'finished' && Date.now() - (r.finishedAt || 0) > 60_000) continue;
    if (r.isPrivate && r.status === 'waiting') continue; // keep private waiting rooms unlisted so only code invites join
    liveRooms.push({
      roomCode: r.roomCode,
      isPrivate: r.isPrivate,
      status: r.status,
      timeControl: r.timeControl,
      whiteName: r.white?.username || 'Open Seat',
      whiteRating: r.white?.rating || 1200,
      blackName: r.black?.username || null,
      blackRating: r.black?.rating || null,
      spectatorCount: r.spectators.size,
      moveCount: r.gameState.moveHistory.length,
      turn: r.gameState.turn,
    });
  }

  const leaderboard = Object.values(db.users)
    .map(toPublicProfile)
    .sort((a, b) => b.rating - a.rating)
    .slice(0, 15);

  const recentGames = db.games.slice(0, 20);

  return {
    onlineCount: Math.max(1, socketToUser.size),
    queueCounts,
    liveRooms,
    leaderboard,
    recentGames,
  };
}

function sendWs(ws: WebSocket, msg: ServerWsMessage): void {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(msg));
  }
}

function broadcastRoomState(room: ServerRoom): void {
  const payload = serializeRoom(room);
  for (const client of room.sockets) {
    sendWs(client, { type: 'room:state', room: payload });
  }
}

let wssInstance: WebSocketServer | null = null;

function broadcastLobbyUpdate(): void {
  if (!wssInstance) return;
  const snapshot = buildLobbySnapshot();
  for (const client of wssInstance.clients) {
    sendWs(client, { type: 'lobby:update', snapshot });
  }
}

function finalizeRoomResult(
  room: ServerRoom,
  winner: PieceColor | 'draw',
  reason: string
): void {
  if (room.status === 'finished') return;
  room.status = 'finished';
  room.finishedAt = Date.now();
  room.lastClockTickAt = null;
  room.drawOfferedBy = null;
  room.gameState.isGameOver = true;
  room.gameState.winner = winner;
  room.gameState.resultReason = reason as ChessGameState['resultReason'];

  if (room.white && room.black) {
    const whiteUser = db.users[room.white.id];
    const blackUser = db.users[room.black.id];
    const wBefore = whiteUser ? whiteUser.rating : room.white.rating;
    const bBefore = blackUser ? blackUser.rating : room.black.rating;

    const elo = calculateEloDelta(wBefore, bBefore, winner);
    room.white.rating = elo.whiteNew;
    room.white.ratingDelta = elo.whiteDelta;
    room.black.rating = elo.blackNew;
    room.black.ratingDelta = elo.blackDelta;

    const nowIso = new Date().toISOString();
    if (whiteUser) {
      whiteUser.rating = elo.whiteNew;
      if (winner === 'w') whiteUser.wins += 1;
      else if (winner === 'b') whiteUser.losses += 1;
      else whiteUser.draws += 1;
      whiteUser.updatedAt = nowIso;
    }
    if (blackUser) {
      blackUser.rating = elo.blackNew;
      if (winner === 'b') blackUser.wins += 1;
      else if (winner === 'w') blackUser.losses += 1;
      else blackUser.draws += 1;
      blackUser.updatedAt = nowIso;
    }

    const archived: ArchivedGameRecord = {
      id: `game_${room.roomCode}_${Date.now()}`,
      roomCode: room.roomCode,
      whiteId: room.white.id,
      whiteName: room.white.username,
      whiteRatingBefore: wBefore,
      whiteRatingAfter: elo.whiteNew,
      blackId: room.black.id,
      blackName: room.black.username,
      blackRatingBefore: bBefore,
      blackRatingAfter: elo.blackNew,
      winner,
      resultReason: reason,
      timeControl: room.timeControl,
      moves: room.gameState.moveHistory,
      finalFen: room.gameState.fen,
      finishedAt: nowIso,
    };

    db.games.unshift(archived);
    if (db.games.length > 100) db.games.length = 100;
    saveDatabase(db);

    // Notify connected players of their updated profile stats
    for (const [sock, usr] of socketToUser.entries()) {
      if (usr.id === room.white.id && whiteUser) {
        sendWs(sock, { type: 'auth:confirmed', profile: toPublicProfile(whiteUser) });
      } else if (usr.id === room.black.id && blackUser) {
        sendWs(sock, { type: 'auth:confirmed', profile: toPublicProfile(blackUser) });
      }
    }
  }

  broadcastRoomState(room);
  broadcastLobbyUpdate();
}

function removeFromQueue(ws: WebSocket): void {
  const idx = matchmakingQueue.findIndex((q) => q.ws === ws);
  if (idx !== -1) {
    matchmakingQueue.splice(idx, 1);
    sendWs(ws, { type: 'queue:status', inQueue: false, timeControlId: null });
    broadcastLobbyUpdate();
  }
}

function detachSocketFromCurrentRoom(ws: WebSocket): void {
  const code = socketToRoom.get(ws);
  if (!code) return;
  socketToRoom.delete(ws);
  const room = rooms.get(code);
  if (!room) return;
  room.sockets.delete(ws);

  const user = socketToUser.get(ws);
  if (!user) return;

  // Check if user still has another open socket in this room
  let stillInRoom = false;
  for (const s of room.sockets) {
    if (socketToUser.get(s)?.id === user.id) {
      stillInRoom = true;
      break;
    }
  }

  if (!stillInRoom) {
    if (room.white?.id === user.id) {
      room.white.connected = false;
      room.white.disconnectedAt = Date.now();
    } else if (room.black?.id === user.id) {
      room.black.connected = false;
      room.black.disconnectedAt = Date.now();
    } else {
      room.spectators.delete(user.id);
    }
    broadcastRoomState(room);
    broadcastLobbyUpdate();
  }
}

async function startServer() {
  const app = express();
  app.use(express.json());

  // --- REST API ---
  app.post('/api/auth/register', (req, res) => {
    const { username, password } = req.body || {};
    const cleanName = String(username || '').trim().slice(0, 32);
    const cleanPass = String(password || '');
    if (cleanName.length < 2) {
      res.status(400).json({ error: 'Username must be at least 2 characters.' });
      return;
    }
    if (cleanPass.length < 3) {
      res.status(400).json({ error: 'Password must be at least 3 characters.' });
      return;
    }

    const existing = Object.values(db.users).find(
      (u) => u.username.toLowerCase() === cleanName.toLowerCase()
    );
    if (existing) {
      res.status(409).json({ error: 'Username is already taken. Try signing in instead.' });
      return;
    }

    const now = new Date().toISOString();
    const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
    const newUser: StoredUser = {
      id,
      username: cleanName,
      passwordHash: hashPassword(cleanPass),
      rating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users[id] = newUser;
    const token = issueToken(id);
    res.json({ token, profile: toPublicProfile(newUser) });
  });

  app.post('/api/auth/login', (req, res) => {
    const { username, password } = req.body || {};
    const cleanName = String(username || '').trim().slice(0, 32);
    const cleanPass = String(password || '');
    if (!cleanName || !cleanPass) {
      res.status(400).json({ error: 'Please enter both username and password.' });
      return;
    }

    const existing = Object.values(db.users).find(
      (u) => u.username.toLowerCase() === cleanName.toLowerCase()
    );
    if (!existing) {
      res.status(401).json({ error: 'Account not found. Please register first.' });
      return;
    }
    if (existing.passwordHash !== hashPassword(cleanPass)) {
      res.status(401).json({ error: 'Incorrect password.' });
      return;
    }

    const token = issueToken(existing.id);
    res.json({ token, profile: toPublicProfile(existing) });
  });

  app.post('/api/auth/guest', (req, res) => {
    const { username } = req.body || {};
    const requested = String(username || '').trim().slice(0, 28);
    const baseName = requested.length >= 2
      ? requested
      : `Grandmaster_${Math.floor(100 + Math.random() * 899)}`;

    // Ensure uniqueness or reuse if non-password guest
    const now = new Date().toISOString();
    const id = `usr_${crypto.randomBytes(6).toString('hex')}`;
    let finalName = baseName;
    const collision = Object.values(db.users).some(
      (u) => u.username.toLowerCase() === finalName.toLowerCase()
    );
    if (collision) {
      finalName = `${baseName.slice(0, 22)}_${Math.floor(10 + Math.random() * 89)}`;
    }

    const newUser: StoredUser = {
      id,
      username: finalName,
      passwordHash: hashPassword(crypto.randomBytes(8).toString('hex')),
      rating: 1200,
      wins: 0,
      losses: 0,
      draws: 0,
      createdAt: now,
      updatedAt: now,
    };
    db.users[id] = newUser;
    const token = issueToken(id);
    res.json({ token, profile: toPublicProfile(newUser) });
  });

  app.post('/api/auth/firebase', (req, res) => {
    const { uid, displayName } = req.body || {};
    if (!uid) {
      res.status(400).json({ error: 'Missing Firebase UID.' });
      return;
    }
    const cleanId = `fb_${String(uid).replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 64)}`;
    let user = db.users[cleanId];
    const now = new Date().toISOString();
    if (!user) {
      user = {
        id: cleanId,
        username: String(displayName || 'GoogleContender').trim().slice(0, 32) || 'GoogleContender',
        passwordHash: '',
        rating: 1200,
        wins: 0,
        losses: 0,
        draws: 0,
        createdAt: now,
        updatedAt: now,
      };
      db.users[cleanId] = user;
    } else if (displayName && String(displayName).trim().length >= 2) {
      user.username = String(displayName).trim().slice(0, 32);
      user.updatedAt = now;
    }
    const token = issueToken(user.id);
    res.json({ token, profile: toPublicProfile(user) });
  });

  app.get('/api/auth/me', (req, res) => {
    const user = getUserByToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Invalid or expired session token.' });
      return;
    }
    res.json({ profile: toPublicProfile(user) });
  });

  app.patch('/api/auth/profile', (req, res) => {
    const user = getUserByToken(req.headers.authorization);
    if (!user) {
      res.status(401).json({ error: 'Unauthorized' });
      return;
    }
    const { username } = req.body || {};
    const clean = String(username || '').trim().slice(0, 32);
    if (clean.length < 2) {
      res.status(400).json({ error: 'Display name must be at least 2 characters.' });
      return;
    }
    user.username = clean;
    user.updatedAt = new Date().toISOString();
    saveDatabase(db);
    broadcastLobbyUpdate();
    res.json({ profile: toPublicProfile(user) });
  });

  app.get('/api/lobby', (_req, res) => {
    res.json(buildLobbySnapshot());
  });

  app.get('/api/games/:id', (req, res) => {
    const game = db.games.find((g) => g.id === req.params.id || g.roomCode === req.params.id);
    if (!game) {
      res.status(404).json({ error: 'Game not found' });
      return;
    }
    res.json({ game });
  });

  const httpServer = http.createServer(app);

  // --- WebSocket Server ---
  const wss = new WebSocketServer({ server: httpServer, path: '/ws' });
  wssInstance = wss;

  wss.on('connection', (ws) => {
    sendWs(ws, { type: 'lobby:update', snapshot: buildLobbySnapshot() });

    ws.on('message', (rawBuf) => {
      let msg: ClientWsMessage;
      try {
        msg = JSON.parse(String(rawBuf)) as ClientWsMessage;
      } catch {
        sendWs(ws, { type: 'error', message: 'Invalid WebSocket JSON payload.' });
        return;
      }

      if (msg.type === 'auth:identify') {
        const user = getUserByToken(msg.token);
        if (!user) {
          sendWs(ws, { type: 'error', message: 'Session expired. Please sign in again.' });
          return;
        }
        socketToUser.set(ws, user);
        sendWs(ws, { type: 'auth:confirmed', profile: toPublicProfile(user) });
        broadcastLobbyUpdate();
        return;
      }

      if (msg.type === 'lobby:subscribe') {
        sendWs(ws, { type: 'lobby:update', snapshot: buildLobbySnapshot() });
        return;
      }

      const currentUser = socketToUser.get(ws);
      if (!currentUser) {
        sendWs(ws, { type: 'error', message: 'Please sign in first before joining a game.' });
        return;
      }

      if (msg.type === 'queue:join') {
        removeFromQueue(ws);
        const tc = TIME_CONTROLS.find((t) => t.id === msg.timeControlId) || TIME_CONTROLS[5];

        // Check if another contender is waiting in the same timeControlId
        const matchIdx = matchmakingQueue.findIndex(
          (q) => q.timeControlId === tc.id && q.userId !== currentUser.id && q.ws.readyState === WebSocket.OPEN
        );

        if (matchIdx !== -1) {
          const opponent = matchmakingQueue.splice(matchIdx, 1)[0];
          sendWs(opponent.ws, { type: 'queue:status', inQueue: false, timeControlId: null });
          sendWs(ws, { type: 'queue:status', inQueue: false, timeControlId: null });

          const roomCode = generateRoomCode();
          const assignWhiteToOpponent = Math.random() < 0.5;
          const whiteUser = assignWhiteToOpponent ? db.users[opponent.userId] || currentUser : currentUser;
          const blackUser = assignWhiteToOpponent ? currentUser : db.users[opponent.userId] || currentUser;

          const now = Date.now();
          const newRoom: ServerRoom = {
            roomCode,
            isPrivate: false,
            status: 'active',
            timeControl: tc,
            white: {
              id: whiteUser.id,
              username: whiteUser.username,
              rating: whiteUser.rating,
              connected: true,
              disconnectedAt: null,
            },
            black: {
              id: blackUser.id,
              username: blackUser.username,
              rating: blackUser.rating,
              connected: true,
              disconnectedAt: null,
            },
            spectators: new Map(),
            sockets: new Set([opponent.ws, ws]),
            gameState: createInitialGameState(),
            whiteTimeMs: tc.initialMs,
            blackTimeMs: tc.initialMs,
            lastClockTickAt: now,
            drawOfferedBy: null,
            rematchOfferedBy: null,
            nextRoomCode: null,
            createdAt: now,
            startedAt: now,
            finishedAt: null,
          };

          detachSocketFromCurrentRoom(opponent.ws);
          detachSocketFromCurrentRoom(ws);
          rooms.set(roomCode, newRoom);
          socketToRoom.set(opponent.ws, roomCode);
          socketToRoom.set(ws, roomCode);

          const serialized = serializeRoom(newRoom);
          sendWs(opponent.ws, {
            type: 'room:joined',
            room: serialized,
            role: assignWhiteToOpponent ? 'w' : 'b',
          });
          sendWs(ws, {
            type: 'room:joined',
            room: serialized,
            role: assignWhiteToOpponent ? 'b' : 'w',
          });
          broadcastLobbyUpdate();
        } else {
          matchmakingQueue.push({
            userId: currentUser.id,
            username: currentUser.username,
            rating: currentUser.rating,
            timeControlId: tc.id,
            ws,
            joinedAt: Date.now(),
          });
          sendWs(ws, { type: 'queue:status', inQueue: true, timeControlId: tc.id });
          broadcastLobbyUpdate();
        }
        return;
      }

      if (msg.type === 'queue:leave') {
        removeFromQueue(ws);
        return;
      }

      if (msg.type === 'room:create') {
        removeFromQueue(ws);
        detachSocketFromCurrentRoom(ws);

        const tc = TIME_CONTROLS.find((t) => t.id === msg.timeControlId) || TIME_CONTROLS[5];
        const roomCode = generateRoomCode();
        const pref = msg.preferredColor || 'w';
        const creatorIsWhite = pref === 'w' ? true : pref === 'b' ? false : Math.random() < 0.5;
        const now = Date.now();

        const seat = {
          id: currentUser.id,
          username: currentUser.username,
          rating: currentUser.rating,
          connected: true,
          disconnectedAt: null,
        };

        const newRoom: ServerRoom = {
          roomCode,
          isPrivate: Boolean(msg.isPrivate),
          status: 'waiting',
          timeControl: tc,
          white: creatorIsWhite ? seat : null,
          black: creatorIsWhite ? null : seat,
          spectators: new Map(),
          sockets: new Set([ws]),
          gameState: createInitialGameState(),
          whiteTimeMs: tc.initialMs,
          blackTimeMs: tc.initialMs,
          lastClockTickAt: null,
          drawOfferedBy: null,
          rematchOfferedBy: null,
          nextRoomCode: null,
          createdAt: now,
          startedAt: null,
          finishedAt: null,
        };

        rooms.set(roomCode, newRoom);
        socketToRoom.set(ws, roomCode);
        sendWs(ws, {
          type: 'room:joined',
          room: serializeRoom(newRoom),
          role: creatorIsWhite ? 'w' : 'b',
        });
        broadcastLobbyUpdate();
        return;
      }

      if (msg.type === 'room:join' || msg.type === 'room:spectate') {
        const cleanCode = String(msg.roomCode || '').trim().toUpperCase();
        const room = rooms.get(cleanCode);
        if (!room) {
          sendWs(ws, { type: 'error', message: `Room "${cleanCode}" was not found.` });
          return;
        }

        removeFromQueue(ws);
        detachSocketFromCurrentRoom(ws);
        room.sockets.add(ws);
        socketToRoom.set(ws, cleanCode);

        // Check if user is already seated as White or Black (Reconnect handling!)
        if (room.white?.id === currentUser.id) {
          room.white.connected = true;
          room.white.disconnectedAt = null;
          room.white.username = currentUser.username;
          sendWs(ws, { type: 'room:joined', room: serializeRoom(room), role: 'w' });
          broadcastRoomState(room);
          broadcastLobbyUpdate();
          return;
        }
        if (room.black?.id === currentUser.id) {
          room.black.connected = true;
          room.black.disconnectedAt = null;
          room.black.username = currentUser.username;
          sendWs(ws, { type: 'room:joined', room: serializeRoom(room), role: 'b' });
          broadcastRoomState(room);
          broadcastLobbyUpdate();
          return;
        }

        // If explicitly spectating or both seats are filled, join as spectator
        if (msg.type === 'room:spectate' || (room.white && room.black) || room.status !== 'waiting') {
          room.spectators.set(currentUser.id, currentUser.username);
          sendWs(ws, { type: 'room:joined', room: serializeRoom(room), role: 'spectator' });
          broadcastRoomState(room);
          broadcastLobbyUpdate();
          return;
        }

        // Otherwise claim the open seat and start the match!
        const seat = {
          id: currentUser.id,
          username: currentUser.username,
          rating: currentUser.rating,
          connected: true,
          disconnectedAt: null,
        };
        let assignedRole: 'w' | 'b' = 'b';
        if (!room.white) {
          room.white = seat;
          assignedRole = 'w';
        } else {
          room.black = seat;
          assignedRole = 'b';
        }

        if (room.white && room.black) {
          room.status = 'active';
          room.startedAt = Date.now();
          room.lastClockTickAt = Date.now();
        }

        sendWs(ws, { type: 'room:joined', room: serializeRoom(room), role: assignedRole });
        broadcastRoomState(room);
        broadcastLobbyUpdate();
        return;
      }

      if (msg.type === 'room:leave') {
        detachSocketFromCurrentRoom(ws);
        return;
      }

      if (msg.type === 'game:move') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'active') {
          sendWs(ws, { type: 'error', message: 'Game is not currently active.' });
          return;
        }

        const isWhitePlayer = room.white?.id === currentUser.id;
        const isBlackPlayer = room.black?.id === currentUser.id;
        if (!isWhitePlayer && !isBlackPlayer) {
          sendWs(ws, { type: 'error', message: 'Spectators cannot make moves.' });
          return;
        }

        const playerColor: PieceColor = isWhitePlayer ? 'w' : 'b';
        if (room.gameState.turn !== playerColor) {
          sendWs(ws, { type: 'error', message: 'It is not your turn.' });
          return;
        }

        // Update clock before move
        const now = Date.now();
        if (room.lastClockTickAt) {
          const elapsed = Math.max(0, now - room.lastClockTickAt);
          if (playerColor === 'w') {
            room.whiteTimeMs = Math.max(0, room.whiteTimeMs - elapsed);
            if (room.whiteTimeMs <= 0) {
              finalizeRoomResult(room, 'b', 'timeout');
              return;
            }
          } else {
            room.blackTimeMs = Math.max(0, room.blackTimeMs - elapsed);
            if (room.blackTimeMs <= 0) {
              finalizeRoomResult(room, 'w', 'timeout');
              return;
            }
          }
        }

        const moveRes = makeMove(room.gameState, {
          from: msg.from,
          to: msg.to,
          promotion: msg.promotion,
        });

        if (!moveRes) {
          sendWs(ws, { type: 'error', message: `Illegal move: ${msg.from} to ${msg.to}` });
          return;
        }

        // Apply increment after valid move
        if (playerColor === 'w') {
          room.whiteTimeMs += room.timeControl.incrementMs;
        } else {
          room.blackTimeMs += room.timeControl.incrementMs;
        }

        room.gameState = moveRes.nextState;
        room.lastClockTickAt = now;
        room.drawOfferedBy = null; // Clear pending draw offer on move

        if (room.gameState.isGameOver && room.gameState.winner && room.gameState.resultReason) {
          finalizeRoomResult(room, room.gameState.winner, room.gameState.resultReason);
        } else {
          broadcastRoomState(room);
          broadcastLobbyUpdate();
        }
        return;
      }

      if (msg.type === 'game:resign') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'active') return;
        const isWhite = room.white?.id === currentUser.id;
        const isBlack = room.black?.id === currentUser.id;
        if (!isWhite && !isBlack) return;

        const winner: PieceColor = isWhite ? 'b' : 'w';
        finalizeRoomResult(room, winner, 'resignation');
        return;
      }

      if (msg.type === 'game:offer_draw') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'active') return;
        const isWhite = room.white?.id === currentUser.id;
        const isBlack = room.black?.id === currentUser.id;
        if (!isWhite && !isBlack) return;

        const offerColor: PieceColor = isWhite ? 'w' : 'b';
        if (room.drawOfferedBy && room.drawOfferedBy !== offerColor) {
          // Both players offered draw -> accept immediately
          finalizeRoomResult(room, 'draw', 'draw_agreement');
        } else {
          room.drawOfferedBy = offerColor;
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'game:respond_draw') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'active' || !room.drawOfferedBy) return;
        const isWhite = room.white?.id === currentUser.id;
        const isBlack = room.black?.id === currentUser.id;
        if (!isWhite && !isBlack) return;
        const responderColor: PieceColor = isWhite ? 'w' : 'b';
        if (room.drawOfferedBy === responderColor) return;

        if (msg.accept) {
          finalizeRoomResult(room, 'draw', 'draw_agreement');
        } else {
          room.drawOfferedBy = null;
          broadcastRoomState(room);
        }
        return;
      }

      if (msg.type === 'game:offer_rematch') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'finished') return;
        const isWhite = room.white?.id === currentUser.id;
        const isBlack = room.black?.id === currentUser.id;
        if (!isWhite && !isBlack) return;

        const offerColor: PieceColor = isWhite ? 'w' : 'b';
        room.rematchOfferedBy = offerColor;
        broadcastRoomState(room);
        return;
      }

      if (msg.type === 'game:respond_rematch') {
        const room = rooms.get(String(msg.roomCode || '').toUpperCase());
        if (!room || room.status !== 'finished' || !room.rematchOfferedBy || !room.white || !room.black) return;
        const isWhite = room.white.id === currentUser.id;
        const isBlack = room.black.id === currentUser.id;
        if (!isWhite && !isBlack) return;
        const responderColor: PieceColor = isWhite ? 'w' : 'b';
        if (room.rematchOfferedBy === responderColor) return;

        if (!msg.accept) {
          room.rematchOfferedBy = null;
          broadcastRoomState(room);
          return;
        }

        // Create a fresh rematch room with colors swapped!
        const newCode = generateRoomCode();
        const now = Date.now();
        const prevWhite = db.users[room.white.id] || room.white;
        const prevBlack = db.users[room.black.id] || room.black;

        const rematchRoom: ServerRoom = {
          roomCode: newCode,
          isPrivate: room.isPrivate,
          status: 'active',
          timeControl: room.timeControl,
          white: {
            id: prevBlack.id,
            username: prevBlack.username,
            rating: prevBlack.rating,
            connected: true,
            disconnectedAt: null,
          },
          black: {
            id: prevWhite.id,
            username: prevWhite.username,
            rating: prevWhite.rating,
            connected: true,
            disconnectedAt: null,
          },
          spectators: new Map(room.spectators),
          sockets: new Set(room.sockets),
          gameState: createInitialGameState(),
          whiteTimeMs: room.timeControl.initialMs,
          blackTimeMs: room.timeControl.initialMs,
          lastClockTickAt: now,
          drawOfferedBy: null,
          rematchOfferedBy: null,
          nextRoomCode: null,
          createdAt: now,
          startedAt: now,
          finishedAt: null,
        };

        room.nextRoomCode = newCode;
        rooms.set(newCode, rematchRoom);

        const serializedNew = serializeRoom(rematchRoom);
        for (const sock of rematchRoom.sockets) {
          socketToRoom.set(sock, newCode);
          const u = socketToUser.get(sock);
          const role: 'w' | 'b' | 'spectator' =
            u?.id === rematchRoom.white?.id
              ? 'w'
              : u?.id === rematchRoom.black?.id
              ? 'b'
              : 'spectator';
          sendWs(sock, {
            type: 'room:rematch_ready',
            oldRoomCode: room.roomCode,
            newRoomCode: newCode,
            room: serializedNew,
          });
          sendWs(sock, {
            type: 'room:joined',
            room: serializedNew,
            role,
          });
        }
        room.sockets.clear();
        broadcastLobbyUpdate();
        return;
      }
    });

    ws.on('close', () => {
      removeFromQueue(ws);
      detachSocketFromCurrentRoom(ws);
      socketToUser.delete(ws);
      broadcastLobbyUpdate();
    });
  });

  // Authoritative 200ms Clock & Disconnect Timeout Loop
  setInterval(() => {
    const now = Date.now();
    for (const room of rooms.values()) {
      if (room.status !== 'active') continue;

      if (room.lastClockTickAt) {
        const dt = Math.max(0, now - room.lastClockTickAt);
        room.lastClockTickAt = now;
        if (room.gameState.turn === 'w') {
          room.whiteTimeMs = Math.max(0, room.whiteTimeMs - dt);
          if (room.whiteTimeMs <= 0) {
            finalizeRoomResult(room, 'b', 'timeout');
            continue;
          }
        } else {
          room.blackTimeMs = Math.max(0, room.blackTimeMs - dt);
          if (room.blackTimeMs <= 0) {
            finalizeRoomResult(room, 'w', 'timeout');
            continue;
          }
        }
      }

      // Check 60s disconnect abandonment
      if (room.white && !room.white.connected && room.white.disconnectedAt && now - room.white.disconnectedAt > 60_000) {
        finalizeRoomResult(room, 'b', 'abandonment');
        continue;
      }
      if (room.black && !room.black.connected && room.black.disconnectedAt && now - room.black.disconnectedAt > 60_000) {
        finalizeRoomResult(room, 'w', 'abandonment');
        continue;
      }

      // Broadcast lightweight clock sync every tick
      for (const client of room.sockets) {
        sendWs(client, {
          type: 'room:clock',
          roomCode: room.roomCode,
          whiteTimeMs: Math.round(room.whiteTimeMs),
          blackTimeMs: Math.round(room.blackTimeMs),
          turn: room.gameState.turn,
        });
      }
    }
  }, 250);

  // Vite middleware in development, static dist in production
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Grandmaster Arena server listening on http://0.0.0.0:${PORT}`);
  });
}

startServer();
