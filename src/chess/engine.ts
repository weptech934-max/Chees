export type PieceColor = 'w' | 'b';
export type PieceType = 'p' | 'n' | 'b' | 'r' | 'q' | 'k';

export interface Piece {
  type: PieceType;
  color: PieceColor;
}

export interface CastlingRights {
  wK: boolean;
  wQ: boolean;
  bK: boolean;
  bQ: boolean;
}

export interface ChessMove {
  from: string; // e.g. 'e2'
  to: string;   // e.g. 'e4'
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  promotion?: PieceType;
  isCastleKingside?: boolean;
  isCastleQueenside?: boolean;
  isEnPassant?: boolean;
  san: string;
  fenAfter: string;
  inCheckAfter: boolean;
  timestamp?: number;
}

export type GameResultReason =
  | 'checkmate'
  | 'stalemate'
  | 'insufficient_material'
  | 'fifty_move_rule'
  | 'threefold_repetition'
  | 'resignation'
  | 'timeout'
  | 'draw_agreement'
  | 'abandonment';

export interface ChessGameState {
  board: (Piece | null)[][]; // [rankIdx 0..7 from rank 8 down to rank 1][fileIdx 0..7 from a to h]
  turn: PieceColor;
  castling: CastlingRights;
  enPassantTarget: string | null; // algebraic square e.g. 'e3'
  halfMoveClock: number;
  fullMoveNumber: number;
  fen: string;
  inCheck: boolean;
  isGameOver: boolean;
  winner: PieceColor | 'draw' | null;
  resultReason: GameResultReason | null;
  moveHistory: ChessMove[];
  positionHistory: string[]; // normalized FEN keys (board + turn + castling + ep)
  capturedByWhite: PieceType[]; // Black pieces captured by White
  capturedByBlack: PieceType[]; // White pieces captured by Black
}

export const INITIAL_FEN = 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1';

export const PIECE_VALUES: Record<PieceType, number> = {
  p: 1,
  n: 3,
  b: 3,
  r: 5,
  q: 9,
  k: 0,
};

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

export function squareToCoords(sq: string): [number, number] | null {
  if (!sq || sq.length !== 2) return null;
  const fileIdx = FILES.indexOf(sq[0]);
  const rankIdx = RANKS.indexOf(sq[1]);
  if (fileIdx === -1 || rankIdx === -1) return null;
  return [rankIdx, fileIdx];
}

export function coordsToSquare(rankIdx: number, fileIdx: number): string | null {
  if (rankIdx < 0 || rankIdx > 7 || fileIdx < 0 || fileIdx > 7) return null;
  return `${FILES[fileIdx]}${RANKS[rankIdx]}`;
}

export function oppositeColor(color: PieceColor): PieceColor {
  return color === 'w' ? 'b' : 'w';
}

export function cloneBoard(board: (Piece | null)[][]): (Piece | null)[][] {
  return board.map((row) => row.map((cell) => (cell ? { ...cell } : null)));
}

export function parseFen(fen: string): {
  board: (Piece | null)[][];
  turn: PieceColor;
  castling: CastlingRights;
  enPassantTarget: string | null;
  halfMoveClock: number;
  fullMoveNumber: number;
} {
  const parts = fen.trim().split(/\s+/);
  if (parts.length < 4) {
    throw new Error(`Invalid FEN string: ${fen}`);
  }
  const [boardPart, turnPart, castlingPart, epPart, halfMovePart, fullMovePart] = parts;
  const rows = boardPart.split('/');
  if (rows.length !== 8) {
    throw new Error(`Invalid FEN board rows: ${fen}`);
  }

  const board: (Piece | null)[][] = Array.from({ length: 8 }, () => Array(8).fill(null));
  for (let r = 0; r < 8; r++) {
    let f = 0;
    for (const ch of rows[r]) {
      if (ch >= '1' && ch <= '8') {
        f += parseInt(ch, 10);
      } else {
        const color: PieceColor = ch === ch.toUpperCase() ? 'w' : 'b';
        const type = ch.toLowerCase() as PieceType;
        if (!['p', 'n', 'b', 'r', 'q', 'k'].includes(type)) {
          throw new Error(`Invalid piece character in FEN: ${ch}`);
        }
        board[r][f] = { type, color };
        f++;
      }
    }
    if (f !== 8) {
      throw new Error(`Invalid FEN row width in row ${r}`);
    }
  }

  const turn: PieceColor = turnPart === 'b' ? 'b' : 'w';
  const castling: CastlingRights = {
    wK: castlingPart.includes('K'),
    wQ: castlingPart.includes('Q'),
    bK: castlingPart.includes('k'),
    bQ: castlingPart.includes('q'),
  };
  const enPassantTarget = epPart === '-' ? null : epPart;
  const halfMoveClock = halfMovePart ? Math.max(0, parseInt(halfMovePart, 10) || 0) : 0;
  const fullMoveNumber = fullMovePart ? Math.max(1, parseInt(fullMovePart, 10) || 1) : 1;

  return { board, turn, castling, enPassantTarget, halfMoveClock, fullMoveNumber };
}

