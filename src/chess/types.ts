import { ChessGameState, ChessMove, PieceColor, PieceType } from './engine';

export type TimeCategory = 'Bullet' | 'Blitz' | 'Rapid' | 'Classical';

export interface TimeControlOption {
  id: string;
  label: string;
  category: TimeCategory;
  initialMs: number;
  incrementMs: number;
  description: string;
}

export const TIME_CONTROLS: TimeControlOption[] = [
  {
    id: 'bullet_1_0',
    label: '1 + 0',
    category: 'Bullet',
    initialMs: 60 * 1000,
    incrementMs: 0,
    description: '1 min ultra-fast sprint',
  },
  {
    id: 'bullet_2_1',
    label: '2 + 1',
    category: 'Bullet',
    initialMs: 2 * 60 * 1000,
    incrementMs: 1000,
    description: '2 min + 1s increment',
  },
  {
    id: 'blitz_3_0',
    label: '3 + 0',
    category: 'Blitz',
    initialMs: 3 * 60 * 1000,
    incrementMs: 0,
    description: '3 min tournament blitz',
  },
  {
    id: 'blitz_3_2',
    label: '3 + 2',
    category: 'Blitz',
    initialMs: 3 * 60 * 1000,
    incrementMs: 2 * 1000,
    description: '3 min + 2s FIDE blitz',
  },
  {
    id: 'blitz_5_0',
    label: '5 + 0',
    category: 'Blitz',
    initialMs: 5 * 60 * 1000,
    incrementMs: 0,
    description: '5 min tactical duel',
  },
  {
    id: 'rapid_10_0',
    label: '10 + 0',
    category: 'Rapid',
    initialMs: 10 * 60 * 1000,
    incrementMs: 0,
    description: '10 min standard rapid',
  },
  {
    id: 'rapid_15_10',
    label: '15 + 10',
    category: 'Rapid',
    initialMs: 15 * 60 * 1000,
    incrementMs: 10 * 1000,
    description: '15 min + 10s increment',
  },
  {
    id: 'classical_30_0',
    label: '30 + 0',
    category: 'Classical',
    initialMs: 30 * 60 * 1000,
    incrementMs: 0,
    description: '30 min deep calculation',
  },
];

export interface PlayerProfile {
  id: string;
  username: string;
  rating: number;
  wins: number;
  losses: number;
  draws: number;
  createdAt: string;
  updatedAt: string;
}

export interface RoomPlayerSeat {
  id: string;
  username: string;
  rating: number;
  connected: boolean;
  disconnectedAt: number | null;
  ratingDelta?: number;
}

export interface RoomStatePayload {
  roomCode: string;
  isPrivate: boolean;
  status: 'waiting' | 'active' | 'finished';
  timeControl: TimeControlOption;
  white: RoomPlayerSeat | null;
  black: RoomPlayerSeat | null;
  spectatorCount: number;
  spectatorNames: string[];
  gameState: ChessGameState;
  whiteTimeMs: number;
  blackTimeMs: number;
  drawOfferedBy: PieceColor | null;
  rematchOfferedBy: PieceColor | null;
  nextRoomCode?: string | null;
  createdAt: number;
  startedAt: number | null;
  finishedAt: number | null;
}

export interface LiveRoomSummary {
  roomCode: string;
  isPrivate: boolean;
  status: 'waiting' | 'active' | 'finished';
  timeControl: TimeControlOption;
  whiteName: string;
  whiteRating: number;
  blackName: string | null;
  blackRating: number | null;
  spectatorCount: number;
  moveCount: number;
  turn: PieceColor;
}

export interface ArchivedGameRecord {
  id: string;
  roomCode: string;
  whiteId: string;
  whiteName: string;
  whiteRatingBefore: number;
  whiteRatingAfter: number;
  blackId: string;
  blackName: string;
  blackRatingBefore: number;
  blackRatingAfter: number;
  winner: PieceColor | 'draw';
  resultReason: string;
  timeControl: TimeControlOption;
  moves: ChessMove[];
  finalFen: string;
  finishedAt: string;
}

export interface LobbySnapshotPayload {
  onlineCount: number;
  queueCounts: Record<string, number>;
  liveRooms: LiveRoomSummary[];
  leaderboard: PlayerProfile[];
  recentGames: ArchivedGameRecord[];
}

export type ClientWsMessage =
  | { type: 'auth:identify'; token: string }
  | { type: 'lobby:subscribe' }
  | { type: 'queue:join'; timeControlId: string }
  | { type: 'queue:leave' }
  | { type: 'room:create'; timeControlId: string; isPrivate: boolean; preferredColor?: 'w' | 'b' | 'random' }
  | { type: 'room:join'; roomCode: string }
  | { type: 'room:spectate'; roomCode: string }
  | { type: 'room:leave'; roomCode: string }
  | { type: 'game:move'; roomCode: string; from: string; to: string; promotion?: PieceType }
  | { type: 'game:resign'; roomCode: string }
  | { type: 'game:offer_draw'; roomCode: string }
  | { type: 'game:respond_draw'; roomCode: string; accept: boolean }
  | { type: 'game:offer_rematch'; roomCode: string }
  | { type: 'game:respond_rematch'; roomCode: string; accept: boolean };

export type ServerWsMessage =
  | { type: 'auth:confirmed'; profile: PlayerProfile }
  | { type: 'lobby:update'; snapshot: LobbySnapshotPayload }
  | { type: 'queue:status'; inQueue: boolean; timeControlId: string | null }
  | { type: 'room:joined'; room: RoomStatePayload; role: 'w' | 'b' | 'spectator' }
  | { type: 'room:state'; room: RoomStatePayload }
  | { type: 'room:clock'; roomCode: string; whiteTimeMs: number; blackTimeMs: number; turn: PieceColor }
  | { type: 'room:rematch_ready'; oldRoomCode: string; newRoomCode: string; room: RoomStatePayload }
  | { type: 'error'; message: string };
