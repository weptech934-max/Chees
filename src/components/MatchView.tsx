import React, { useState, useMemo } from 'react';
import {
  RoomStatePayload,
  ArchivedGameRecord,
} from '../chess/types';
import {
  PieceColor,
  PieceType,
  getMaterialSummary,
} from '../chess/engine';
import { ChessBoard } from './ChessBoard';
import { ChessPieceSvg } from './ChessPieces';
import {
  Copy,
  Check,
  FlipVertical2,
  Flag,
  Handshake,
  RotateCcw,
  Microscope,
  ArrowLeft,
  Eye,
  WifiOff,
} from 'lucide-react';

interface MatchViewProps {
  room: RoomStatePayload;
  role: 'w' | 'b' | 'spectator';
  currentUserId: string;
  onMakeMove: (from: string, to: string, promotion?: PieceType) => void;
  onResign: () => void;
  onOfferDraw: () => void;
  onRespondDraw: (accept: boolean) => void;
  onOfferRematch: () => void;
  onRespondRematch: (accept: boolean) => void;
  onOpenAnalysis: (game: ArchivedGameRecord) => void;
  onLeaveRoom: () => void;
}

export function formatClockMs(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalSeconds = Math.floor(clamped / 1000);
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  if (mins === 0 && totalSeconds < 20) {
    const tenths = Math.floor((clamped % 1000) / 100);
    return `0:${String(secs).padStart(2, '0')}.${tenths}`;
  }
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export const MatchView: React.FC<MatchViewProps> = ({
  room,
  role,
  onMakeMove,
  onResign,
  onOfferDraw,
  onRespondDraw,
  onOfferRematch,
  onRespondRematch,
  onOpenAnalysis,
  onLeaveRoom,
}) => {
  const [manualFlip, setManualFlip] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);
  const [confirmResign, setConfirmResign] = useState(false);
  const [dismissedModal, setDismissedModal] = useState(false);

  const basePerspective: PieceColor = role === 'b' ? 'b' : 'w';
  const perspective: PieceColor = manualFlip
    ? basePerspective === 'w'
      ? 'b'
      : 'w'
    : basePerspective;

  const material = useMemo(() => getMaterialSummary(room.gameState), [room.gameState]);

  const topColor: PieceColor = perspective === 'w' ? 'b' : 'w';
  const bottomColor: PieceColor = perspective;

  const topSeat = topColor === 'w' ? room.white : room.black;
  const bottomSeat = bottomColor === 'w' ? room.white : room.black;

  const topTimeMs = topColor === 'w' ? room.whiteTimeMs : room.blackTimeMs;
  const bottomTimeMs = bottomColor === 'w' ? room.whiteTimeMs : room.blackTimeMs;

  const topCaptured =
    topColor === 'w' ? room.gameState.capturedByWhite : room.gameState.capturedByBlack;
  const bottomCaptured =
    bottomColor === 'w' ? room.gameState.capturedByWhite : room.gameState.capturedByBlack;

  const topAdvantage =
    topColor === 'w'
      ? material.whiteAdvantage > 0
        ? material.whiteAdvantage
        : 0
      : material.whiteAdvantage < 0
      ? Math.abs(material.whiteAdvantage)
      : 0;

  const bottomAdvantage =
    bottomColor === 'w'
      ? material.whiteAdvantage > 0
        ? material.whiteAdvantage
        : 0
      : material.whiteAdvantage < 0
      ? Math.abs(material.whiteAdvantage)
      : 0;

  // Group moves into pairs
  const movePairs = useMemo(() => {
    const pairs: { moveNumber: number; white?: string; black?: string }[] = [];
    const hist = room.gameState.moveHistory;
    for (let i = 0; i < hist.length; i += 2) {
      pairs.push({
        moveNumber: Math.floor(i / 2) + 1,
        white: hist[i]?.san,
        black: hist[i + 1]?.san,
      });
    }
    return pairs;
  }, [room.gameState.moveHistory]);

  const isPlayer = role === 'w' || role === 'b';
  const opponentOfferedDraw =
    isPlayer && room.drawOfferedBy !== null && room.drawOfferedBy !== role;
  const iOfferedDraw = isPlayer && room.drawOfferedBy === role;

  const opponentOfferedRematch =
    isPlayer && room.rematchOfferedBy !== null && room.rematchOfferedBy !== role;
  const iOfferedRematch = isPlayer && room.rematchOfferedBy === role;

  const buildAnalysisRecord = (): ArchivedGameRecord => ({
    id: `analysis_${room.roomCode}`,
    roomCode: room.roomCode,
    whiteId: room.white?.id || 'white',
    whiteName: room.white?.username || 'White',
    whiteRatingBefore: room.white?.rating || 1200,
    whiteRatingAfter: room.white?.rating || 1200,
    blackId: room.black?.id || 'black',
    blackName: room.black?.username || 'Black',
    blackRatingBefore: room.black?.rating || 1200,
    blackRatingAfter: room.black?.rating || 1200,
    winner: room.gameState.winner || 'draw',
    resultReason: room.gameState.resultReason || 'finished',
    timeControl: room.timeControl,
    moves: room.gameState.moveHistory,
    finalFen: room.gameState.fen,
    finishedAt: new Date().toISOString(),
  });

  const renderPlayerBar = (
    color: PieceColor,
    seat: RoomStatePayload['white'],
    timeMs: number,
    captured: PieceType[],
    advantage: number
  ) => {
    const isTurn = room.status === 'active' && room.gameState.turn === color;
    const isLowTime = room.status === 'active' && timeMs < 20_000;

    return (
      <div
        data-testid={`player-bar-${color}`}
        className={`flex items-center justify-between gap-3 px-4 py-2.5 rounded-xl border transition-colors ${
          isTurn
            ? 'bg-[#15203B] border-amber-400/70 shadow-md'
            : 'bg-[#0F172A] border-slate-800'
        }`}
      >
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-3.5 h-3.5 rounded-sm shrink-0 border ${
              color === 'w'
                ? 'bg-slate-100 border-slate-400'
                : 'bg-slate-800 border-slate-500'
            }`}
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-semibold text-sm text-slate-100 truncate">
                {seat ? seat.username : 'Waiting for opponent...'}
              </span>
              {seat && (
                <span className="text-xs font-mono tabular-nums text-slate-400">
                  ({seat.rating}
                  {seat.ratingDelta !== undefined && (
                    <span
                      className={
                        seat.ratingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                      }
                    >
                      {' '}
                      {seat.ratingDelta >= 0 ? `+${seat.ratingDelta}` : seat.ratingDelta}
                    </span>
                  )}
                  )
                </span>
              )}
              {seat && !seat.connected && room.status === 'active' && (
                <span className="flex items-center gap-1 text-xs font-mono text-red-400">
                  <WifiOff className="w-3.5 h-3.5" />
                  Disconnected (60s grace)
                </span>
              )}
            </div>

            {/* Captured Pieces & Material Advantage */}
            <div className="flex items-center gap-1 min-h-[18px] mt-0.5">
              <div className="flex items-center -space-x-1">
                {captured.map((pt, i) => (
                  <span key={i} className="w-4 h-4 inline-block">
                    <ChessPieceSvg type={pt} color={color === 'w' ? 'b' : 'w'} />
                  </span>
                ))}
              </div>
              {advantage > 0 && (
                <span className="text-[11px] font-mono font-bold tabular-nums text-emerald-400 ml-1">
                  +{advantage}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Digital Chess Clock */}
        <div
          data-testid={`clock-${color}`}
          className={`px-3.5 py-1.5 rounded-lg font-mono text-lg sm:text-xl font-bold tabular-nums tracking-tight shrink-0 border ${
            isTurn
              ? isLowTime
                ? 'bg-red-950/90 text-red-200 border-red-500/80'
                : 'bg-amber-400 text-slate-950 border-amber-300'
              : 'bg-slate-900 text-slate-300 border-slate-800'
          }`}
        >
          {formatClockMs(timeMs)}
        </div>
      </div>
    );
  };

  return (
    <div
      data-testid="match-view"
      className="w-full max-w-7xl mx-auto px-4 py-3 sm:px-6 grid grid-cols-1 lg:grid-cols-12 gap-6 items-start"
    >
      {/* Left / Center Column: Top Player Bar + Interactive Chessboard + Bottom Player Bar */}
      <div className="lg:col-span-7 flex flex-col items-center justify-center space-y-3 w-full">
        <div className="w-full max-w-[600px]">
          {renderPlayerBar(topColor, topSeat, topTimeMs, topCaptured, topAdvantage)}
        </div>

        <div className="relative w-full flex justify-center">
          <ChessBoard
            gameState={room.gameState}
            perspective={perspective}
            interactive={room.status === 'active' && isPlayer}
            allowedColor={role === 'w' || role === 'b' ? role : undefined}
            onMove={onMakeMove}
          />

          {/* Waiting for Opponent Room Code Overlay */}
          {room.status === 'waiting' && (
            <div
              data-testid="waiting-room-overlay"
              className="absolute inset-0 z-20 flex items-center justify-center bg-slate-950/85 rounded-xl p-6"
            >
              <div className="bg-[#131C31] border border-amber-400/40 rounded-xl p-6 max-w-md w-full text-center shadow-2xl space-y-4">
                <p className="text-xs font-mono tracking-widest text-amber-400">
                  {room.isPrivate ? 'PRIVATE INVITE ROOM' : 'OPEN ARENA TABLE'} · {room.timeControl.label} {room.timeControl.category}
                </p>
                <h3 className="text-xl font-bold text-slate-100">
                  Waiting for Challenger to Join
                </h3>
                <p className="text-xs text-slate-300">
                  Share this room code with another player or open a second browser session and enter the code in the Lobby:
                </p>

                <div className="flex items-center justify-center gap-3 bg-slate-950 border border-slate-700 rounded-xl px-4 py-3">
                  <span
                    data-testid="room-code-display"
                    className="text-2xl sm:text-3xl font-mono font-bold tracking-widest text-amber-400 tabular-nums"
                  >
                    {room.roomCode}
                  </span>
                  <button
                    type="button"
                    aria-label="Copy Room Code"
                    onClick={() => {
                      navigator.clipboard?.writeText(room.roomCode);
                      setCopiedCode(true);
                      setTimeout(() => setCopiedCode(false), 1800);
                    }}
                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    {copiedCode ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-400" />
                        Copied
                      </>
                    ) : (
                      <>
                        <Copy className="w-3.5 h-3.5" />
                        Copy Code
                      </>
                    )}
                  </button>
                </div>

                <button
                  type="button"
                  onClick={onLeaveRoom}
                  className="text-xs text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Cancel and Return to Lobby
                </button>
              </div>
            </div>
          )}

          {/* Game Over Status Modal (Victory / Defeat / Draw) */}
          {room.status === 'finished' && !dismissedModal && (
            <div
              role="dialog"
              aria-label="Match Outcome"
              data-testid="gameover-modal"
              className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 rounded-xl p-6"
            >
              <div className="bg-[#131C31] border border-amber-400/50 rounded-xl p-6 max-w-md w-full text-center shadow-2xl space-y-5">
                <div>
                  <p className="text-xs font-mono tracking-widest text-amber-400 uppercase">
                    Match Complete · {room.gameState.resultReason?.replace(/_/g, ' ')}
                  </p>
                  <h3
                    style={{ fontFamily: "'Cinzel', serif" }}
                    className="text-2xl sm:text-3xl font-bold text-slate-50 mt-1"
                  >
                    {room.gameState.winner === 'draw'
                      ? 'Match Drawn'
                      : room.gameState.winner === 'w'
                      ? `${room.white?.username || 'White'} Wins`
                      : `${room.black?.username || 'Black'} Wins`}
                  </h3>
                </div>

                {/* Mastery / Match Stat Tiles */}
                <div className="grid grid-cols-3 gap-2.5 text-center">
                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 block">WHITE ELO</span>
                    <span className="text-sm font-mono font-bold tabular-nums text-slate-100">
                      {room.white?.rating || 1200}
                    </span>
                    {room.white?.ratingDelta !== undefined && (
                      <span
                        className={`block text-[11px] font-mono tabular-nums ${
                          room.white.ratingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {room.white.ratingDelta >= 0
                          ? `+${room.white.ratingDelta}`
                          : room.white.ratingDelta}
                      </span>
                    )}
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 block">MOVES</span>
                    <span className="text-sm font-mono font-bold tabular-nums text-amber-400">
                      {Math.ceil(room.gameState.moveHistory.length / 2)}
                    </span>
                    <span className="block text-[11px] font-mono tabular-nums text-slate-400">
                      {room.gameState.moveHistory.length} plies
                    </span>
                  </div>

                  <div className="p-2.5 rounded-lg bg-slate-900/90 border border-slate-800">
                    <span className="text-[10px] font-mono text-slate-400 block">BLACK ELO</span>
                    <span className="text-sm font-mono font-bold tabular-nums text-slate-100">
                      {room.black?.rating || 1200}
                    </span>
                    {room.black?.ratingDelta !== undefined && (
                      <span
                        className={`block text-[11px] font-mono tabular-nums ${
                          room.black.ratingDelta >= 0 ? 'text-emerald-400' : 'text-red-400'
                        }`}
                      >
                        {room.black.ratingDelta >= 0
                          ? `+${room.black.ratingDelta}`
                          : room.black.ratingDelta}
                      </span>
                    )}
                  </div>
                </div>

                {/* Rematch Offer / Response Controls */}
                {isPlayer && (
                  <div className="space-y-2">
                    {opponentOfferedRematch ? (
                      <div className="p-3 rounded-lg bg-emerald-950/60 border border-emerald-500/50 space-y-2">
                        <p className="text-xs text-emerald-200 font-medium">
                          Opponent challenged you to a Rematch!
                        </p>
                        <div className="flex items-center justify-center gap-2">
                          <button
                            type="button"
                            data-start="true"
                            onClick={() => onRespondRematch(true)}
                            className="px-4 py-2 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-colors cursor-pointer"
                          >
                            Accept Rematch
                          </button>
                          <button
                            type="button"
                            onClick={() => onRespondRematch(false)}
                            className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs transition-colors cursor-pointer"
                          >
                            Decline
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        data-start="true"
                        disabled={iOfferedRematch}
                        onClick={onOfferRematch}
                        className="w-full py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 disabled:opacity-60 text-slate-950 font-bold text-xs tracking-wide transition-colors cursor-pointer flex items-center justify-center gap-2"
                      >
                        <RotateCcw className="w-4 h-4" />
                        {iOfferedRematch ? 'Rematch Offer Sent (Waiting...)' : 'Request Rematch'}
                      </button>
                    )}
                  </div>
                )}

                <div className="grid grid-cols-2 gap-2.5 pt-1">
                  <button
                    type="button"
                    data-testid="open-analysis-btn"
                    onClick={() => onOpenAnalysis(buildAnalysisRecord())}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-100 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Microscope className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span>Analysis Board</span>
                  </button>
                  <button
                    type="button"
                    onClick={onLeaveRoom}
                    className="flex items-center justify-center gap-1.5 py-2.5 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
                    <span>Back to Lobby</span>
                  </button>
                </div>

                <button
                  type="button"
                  onClick={() => setDismissedModal(true)}
                  className="text-[11px] text-slate-400 hover:text-slate-200 underline cursor-pointer"
                >
                  Inspect Final Board
                </button>
              </div>
            </div>
          )}
        </div>

        <div className="w-full max-w-[600px]">
          {renderPlayerBar(bottomColor, bottomSeat, bottomTimeMs, bottomCaptured, bottomAdvantage)}
        </div>
      </div>

      {/* Right Column: Match Telemetry, Move History, Draw/Resign Dock */}
      <div className="lg:col-span-5 flex flex-col bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-4 w-full">
        {/* Room Header Info */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-800">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-mono font-bold text-amber-400">
                ROOM {room.roomCode}
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-mono text-slate-300">
                {room.timeControl.label} {room.timeControl.category}
              </span>
            </div>
            <p className="text-xs text-slate-400 mt-0.5">
              {role === 'spectator'
                ? 'Spectator Mode (Live Stream)'
                : `Playing as ${role === 'w' ? 'White' : 'Black'}`}
              {' · '}
              {room.status === 'active'
                ? `${room.gameState.turn === 'w' ? 'White' : 'Black'} to move${
                    room.gameState.inCheck ? ' (CHECK!)' : ''
                  }`
                : room.status === 'waiting'
                ? 'Awaiting opponent'
                : `Finished (${room.gameState.resultReason})`}
            </p>
          </div>

          <div className="flex items-center gap-1.5 text-xs font-mono tabular-nums text-slate-400">
            <Eye className="w-3.5 h-3.5 text-slate-400" />
            <span>{room.spectatorCount}</span>
          </div>
        </div>

        {/* Incoming Draw Offer Alert Banner */}
        {opponentOfferedDraw && (
          <div
            data-testid="draw-offer-banner"
            className="p-3 rounded-lg bg-amber-500/15 border border-amber-400/50 flex items-center justify-between gap-2"
          >
            <span className="text-xs font-medium text-amber-200">
              Opponent offered a draw.
            </span>
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => onRespondDraw(true)}
                className="px-3 py-1 rounded bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer"
              >
                Accept Draw
              </button>
              <button
                type="button"
                onClick={() => onRespondDraw(false)}
                className="px-2.5 py-1 rounded bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs cursor-pointer"
              >
                Decline
              </button>
            </div>
          </div>
        )}

        {/* Algebraic Move History List */}
        <div className="flex-1 min-h-[240px] max-h-[340px] overflow-y-auto rounded-lg bg-slate-950/70 border border-slate-800/80 divide-y divide-slate-800/40 font-mono text-xs">
          {movePairs.length === 0 ? (
            <div className="p-8 text-center text-slate-500">
              {room.status === 'waiting'
                ? 'Game will begin as soon as both seats are filled.'
                : 'Make the opening move on the chessboard.'}
            </div>
          ) : (
            movePairs.map((pair) => (
              <div
                key={pair.moveNumber}
                className="grid grid-cols-7 items-center px-3 py-1.5 hover:bg-slate-900/60"
              >
                <span className="col-span-1 text-slate-500 tabular-nums">
                  {pair.moveNumber}.
                </span>
                <span className="col-span-3 text-slate-200 font-medium">
                  {pair.white}
                </span>
                <span className="col-span-3 text-slate-300">
                  {pair.black || ''}
                </span>
              </div>
            ))
          )}
        </div>

        {/* Tactical Action Bar (Flip, Draw, Resign, Analysis, Lobby) */}
        <div className="space-y-2 pt-1">
          {room.status === 'active' && isPlayer && (
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => setManualFlip((f) => !f)}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <FlipVertical2 className="w-3.5 h-3.5" />
                Flip
              </button>

              <button
                type="button"
                disabled={iOfferedDraw || opponentOfferedDraw}
                onClick={onOfferDraw}
                className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 disabled:opacity-50 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
              >
                <Handshake className="w-3.5 h-3.5 text-amber-400" />
                {iOfferedDraw ? 'Draw Sent' : 'Offer Draw'}
              </button>

              {!confirmResign ? (
                <button
                  type="button"
                  onClick={() => setConfirmResign(true)}
                  className="flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-red-950/60 hover:bg-red-900/70 border border-red-800/60 text-red-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap"
                >
                  <Flag className="w-3.5 h-3.5" />
                  Resign
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setConfirmResign(false);
                    onResign();
                  }}
                  className="flex items-center justify-center gap-1 py-2 px-3 rounded-lg bg-red-600 hover:bg-red-500 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap"
                >
                  Confirm Resign
                </button>
              )}
            </div>
          )}

          {room.status !== 'active' && (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setManualFlip((f) => !f)}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                <FlipVertical2 className="w-3.5 h-3.5" />
                Flip Board
              </button>
              {room.status === 'finished' && (
                <button
                  type="button"
                  onClick={() => onOpenAnalysis(buildAnalysisRecord())}
                  className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold transition-colors cursor-pointer"
                >
                  <Microscope className="w-3.5 h-3.5" />
                  Analyze Game
                </button>
              )}
              <button
                type="button"
                onClick={onLeaveRoom}
                className="flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer"
              >
                <ArrowLeft className="w-3.5 h-3.5" />
                Lobby
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