export function generateFen(state: {
  board: (Piece | null)[][];
  turn: PieceColor;
  castling: CastlingRights;
  enPassantTarget: string | null;
  halfMoveClock: number;
  fullMoveNumber: number;
}): string {
  const rows: string[] = [];
  for (let r = 0; r < 8; r++) {
    let rowStr = '';
    let emptyCount = 0;
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f];
      if (!p) {
        emptyCount++;
      } else {
        if (emptyCount > 0) {
          rowStr += emptyCount;
          emptyCount = 0;
        }
        rowStr += p.color === 'w' ? p.type.toUpperCase() : p.type;
      }
    }
    if (emptyCount > 0) rowStr += emptyCount;
    rows.push(rowStr);
  }

  let castlingStr = '';
  if (state.castling.wK) castlingStr += 'K';
  if (state.castling.wQ) castlingStr += 'Q';
  if (state.castling.bK) castlingStr += 'k';
  if (state.castling.bQ) castlingStr += 'q';
  if (!castlingStr) castlingStr = '-';

  const epStr = state.enPassantTarget || '-';
  return `${rows.join('/')} ${state.turn} ${castlingStr} ${epStr} ${state.halfMoveClock} ${state.fullMoveNumber}`;
}

export function normalizePositionKey(fen: string): string {
  return fen.split(' ').slice(0, 4).join(' ');
}

export function findKingSquare(board: (Piece | null)[][], color: PieceColor): [number, number] | null {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p && p.color === color && p.type === 'k') {
        return [r, f];
      }
    }
  }
  return null;
}

/**
 * Checks if square (targetR, targetF) is attacked by any piece of `attackerColor`.
 */
export function isSquareAttacked(
  board: (Piece | null)[][],
  targetR: number,
  targetF: number,
  attackerColor: PieceColor
): boolean {
  // 1. Pawn attacks
  // If attacker is White, white pawns sit one rank BELOW target (higher rankIdx, since rank 8 is idx 0 and rank 1 is idx 7)
  const pawnSourceRank = attackerColor === 'w' ? targetR + 1 : targetR - 1;
  if (pawnSourceRank >= 0 && pawnSourceRank <= 7) {
    for (const df of [-1, 1]) {
      const pf = targetF + df;
      if (pf >= 0 && pf <= 7) {
        const p = board[pawnSourceRank][pf];
        if (p && p.color === attackerColor && p.type === 'p') return true;
      }
    }
  }

  // 2. Knight attacks
  const knightOffsets = [
    [-2, -1], [-2, 1], [-1, -2], [-1, 2],
    [1, -2], [1, 2], [2, -1], [2, 1],
  ];
  for (const [dr, df] of knightOffsets) {
    const nr = targetR + dr;
    const nf = targetF + df;
    if (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
      const p = board[nr][nf];
      if (p && p.color === attackerColor && p.type === 'n') return true;
    }
  }

  // 3. King attacks (adjacent squares)
  for (let dr = -1; dr <= 1; dr++) {
    for (let df = -1; df <= 1; df++) {
      if (dr === 0 && df === 0) continue;
      const kr = targetR + dr;
      const kf = targetF + df;
      if (kr >= 0 && kr <= 7 && kf >= 0 && kf <= 7) {
        const p = board[kr][kf];
        if (p && p.color === attackerColor && p.type === 'k') return true;
      }
    }
  }

  // 4. Orthogonal sliding (Rook / Queen)
  const orthoDirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dr, df] of orthoDirs) {
    let r = targetR + dr;
    let f = targetF + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const p = board[r][f];
      if (p) {
        if (p.color === attackerColor && (p.type === 'r' || p.type === 'q')) {
          return true;
        }
        break;
      }
      r += dr;
      f += df;
    }
  }

  // 5. Diagonal sliding (Bishop / Queen)
  const diagDirs = [[-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dr, df] of diagDirs) {
    let r = targetR + dr;
    let f = targetF + df;
    while (r >= 0 && r <= 7 && f >= 0 && f <= 7) {
      const p = board[r][f];
      if (p) {
        if (p.color === attackerColor && (p.type === 'b' || p.type === 'q')) {
          return true;
        }
        break;
      }
      r += dr;
      f += df;
    }
  }

  return false;
}

