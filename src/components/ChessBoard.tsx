import React, { useState, useMemo } from 'react';
import {
  ChessGameState,
  ChessMove,
  PieceColor,
  PieceType,
  getLegalMoves,
  coordsToSquare,
  findKingSquare,
} from '../chess/engine';
import { ChessPieceSvg } from './ChessPieces';

interface ChessBoardProps {
  gameState: ChessGameState;
  perspective: PieceColor; // 'w' = White at bottom, 'b' = Black at bottom
  interactive: boolean;
  allowedColor?: PieceColor | 'both';
  onMove: (from: string, to: string, promotion?: PieceType) => void;
  lastMove?: { from: string; to: string } | null;
}

const FILES = ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h'];
const RANKS = ['8', '7', '6', '5', '4', '3', '2', '1'];

const PIECE_NAMES: Record<PieceType, string> = {
  p: 'Pawn',
  n: 'Knight',
  b: 'Bishop',
  r: 'Rook',
  q: 'Queen',
  k: 'King',
};

export const ChessBoard: React.FC<ChessBoardProps> = ({
  gameState,
  perspective,
  interactive,
  allowedColor = 'both',
  onMove,
  lastMove,
}) => {
  const [selectedSquare, setSelectedSquare] = useState<string | null>(null);
  const [pendingPromotion, setPendingPromotion] = useState<{
    from: string;
    to: string;
    color: PieceColor;
  } | null>(null);
  const [draggedFrom, setDraggedFrom] = useState<string | null>(null);

  const canActNow = useMemo(() => {
    if (!interactive || gameState.isGameOver) return false;
    if (allowedColor === 'both') return true;
    return gameState.turn === allowedColor;
  }, [interactive, gameState.isGameOver, allowedColor, gameState.turn]);

  const legalMovesForSelected = useMemo<ChessMove[]>(() => {
    if (!selectedSquare || !canActNow) return [];
    return getLegalMoves(gameState, selectedSquare);
  }, [gameState, selectedSquare, canActNow]);

  const kingInCheckSquare = useMemo<string | null>(() => {
    if (!gameState.inCheck) return null;
    const coords = findKingSquare(gameState.board, gameState.turn);
    if (!coords) return null;
    return coordsToSquare(coords[0], coords[1]);
  }, [gameState.board, gameState.inCheck, gameState.turn]);

  const effectiveLastMove = useMemo(() => {
    if (lastMove !== undefined) return lastMove;
    const len = gameState.moveHistory.length;
    if (len === 0) return null;
    const last = gameState.moveHistory[len - 1];
    return { from: last.from, to: last.to };
  }, [lastMove, gameState.moveHistory]);

  const displayRankIndices = perspective === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];
  const displayFileIndices = perspective === 'w' ? [0, 1, 2, 3, 4, 5, 6, 7] : [7, 6, 5, 4, 3, 2, 1, 0];

  const attemptMove = (fromSq: string, toSq: string) => {
    const candidates = getLegalMoves(gameState, fromSq).filter((m) => m.to === toSq);
    if (candidates.length === 0) return false;

    if (candidates.some((m) => m.promotion)) {
      setPendingPromotion({ from: fromSq, to: toSq, color: gameState.turn });
      setSelectedSquare(null);
      return true;
    }

    onMove(fromSq, toSq);
    setSelectedSquare(null);
    return true;
  };

  const handleSquareClick = (sq: string, rIdx: number, fIdx: number) => {
    if (!canActNow) {
      setSelectedSquare(null);
      return;
    }

    if (selectedSquare) {
      if (selectedSquare === sq) {
        setSelectedSquare(null);
        return;
      }
      const moved = attemptMove(selectedSquare, sq);
      if (moved) return;
    }

    const piece = gameState.board[rIdx][fIdx];
    if (piece && piece.color === gameState.turn) {
      setSelectedSquare(sq);
    } else {
      setSelectedSquare(null);
    }
  };

  return (
    <div
      data-testid="chessboard-container"
      className="relative select-none aspect-square w-full max-w-[600px] rounded-xl p-2.5 bg-[#0D1322] border border-slate-800 shadow-2xl"
    >
      <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-lg overflow-hidden border border-slate-700/70">
        {displayRankIndices.map((rIdx, visualRow) =>
          displayFileIndices.map((fIdx, visualCol) => {
            const sq = coordsToSquare(rIdx, fIdx)!;
            const piece = gameState.board[rIdx][fIdx];
            const isLight = (rIdx + fIdx) % 2 === 0;
            const isSelected = selectedSquare === sq;
            const isLastMove =
              effectiveLastMove?.from === sq || effectiveLastMove?.to === sq;
            const isCheckSq = kingInCheckSquare === sq;
            const legalDest = legalMovesForSelected.find((m) => m.to === sq);
            const isLegalCapture = Boolean(
              legalDest && (piece || legalDest.isEnPassant)
            );

            // Board square palette: tournament warm ivory (#CBD5E1) and deep slate-emerald (#334E68)
            let bgClass = isLight ? 'bg-[#D6DEE7]' : 'bg-[#3B526B]';
            if (isSelected) {
              bgClass = isLight ? 'bg-[#FDE047]' : 'bg-[#EAB308]';
            } else if (isLastMove) {
              bgClass = isLight ? 'bg-[#FEF08A]/85' : 'bg-[#CA8A04]/75';
            }

            const showRankLabel = visualCol === 0;
            const showFileLabel = visualRow === 7;
            const coordColorClass = isLight ? 'text-[#243B53]' : 'text-[#D6DEE7]';

            const pieceDesc = piece
              ? `${piece.color === 'w' ? 'White' : 'Black'} ${PIECE_NAMES[piece.type]}`
              : 'empty';
            const legalDesc = legalDest ? ', legal move' : '';

            return (
              <button
                key={sq}
                type="button"
                data-square={sq}
                aria-label={`Square ${sq}, ${pieceDesc}${legalDesc}`}
                onClick={() => handleSquareClick(sq, rIdx, fIdx)}
                draggable={Boolean(canActNow && piece && piece.color === gameState.turn)}
                onDragStart={() => {
                  if (canActNow && piece && piece.color === gameState.turn) {
                    setDraggedFrom(sq);
                    setSelectedSquare(sq);
                  }
                }}
                onDragOver={(e) => {
                  e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  if (draggedFrom && draggedFrom !== sq) {
                    attemptMove(draggedFrom, sq);
                  }
                  setDraggedFrom(null);
                }}
                className={`relative flex items-center justify-center w-full h-full p-0 border-0 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400 transition-colors duration-100 ${bgClass} ${
                  canActNow && (piece?.color === gameState.turn || legalDest)
                    ? 'cursor-pointer'
                    : 'cursor-default'
                }`}
              >
                {/* Check danger highlight */}
                {isCheckSq && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 bg-red-600/75 ring-2 ring-inset ring-red-300"
                  />
                )}

                {/* Algebraic Rank Coordinate (top-left of leftmost file) */}
                {showRankLabel && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute top-0.5 left-1 text-[10px] sm:text-[11px] font-bold font-mono leading-none ${coordColorClass}`}
                  >
                    {RANKS[rIdx]}
                  </span>
                )}

                {/* Algebraic File Coordinate (bottom-right of bottom rank) */}
                {showFileLabel && (
                  <span
                    aria-hidden="true"
                    className={`pointer-events-none absolute bottom-0.5 right-1 text-[10px] sm:text-[11px] font-bold font-mono leading-none ${coordColorClass}`}
                  >
                    {FILES[fIdx]}
                  </span>
                )}

                {/* Chess Piece SVG */}
                {piece && (
                  <span className="relative z-10 w-[82%] h-[82%] pointer-events-none transition-transform duration-150">
                    <ChessPieceSvg type={piece.type} color={piece.color} />
                  </span>
                )}

                {/* Legal Move Indicators */}
                {legalDest && !isLegalCapture && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none relative z-20 w-3.5 h-3.5 sm:w-4 sm:h-4 rounded-full bg-emerald-950/45 ring-2 ring-emerald-400/80"
                  />
                )}
                {legalDest && isLegalCapture && (
                  <span
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-1 z-20 rounded-full border-[3.5px] border-emerald-400/90 shadow-sm"
                  />
                )}
              </button>
            );
          })
        )}
      </div>

      {/* Pawn Promotion Choice Overlay */}
      {pendingPromotion && (
        <div
          role="dialog"
          aria-label="Choose promotion piece"
          className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/80 rounded-xl p-4"
        >
          <div className="bg-[#131C31] border border-amber-500/40 rounded-xl p-4 shadow-2xl max-w-xs w-full text-center">
            <p className="text-xs font-semibold tracking-wider text-amber-400 mb-3">
              Promote Pawn To
            </p>
            <div className="grid grid-cols-4 gap-2">
              {(['q', 'r', 'b', 'n'] as PieceType[]).map((pt) => (
                <button
                  key={pt}
                  type="button"
                  aria-label={`Promote to ${PIECE_NAMES[pt]}`}
                  onClick={() => {
                    onMove(pendingPromotion.from, pendingPromotion.to, pt);
                    setPendingPromotion(null);
                  }}
                  className="flex flex-col items-center justify-center p-2 rounded-lg bg-slate-800/90 hover:bg-amber-500/20 border border-slate-700 hover:border-amber-400 transition-colors cursor-pointer"
                >
                  <div className="w-10 h-10">
                    <ChessPieceSvg type={pt} color={pendingPromotion.color} />
                  </div>
                  <span className="text-[11px] font-medium text-slate-200 mt-1">
                    {PIECE_NAMES[pt]}
                  </span>
                </button>
              ))}
            </div>
            <button
              type="button"
              onClick={() => setPendingPromotion(null)}
              className="mt-3 text-xs text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
