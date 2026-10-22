import React, { useState, useMemo, useEffect } from 'react';
import {
  ArchivedGameRecord,
} from '../chess/types';
import {
  ChessGameState,
  createInitialGameState,
  makeMove,
  evaluateFenPosition,
  getMaterialSummary,
  PieceColor,
  PieceType,
} from '../chess/engine';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieces';
import { soundFX } from '../chess/audio';
import {
  ChevronFirst,
  ChevronLeft,
  ChevronRight,
  ChevronLast,
  RotateCcw,
  ArrowLeft,
  FlipVertical2,
  Copy,
  Check,
} from 'lucide-react';

interface AnalysisViewProps {
  game: ArchivedGameRecord;
  onBackToLobby: () => void;
}

export const AnalysisView: React.FC<AnalysisViewProps> = ({ game, onBackToLobby }) => {
  const [perspective, setPerspective] = useState<PieceColor>('w');
  const [currentPly, setCurrentPly] = useState<number>(game.moves.length);
  const [variationState, setVariationState] = useState<ChessGameState | null>(null);
  const [copiedFen, setCopiedFen] = useState(false);

  // Precompute all historical game states from ply 0 to game.moves.length
  const timelineStates = useMemo<ChessGameState[]>(() => {
    const states: ChessGameState[] = [createInitialGameState()];
    let curr = states[0];
    for (const m of game.moves) {
      const res = makeMove(curr, { from: m.from, to: m.to, promotion: m.promotion });
      if (res) {
        curr = res.nextState;
        states.push(curr);
      } else {
        break;
      }
    }
    return states;
  }, [game.moves]);

  // Precompute evaluations for each ply to highlight key tactical swings
  const plyEvaluations = useMemo(() => {
    return timelineStates.map((st) => evaluateFenPosition(st.fen));
  }, [timelineStates]);

  const activeState = variationState || timelineStates[Math.min(currentPly, timelineStates.length - 1)];
  const currentEval = useMemo(() => evaluateFenPosition(activeState.fen), [activeState.fen]);
  const material = useMemo(() => getMaterialSummary(activeState), [activeState]);

  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        setVariationState(null);
        setCurrentPly((p) => Math.max(0, p - 1));
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        setVariationState(null);
        setCurrentPly((p) => Math.min(timelineStates.length - 1, p + 1));
      } else if (e.key === 'Home') {
        e.preventDefault();
        setVariationState(null);
        setCurrentPly(0);
      } else if (e.key === 'End') {
        e.preventDefault();
        setVariationState(null);
        setCurrentPly(timelineStates.length - 1);
      } else if (e.key.toLowerCase() === 'f') {
        setPerspective((prev) => (prev === 'w' ? 'b' : 'w'));
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [timelineStates.length]);

  const handleBoardMove = (from: string, to: string, promotion?: PieceType) => {
    const res = makeMove(activeState, { from, to, promotion });
    if (!res) return;
    if (res.move.captured) soundFX.playCapture();
    else soundFX.playMove();
    setVariationState(res.nextState);
  };

  // Group moves into pairs (1. e4 e5)
  const movePairs = useMemo(() => {
    const pairs: {
      moveNumber: number;
      white?: { san: string; ply: number; tag?: string };
      black?: { san: string; ply: number; tag?: string };
    }[] = [];

    const classifyPly = (ply: number): string | undefined => {
      if (ply < 1 || ply >= plyEvaluations.length) return undefined;
      const move = game.moves[ply - 1];
      if (!move) return undefined;
      if (move.san.includes('#')) return 'Checkmate';
      if (move.promotion) return 'Promotion';
      const prevCp = plyEvaluations[ply - 1].centipawns;
      const currCp = plyEvaluations[ply].centipawns;
      const deltaForMover = move.color === 'w' ? currCp - prevCp : prevCp - currCp;
      if (deltaForMover <= -220) return 'Blunder';
      if (deltaForMover <= -110) return 'Mistake';
      if (deltaForMover >= 150) return 'Tactical';
      return undefined;
    };

    for (let i = 0; i < game.moves.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: {
          san: game.moves[i].san,
          ply: i + 1,
          tag: classifyPly(i + 1),
        },
        black: game.moves[i + 1]
          ? {
              san: game.moves[i + 1].san,
              ply: i + 2,
              tag: classifyPly(i + 2),
            }
          : undefined,
      });
    }
    return pairs;
  }, [game.moves, plyEvaluations]);

  return (
    <div
      data-testid="analysis-view"
      className="w-full max-w-7xl mx-auto px-4 py-4 sm:px-6 flex flex-col gap-4"
    >
      {/* Top Analysis Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 pb-3 border-b border-slate-800">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onBackToLobby}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="w-3.5 h-3.5" />
            Back to Lobby
          </button>
          <div>
            <h2 className="text-base sm:text-lg font-bold text-slate-100">
              Post-Game Analysis Board
            </h2>
            <p className="text-xs text-slate-400 font-mono tabular-nums">
              {game.whiteName} ({game.whiteRatingAfter}) vs {game.blackName} ({game.blackRatingAfter}) · {game.timeControl.label} {game.timeControl.category} · Result: {game.winner === 'w' ? '1-0' : game.winner === 'b' ? '0-1' : '½-½'} ({game.resultReason})
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {variationState && (
            <button
              type="button"
              onClick={() => setVariationState(null)}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-amber-500/20 border border-amber-400/50 text-amber-300 text-xs font-medium hover:bg-amber-500/30 transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              Reset to Match Line
            </button>
          )}
          <button
            type="button"
            onClick={() => setPerspective((p) => (p === 'w' ? 'b' : 'w'))}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <FlipVertical2 className="w-3.5 h-3.5" />
            Flip Board
          </button>
          <button
            type="button"
            onClick={() => {
              navigator.clipboard?.writeText(activeState.fen);
              setCopiedFen(true);
              setTimeout(() => setCopiedFen(false), 1800);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            {copiedFen ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
            {copiedFen ? 'Copied FEN' : 'Copy FEN'}
          </button>
        </div>
      </div>

      {/* Main 12-Column Split: Eval Bar + Board (Left 7 cols) | Scrubber & Move Tree (Right 5 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        <div className="lg:col-span-7 flex items-stretch justify-center gap-3">
          {/* Vertical Positional Evaluation Gauge */}
          <div
            aria-label={`Position evaluation ${currentEval.displayScore}`}
            className="w-7 sm:w-8 rounded-lg overflow-hidden bg-slate-900 border border-slate-700 flex flex-col justify-between relative shrink-0"
          >
            <div
              className="w-full bg-slate-800 transition-all duration-200"
              style={{ height: `${100 - currentEval.whiteWinPercent}%` }}
            />
            <div
              className="w-full bg-slate-100 transition-all duration-200"
              style={{ height: `${currentEval.whiteWinPercent}%` }}
            />
            <span
              className={`absolute left-0 right-0 text-center text-[10px] font-mono font-bold tabular-nums ${
                currentEval.centipawns >= 0
                  ? 'bottom-1.5 text-slate-900'
                  : 'top-1.5 text-slate-100'
              }`}
            >
              {currentEval.displayScore}
            </span>
          </div>

          {/* Interactive Analysis Chessboard */}
          <div className="flex-1 max-w-[540px]">
            <ChessBoard
              gameState={activeState}
              perspective={perspective}
              interactive={true}
              allowedColor="both"
              onMove={handleBoardMove}
            />
          </div>
        </div>

        {/* Right Column: Position Telemetry, Scrubber Controls, and Move List */}
        <div className="lg:col-span-5 flex flex-col bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-4">
          {/* Evaluation & Material Summary Strip */}
          <div className="flex items-center justify-between pb-3 border-b border-slate-800">
            <div>
              <span className="text-xs text-slate-400 block">Engine Evaluation</span>
              <span className="text-xl font-bold font-mono tabular-nums text-amber-400">
                {currentEval.displayScore}
              </span>
              <span className="ml-2 text-xs text-slate-400 font-mono tabular-nums">
                ({currentEval.whiteWinPercent}% W / {100 - currentEval.whiteWinPercent}% B)
              </span>
            </div>
            <div className="text-right">
              <span className="text-xs text-slate-400 block">State</span>
              <span className="text-xs font-mono text-emerald-400">
                {variationState
                  ? 'Exploring Custom Variation'
                  : `Match Ply ${currentPly} of ${timelineStates.length - 1}`}
              </span>
            </div>
          </div>

          {/* Captured Pieces & Material Balance */}
          <div className="grid grid-cols-2 gap-3 text-xs">
            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span className="truncate">{game.whiteName} (W)</span>
                {material.whiteAdvantage > 0 && (
                  <span className="font-mono tabular-nums text-emerald-400">+{material.whiteAdvantage}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-0.5 min-h-[20px]">
                {activeState.capturedByWhite.map((p, idx) => (
                  <span key={idx} className="w-4 h-4 inline-block">
                    <ChessPieceSvg type={p} color="b" />
                  </span>
                ))}
              </div>
            </div>

            <div className="p-2.5 rounded-lg bg-slate-900/80 border border-slate-800/80">
              <div className="flex items-center justify-between text-slate-300 font-medium mb-1">
                <span className="truncate">{game.blackName} (B)</span>
                {material.whiteAdvantage < 0 && (
                  <span className="font-mono tabular-nums text-emerald-400">+{Math.abs(material.whiteAdvantage)}</span>
                )}
              </div>
              <div className="flex flex-wrap gap-0.5 min-h-[20px]">
                {activeState.capturedByBlack.map((p, idx) => (
                  <span key={idx} className="w-4 h-4 inline-block">
                    <ChessPieceSvg type={p} color="w" />
                  </span>
                ))}
              </div>
            </div>
          </div>

          {/* Replay Scrubber Controls */}
          <div className="grid grid-cols-4 gap-2">
            <button
              type="button"
              aria-label="First move"
              disabled={currentPly === 0 && !variationState}
              onClick={() => {
                setVariationState(null);
                setCurrentPly(0);
              }}
              className="flex items-center justify-center py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronFirst className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Previous move"
              disabled={currentPly === 0 && !variationState}
              onClick={() => {
                setVariationState(null);
                setCurrentPly((p) => Math.max(0, p - 1));
              }}
              className="flex items-center justify-center py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Next move"
              disabled={currentPly >= timelineStates.length - 1 && !variationState}
              onClick={() => {
                setVariationState(null);
                setCurrentPly((p) => Math.min(timelineStates.length - 1, p + 1));
              }}
              className="flex items-center justify-center py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              type="button"
              aria-label="Last move"
              disabled={currentPly >= timelineStates.length - 1 && !variationState}
              onClick={() => {
                setVariationState(null);
                setCurrentPly(timelineStates.length - 1);
              }}
              className="flex items-center justify-center py-2 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-40 text-slate-100 transition-colors cursor-pointer"
            >
              <ChevronLast className="w-4 h-4" />
            </button>
          </div>

          {/* Algebraic Move Table */}
          <div className="flex-1 max-h-[300px] overflow-y-auto rounded-lg bg-slate-950/60 border border-slate-800/80 divide-y divide-slate-800/50 font-mono text-xs">
            {movePairs.length === 0 ? (
              <div className="p-6 text-center text-slate-500">No moves recorded in this game.</div>
            ) : (
              movePairs.map((pair) => (
                <div key={pair.moveNumber} className="grid grid-cols-7 items-center px-3 py-1.5">
                  <span className="col-span-1 text-slate-500 tabular-nums">{pair.moveNumber}.</span>
                  <button
                    type="button"
                    onClick={() => {
                      setVariationState(null);
                      setCurrentPly(pair.white!.ply);
                    }}
                    className={`col-span-3 text-left px-2 py-1 rounded flex items-center justify-between transition-colors cursor-pointer ${
                      !variationState && currentPly === pair.white?.ply
                        ? 'bg-amber-400/20 text-amber-300 font-bold'
                        : 'text-slate-200 hover:bg-slate-800'
                    }`}
                  >
                    <span>{pair.white?.san}</span>
                    {pair.white?.tag && (
                      <span className="text-[10px] text-amber-400/90 font-normal">
                        {pair.white.tag}
                      </span>
                    )}
                  </button>
                  {pair.black ? (
                    <button
                      type="button"
                      onClick={() => {
                        setVariationState(null);
                        setCurrentPly(pair.black!.ply);
                      }}
                      className={`col-span-3 text-left px-2 py-1 rounded flex items-center justify-between transition-colors cursor-pointer ${
                        !variationState && currentPly === pair.black?.ply
                          ? 'bg-amber-400/20 text-amber-300 font-bold'
                          : 'text-slate-200 hover:bg-slate-800'
                      }`}
                    >
                      <span>{pair.black.san}</span>
                      {pair.black.tag && (
                        <span className="text-[10px] text-amber-400/90 font-normal">
                          {pair.black.tag}
                        </span>
                      )}
                    </button>
                  ) : (
                    <span className="col-span-3" />
                  )}
                </div>
              ))
            )}
          </div>

          <p className="text-[11px] text-slate-400">
            Tip: Click or drag any piece on the board above to test alternative variations from the current position.
          </p>
        </div>
      </div>
    </div>
  );
};