export function isKingInCheck(board: (Piece | null)[][], color: PieceColor): boolean {
  const kingCoords = findKingSquare(board, color);
  if (!kingCoords) return false;
  return isSquareAttacked(board, kingCoords[0], kingCoords[1], oppositeColor(color));
}

interface RawMoveCandidate {
  fromR: number;
  fromF: number;
  toR: number;
  toF: number;
  piece: PieceType;
  color: PieceColor;
  captured?: PieceType;
  promotion?: PieceType;
  isCastleKingside?: boolean;
  isCastleQueenside?: boolean;
  isEnPassant?: boolean;
}

function generatePseudoLegalMovesForSquare(
  board: (Piece | null)[][],
  turn: PieceColor,
  castling: CastlingRights,
  enPassantTarget: string | null,
  r: number,
  f: number
): RawMoveCandidate[] {
  const p = board[r][f];
  if (!p || p.color !== turn) return [];
  const moves: RawMoveCandidate[] = [];
  const enemy = oppositeColor(turn);

  if (p.type === 'p') {
    const dir = turn === 'w' ? -1 : 1;
    const startRank = turn === 'w' ? 6 : 1;
    const promoRank = turn === 'w' ? 0 : 7;

    // 1 step forward
    const nextR = r + dir;
    if (nextR >= 0 && nextR <= 7 && !board[nextR][f]) {
      if (nextR === promoRank) {
        for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) {
          moves.push({ fromR: r, fromF: f, toR: nextR, toF: f, piece: 'p', color: turn, promotion: promo });
        }
      } else {
        moves.push({ fromR: r, fromF: f, toR: nextR, toF: f, piece: 'p', color: turn });
        // 2 steps forward from start rank
        const doubleR = r + dir * 2;
        if (r === startRank && !board[doubleR][f]) {
          moves.push({ fromR: r, fromF: f, toR: doubleR, toF: f, piece: 'p', color: turn });
        }
      }
    }

    // Diagonal captures & en passant
    for (const df of [-1, 1]) {
      const capF = f + df;
      if (capF < 0 || capF > 7 || nextR < 0 || nextR > 7) continue;
      const targetPiece = board[nextR][capF];
      if (targetPiece && targetPiece.color === enemy) {
        if (nextR === promoRank) {
          for (const promo of ['q', 'r', 'b', 'n'] as PieceType[]) {
            moves.push({
              fromR: r,
              fromF: f,
              toR: nextR,
              toF: capF,
              piece: 'p',
              color: turn,
              captured: targetPiece.type,
              promotion: promo,
            });
          }
        } else {
          moves.push({
            fromR: r,
            fromF: f,
            toR: nextR,
            toF: capF,
            piece: 'p',
            color: turn,
            captured: targetPiece.type,
          });
        }
      } else if (enPassantTarget) {
        const epCoords = squareToCoords(enPassantTarget);
        if (epCoords && epCoords[0] === nextR && epCoords[1] === capF) {
          moves.push({
            fromR: r,
            fromF: f,
            toR: nextR,
            toF: capF,
            piece: 'p',
            color: turn,
            captured: 'p',
            isEnPassant: true,
          });
        }
      }
    }
  } else if (p.type === 'n') {
    const offsets = [
      [-2, -1], [-2, 1], [-1, -2], [-1, 2],
      [1, -2], [1, 2], [2, -1], [2, 1],
    ];
    for (const [dr, df] of offsets) {
      const nr = r + dr;
      const nf = f + df;
      if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
      const target = board[nr][nf];
      if (!target) {
        moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: 'n', color: turn });
      } else if (target.color === enemy) {
        moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: 'n', color: turn, captured: target.type });
      }
    }
  } else if (p.type === 'b' || p.type === 'r' || p.type === 'q') {
    const dirs: [number, number][] = [];
    if (p.type === 'b' || p.type === 'q') {
      dirs.push([-1, -1], [-1, 1], [1, -1], [1, 1]);
    }
    if (p.type === 'r' || p.type === 'q') {
      dirs.push([-1, 0], [1, 0], [0, -1], [0, 1]);
    }
    for (const [dr, df] of dirs) {
      let nr = r + dr;
      let nf = f + df;
      while (nr >= 0 && nr <= 7 && nf >= 0 && nf <= 7) {
        const target = board[nr][nf];
        if (!target) {
          moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: p.type, color: turn });
        } else {
          if (target.color === enemy) {
            moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: p.type, color: turn, captured: target.type });
          }
          break;
        }
        nr += dr;
        nf += df;
      }
    }
  } else if (p.type === 'k') {
    for (let dr = -1; dr <= 1; dr++) {
      for (let df = -1; df <= 1; df++) {
        if (dr === 0 && df === 0) continue;
        const nr = r + dr;
        const nf = f + df;
        if (nr < 0 || nr > 7 || nf < 0 || nf > 7) continue;
        const target = board[nr][nf];
        if (!target) {
          moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: 'k', color: turn });
        } else if (target.color === enemy) {
          moves.push({ fromR: r, fromF: f, toR: nr, toF: nf, piece: 'k', color: turn, captured: target.type });
        }
      }
    }

    // Castling
    const homeRank = turn === 'w' ? 7 : 0;
    if (r === homeRank && f === 4 && !isSquareAttacked(board, homeRank, 4, enemy)) {
      const canKingside = turn === 'w' ? castling.wK : castling.bK;
      const canQueenside = turn === 'w' ? castling.wQ : castling.bQ;

      // Kingside: f1/f8 (5) and g1/g8 (6) must be empty and not attacked; h1/h8 (7) must have own rook
      const krRook = board[homeRank][7];
      if (
        canKingside &&
        krRook &&
        krRook.color === turn &&
        krRook.type === 'r' &&
        !board[homeRank][5] &&
        !board[homeRank][6] &&
        !isSquareAttacked(board, homeRank, 5, enemy) &&
        !isSquareAttacked(board, homeRank, 6, enemy)
      ) {
        moves.push({
          fromR: homeRank,
          fromF: 4,
          toR: homeRank,
          toF: 6,
          piece: 'k',
          color: turn,
          isCastleKingside: true,
        });
      }

      // Queenside: d1/d8 (3), c1/c8 (2), b1/b8 (1) must be empty; d & c not attacked; a1/a8 (0) has own rook
      const qrRook = board[homeRank][0];
      if (
        canQueenside &&
        qrRook &&
        qrRook.color === turn &&
        qrRook.type === 'r' &&
        !board[homeRank][3] &&
        !board[homeRank][2] &&
        !board[homeRank][1] &&
        !isSquareAttacked(board, homeRank, 3, enemy) &&
        !isSquareAttacked(board, homeRank, 2, enemy)
      ) {
        moves.push({
          fromR: homeRank,
          fromF: 4,
          toR: homeRank,
          toF: 2,
          piece: 'k',
          color: turn,
          isCastleQueenside: true,
        });
      }
    }
  }

  return moves;
}

function applyRawMoveToBoard(board: (Piece | null)[][], m: RawMoveCandidate): (Piece | null)[][] {
  const next = cloneBoard(board);
  const movingPiece = next[m.fromR][m.fromF];
  next[m.fromR][m.fromF] = null;

  if (m.isEnPassant) {
    const capturedPawnRank = m.color === 'w' ? m.toR + 1 : m.toR - 1;
    next[capturedPawnRank][m.toF] = null;
  }

  if (m.isCastleKingside) {
    const rook = next[m.fromR][7];
    next[m.fromR][7] = null;
    next[m.fromR][5] = rook;
  } else if (m.isCastleQueenside) {
    const rook = next[m.fromR][0];
    next[m.fromR][0] = null;
    next[m.fromR][3] = rook;
  }

  next[m.toR][m.toF] = {
    type: m.promotion ? m.promotion : (movingPiece?.type || m.piece),
    color: m.color,
  };

  return next;
}

function computeNextStateAfterRawMove(
  state: {
    board: (Piece | null)[][];
    turn: PieceColor;
    castling: CastlingRights;
    enPassantTarget: string | null;
    halfMoveClock: number;
    fullMoveNumber: number;
  },
  m: RawMoveCandidate
) {
  const nextBoard = applyRawMoveToBoard(state.board, m);
  const nextTurn = oppositeColor(state.turn);
  const nextCastling: CastlingRights = { ...state.castling };

  // Update castling rights if king or rooks move or are captured
  if (m.piece === 'k') {
    if (m.color === 'w') {
      nextCastling.wK = false;
      nextCastling.wQ = false;
    } else {
      nextCastling.bK = false;
      nextCastling.bQ = false;
    }
  }
  if (m.fromR === 7 && m.fromF === 0) nextCastling.wQ = false;
  if (m.fromR === 7 && m.fromF === 7) nextCastling.wK = false;
  if (m.fromR === 0 && m.fromF === 0) nextCastling.bQ = false;
  if (m.fromR === 0 && m.fromF === 7) nextCastling.bK = false;

  if (m.toR === 7 && m.toF === 0) nextCastling.wQ = false;
  if (m.toR === 7 && m.toF === 7) nextCastling.wK = false;
  if (m.toR === 0 && m.toF === 0) nextCastling.bQ = false;
  if (m.toR === 0 && m.toF === 7) nextCastling.bK = false;

  // En passant target square on double pawn push
  let nextEp: string | null = null;
  if (m.piece === 'p' && Math.abs(m.toR - m.fromR) === 2) {
    const passedRank = (m.fromR + m.toR) / 2;
    nextEp = coordsToSquare(passedRank, m.fromF);
  }

  const nextHalfMove = m.piece === 'p' || m.captured ? 0 : state.halfMoveClock + 1;
  const nextFullMove = state.turn === 'b' ? state.fullMoveNumber + 1 : state.fullMoveNumber;

  const nextPartial = {
    board: nextBoard,
    turn: nextTurn,
    castling: nextCastling,
    enPassantTarget: nextEp,
    halfMoveClock: nextHalfMove,
    fullMoveNumber: nextFullMove,
  };

  const fenAfter = generateFen(nextPartial);
  const inCheckAfter = isKingInCheck(nextBoard, nextTurn);

  return {
    ...nextPartial,
    fenAfter,
    inCheckAfter,
  };
}

function getAllRawLegalMoves(state: {
  board: (Piece | null)[][];
  turn: PieceColor;
  castling: CastlingRights;
  enPassantTarget: string | null;
}): RawMoveCandidate[] {
  const legal: RawMoveCandidate[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f];
      if (!p || p.color !== state.turn) continue;
      const pseudo = generatePseudoLegalMovesForSquare(
        state.board,
        state.turn,
        state.castling,
        state.enPassantTarget,
        r,
        f
      );
      for (const m of pseudo) {
        const nextBoard = applyRawMoveToBoard(state.board, m);
        if (!isKingInCheck(nextBoard, state.turn)) {
          legal.push(m);
        }
      }
    }
  }
  return legal;
}

function formatSan(
  m: RawMoveCandidate,
  allLegalMoves: RawMoveCandidate[],
  inCheckAfter: boolean,
  hasOpponentLegalMovesAfter: boolean
): string {
  const suffix = inCheckAfter ? (hasOpponentLegalMovesAfter ? '+' : '#') : '';
  if (m.isCastleKingside) return `O-O${suffix}`;
  if (m.isCastleQueenside) return `O-O-O${suffix}`;

  const toSq = coordsToSquare(m.toR, m.toF)!;
  const fromSq = coordsToSquare(m.fromR, m.fromF)!;

  if (m.piece === 'p') {
    const prefix = m.captured ? `${fromSq[0]}x` : '';
    const promo = m.promotion ? `=${m.promotion.toUpperCase()}` : '';
    return `${prefix}${toSq}${promo}${suffix}`;
  }

  const pieceLetter = m.piece.toUpperCase();
  // Disambiguation: check if another piece of the same type and color can also move to the same target square
  const ambiguous = allLegalMoves.filter(
    (other) =>
      other !== m &&
      other.piece === m.piece &&
      other.toR === m.toR &&
      other.toF === m.toF &&
      (other.fromR !== m.fromR || other.fromF !== m.fromF)
  );

  let disambig = '';
  if (ambiguous.length > 0) {
    const sameFile = ambiguous.some((o) => o.fromF === m.fromF);
    const sameRank = ambiguous.some((o) => o.fromR === m.fromR);
    if (!sameFile) {
      disambig = fromSq[0];
    } else if (!sameRank) {
      disambig = fromSq[1];
    } else {
      disambig = fromSq;
    }
  }

  const captureStr = m.captured ? 'x' : '';
  return `${pieceLetter}${disambig}${captureStr}${toSq}${suffix}`;
}

export function isInsufficientMaterial(board: (Piece | null)[][]): boolean {
  const pieces: { type: PieceType; color: PieceColor; r: number; f: number }[] = [];
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = board[r][f];
      if (p) {
        if (p.type === 'p' || p.type === 'r' || p.type === 'q') return false;
        pieces.push({ type: p.type, color: p.color, r, f });
      }
    }
  }
  // K vs K
  if (pieces.length === 2) return true;
  // K+N vs K or K+B vs K
  if (pieces.length === 3) return true;
  // K+B vs K+B on same color square
  if (pieces.length === 4) {
    const bishops = pieces.filter((p) => p.type === 'b');
    if (bishops.length === 2 && bishops[0].color !== bishops[1].color) {
      const sqColor0 = (bishops[0].r + bishops[0].f) % 2;
      const sqColor1 = (bishops[1].r + bishops[1].f) % 2;
      if (sqColor0 === sqColor1) return true;
    }
  }
  return false;
}

export function createInitialGameState(fen: string = INITIAL_FEN): ChessGameState {
  const parsed = parseFen(fen);
  const fullFen = generateFen(parsed);
  const inCheck = isKingInCheck(parsed.board, parsed.turn);
  const rawMoves = getAllRawLegalMoves(parsed);
  let isGameOver = false;
  let winner: PieceColor | 'draw' | null = null;
  let resultReason: GameResultReason | null = null;

  if (rawMoves.length === 0) {
    isGameOver = true;
    if (inCheck) {
      winner = oppositeColor(parsed.turn);
      resultReason = 'checkmate';
    } else {
      winner = 'draw';
      resultReason = 'stalemate';
    }
  } else if (isInsufficientMaterial(parsed.board)) {
    isGameOver = true;
    winner = 'draw';
    resultReason = 'insufficient_material';
  }

  return {
    board: parsed.board,
    turn: parsed.turn,
    castling: parsed.castling,
    enPassantTarget: parsed.enPassantTarget,
    halfMoveClock: parsed.halfMoveClock,
    fullMoveNumber: parsed.fullMoveNumber,
    fen: fullFen,
    inCheck,
    isGameOver,
    winner,
    resultReason,
    moveHistory: [],
    positionHistory: [normalizePositionKey(fullFen)],
    capturedByWhite: [],
    capturedByBlack: [],
  };
}

export function getLegalMoves(state: ChessGameState, fromSquare?: string): ChessMove[] {
  if (state.isGameOver) return [];
  const allRaw = getAllRawLegalMoves(state);
  const filtered = fromSquare
    ? allRaw.filter((m) => coordsToSquare(m.fromR, m.fromF) === fromSquare)
    : allRaw;

  return filtered.map((m) => {
    const nextState = computeNextStateAfterRawMove(state, m);
    const opponentRawMoves = getAllRawLegalMoves(nextState);
    const san = formatSan(m, allRaw, nextState.inCheckAfter, opponentRawMoves.length > 0);
    return {
      from: coordsToSquare(m.fromR, m.fromF)!,
      to: coordsToSquare(m.toR, m.toF)!,
      piece: m.piece,
      color: m.color,
      captured: m.captured,
      promotion: m.promotion,
      isCastleKingside: m.isCastleKingside,
      isCastleQueenside: m.isCastleQueenside,
      isEnPassant: m.isEnPassant,
      san,
      fenAfter: nextState.fenAfter,
      inCheckAfter: nextState.inCheckAfter,
    };
  });
}

export function makeMove(
  state: ChessGameState,
  moveInput: { from: string; to: string; promotion?: PieceType }
): { nextState: ChessGameState; move: ChessMove } | null {
  if (state.isGameOver) return null;
  const legalMoves = getLegalMoves(state, moveInput.from);
  const matching = legalMoves.find((m) => {
    if (m.to !== moveInput.to) return false;
    if (m.promotion) {
      const wantedPromo = moveInput.promotion || 'q';
      return m.promotion === wantedPromo;
    }
    return true;
  });

  if (!matching) return null;

  const fromCoords = squareToCoords(matching.from)!;
  const toCoords = squareToCoords(matching.to)!;
  const rawCandidate: RawMoveCandidate = {
    fromR: fromCoords[0],
    fromF: fromCoords[1],
    toR: toCoords[0],
    toF: toCoords[1],
    piece: matching.piece,
    color: matching.color,
    captured: matching.captured,
    promotion: matching.promotion,
    isCastleKingside: matching.isCastleKingside,
    isCastleQueenside: matching.isCastleQueenside,
    isEnPassant: matching.isEnPassant,
  };

  const computed = computeNextStateAfterRawMove(state, rawCandidate);
  const posKey = normalizePositionKey(computed.fenAfter);
  const nextPositionHistory = [...state.positionHistory, posKey];

  const capturedByWhite = [...state.capturedByWhite];
  const capturedByBlack = [...state.capturedByBlack];
  if (matching.captured) {
    if (matching.color === 'w') {
      capturedByWhite.push(matching.captured);
    } else {
      capturedByBlack.push(matching.captured);
    }
  }

  const opponentMoves = getAllRawLegalMoves(computed);
  let isGameOver = false;
  let winner: PieceColor | 'draw' | null = null;
  let resultReason: GameResultReason | null = null;

  if (opponentMoves.length === 0) {
    isGameOver = true;
    if (computed.inCheckAfter) {
      winner = matching.color;
      resultReason = 'checkmate';
    } else {
      winner = 'draw';
      resultReason = 'stalemate';
    }
  } else if (isInsufficientMaterial(computed.board)) {
    isGameOver = true;
    winner = 'draw';
    resultReason = 'insufficient_material';
  } else if (computed.halfMoveClock >= 100) {
    isGameOver = true;
    winner = 'draw';
    resultReason = 'fifty_move_rule';
  } else {
    const repetitionCount = nextPositionHistory.filter((k) => k === posKey).length;
    if (repetitionCount >= 3) {
      isGameOver = true;
      winner = 'draw';
      resultReason = 'threefold_repetition';
    }
  }

  const moveWithTimestamp: ChessMove = {
    ...matching,
    timestamp: Date.now(),
  };

  const nextState: ChessGameState = {
    board: computed.board,
    turn: computed.turn,
    castling: computed.castling,
    enPassantTarget: computed.enPassantTarget,
    halfMoveClock: computed.halfMoveClock,
    fullMoveNumber: computed.fullMoveNumber,
    fen: computed.fenAfter,
    inCheck: computed.inCheckAfter,
    isGameOver,
    winner,
    resultReason,
    moveHistory: [...state.moveHistory, moveWithTimestamp],
    positionHistory: nextPositionHistory,
    capturedByWhite,
    capturedByBlack,
  };

  return { nextState, move: moveWithTimestamp };
}

/**
 * Calculates material balance and captured piece sorting.
 */
export function getMaterialSummary(state: ChessGameState): {
  whiteMaterial: number;
  blackMaterial: number;
  whiteAdvantage: number; // positive means White leads, negative means Black leads
} {
  let whiteMaterial = 0;
  let blackMaterial = 0;
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = state.board[r][f];
      if (!p || p.type === 'k') continue;
      if (p.color === 'w') whiteMaterial += PIECE_VALUES[p.type];
      else blackMaterial += PIECE_VALUES[p.type];
    }
  }
  return {
    whiteMaterial,
    blackMaterial,
    whiteAdvantage: whiteMaterial - blackMaterial,
  };
}

/**
 * Centipawn positional evaluation for the Post-Game Analysis Board.
 * Positive values favor White; negative values favor Black.
 */
const PAWN_PST = [
  [0,  0,  0,  0,  0,  0,  0,  0],
  [50, 50, 50, 50, 50, 50, 50, 50],
  [10, 10, 20, 30, 30, 20, 10, 10],
  [5,  5, 10, 25, 25, 10,  5,  5],
  [0,  0,  0, 20, 20,  0,  0,  0],
  [5, -5,-10,  0,  0,-10, -5,  5],
  [5, 10, 10,-20,-20, 10, 10,  5],
  [0,  0,  0,  0,  0,  0,  0,  0],
];

const KNIGHT_PST = [
  [-50,-40,-30,-30,-30,-30,-40,-50],
  [-40,-20,  0,  0,  0,  0,-20,-40],
  [-30,  0, 10, 15, 15, 10,  0,-30],
  [-30,  5, 15, 20, 20, 15,  5,-30],
  [-30,  0, 15, 20, 20, 15,  0,-30],
  [-30,  5, 10, 15, 15, 10,  5,-30],
  [-40,-20,  0,  5,  5,  0,-20,-40],
  [-50,-40,-30,-30,-30,-30,-40,-50],
];

const BISHOP_PST = [
  [-20,-10,-10,-10,-10,-10,-10,-20],
  [-10,  0,  0,  0,  0,  0,  0,-10],
  [-10,  0,  5, 10, 10,  5,  0,-10],
  [-10,  5,  5, 10, 10,  5,  5,-10],
  [-10,  0, 10, 10, 10, 10,  0,-10],
  [-10, 10, 10, 10, 10, 10, 10,-10],
  [-10,  5,  0,  0,  0,  0,  5,-10],
  [-20,-10,-10,-10,-10,-10,-10,-20],
];

export function evaluateFenPosition(fen: string): {
  centipawns: number;
  whiteWinPercent: number;
  displayScore: string;
} {
  const parsed = parseFen(fen);
  const rawMoves = getAllRawLegalMoves(parsed);
  const inCheck = isKingInCheck(parsed.board, parsed.turn);

  if (rawMoves.length === 0) {
    if (inCheck) {
      const mateScore = parsed.turn === 'w' ? -9999 : 9999;
      return {
        centipawns: mateScore,
        whiteWinPercent: parsed.turn === 'w' ? 0 : 100,
        displayScore: parsed.turn === 'w' ? '-M0' : '+M0',
      };
    }
    return { centipawns: 0, whiteWinPercent: 50, displayScore: '0.0' };
  }

  let score = 0;
  const cpValues: Record<PieceType, number> = {
    p: 100,
    n: 320,
    b: 330,
    r: 500,
    q: 900,
    k: 0,
  };

  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      const p = parsed.board[r][f];
      if (!p) continue;
      const tableRank = p.color === 'w' ? r : 7 - r;
      let positional = 0;
      if (p.type === 'p') positional = PAWN_PST[tableRank][f];
      else if (p.type === 'n') positional = KNIGHT_PST[tableRank][f];
      else if (p.type === 'b') positional = BISHOP_PST[tableRank][f];
      else if (p.type === 'q' || p.type === 'r') {
        if (tableRank >= 2 && tableRank <= 5 && f >= 2 && f <= 5) positional = 12;
      }

      const totalPieceVal = cpValues[p.type] + positional;
      if (p.color === 'w') score += totalPieceVal;
      else score -= totalPieceVal;
    }
  }

  if (inCheck) {
    score += parsed.turn === 'w' ? -35 : 35;
  }

  // Convert centipawns to win percentage via logistic curve
  const clamped = Math.max(-1500, Math.min(1500, score));
  const whiteWinPercent = Math.round(100 / (1 + Math.exp(-0.004 * clamped)));
  const pawns = score / 100;
  const displayScore = `${pawns > 0 ? '+' : ''}${pawns.toFixed(1)}`;

  return { centipawns: score, whiteWinPercent, displayScore };
}

/**
 * Standard ELO Rating calculation (K = 32)
 */
export function calculateEloDelta(
  whiteRating: number,
  blackRating: number,
  winner: PieceColor | 'draw'
): { whiteNew: number; blackNew: number; whiteDelta: number; blackDelta: number } {
  const K = 32;
  const expectedWhite = 1 / (1 + Math.pow(10, (blackRating - whiteRating) / 400));
  const expectedBlack = 1 - expectedWhite;

  const actualWhite = winner === 'w' ? 1 : winner === 'b' ? 0 : 0.5;
  const actualBlack = 1 - actualWhite;

  const whiteDelta = Math.round(K * (actualWhite - expectedWhite));
  const blackDelta = Math.round(K * (actualBlack - expectedBlack));

  return {
    whiteNew: Math.max(100, whiteRating + whiteDelta),
    blackNew: Math.max(100, blackRating + blackDelta),
    whiteDelta,
    blackDelta,
  };
}
