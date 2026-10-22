import React, { useEffect, useState } from 'react';
import { createInitialGameState, makeMove, ChessGameState } from '../chess/engine';
import { GrandmasterCrestSvg } from './ChessPieces';
import { ChessBoard } from './ChessBoard';

interface TitleScreenProps {
  onStart: () => void;
  onlineCount: number;
}

const SHOWCASE_MOVES: { from: string; to: string }[] = [
  { from: 'e2', to: 'e4' },
  { from: 'e7', to: 'e5' },
  { from: 'g1', to: 'f3' },
  { from: 'b8', to: 'c6' },
  { from: 'f1', to: 'c4' },
  { from: 'f8', to: 'c5' },
  { from: 'b2', to: 'b4' },
  { from: 'c5', to: 'b4' },
  { from: 'c2', to: 'c3' },
  { from: 'b4', to: 'a5' },
  { from: 'd2', to: 'd4' },
  { from: 'e5', to: 'd4' },
  { from: 'e1', to: 'g1' },
];

export const TitleScreen: React.FC<TitleScreenProps> = ({ onStart, onlineCount }) => {
  const [showcaseState, setShowcaseState] = useState<ChessGameState>(() => createInitialGameState());
  const [stepIdx, setStepIdx] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        if (document.activeElement instanceof HTMLElement) {
          document.activeElement.blur();
        }
        onStart();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onStart]);

  useEffect(() => {
    const timer = setInterval(() => {
      setStepIdx((prev) => {
        const next = prev + 1;
        if (next > SHOWCASE_MOVES.length) {
          setShowcaseState(createInitialGameState());
          return 0;
        }
        const m = SHOWCASE_MOVES[prev];
        if (m) {
          setShowcaseState((curr) => {
            const res = makeMove(curr, m);
            return res ? res.nextState : curr;
          });
        }
        return next;
      });
    }, 1400);
    return () => clearInterval(timer);
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex flex-col justify-between bg-[#090D16] text-slate-100 overflow-hidden select-none px-6 py-8 sm:px-14 sm:py-12">
      {/* Subtle radial arena spotlight */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_72%_46%,rgba(212,175,55,0.10),rgba(16,185,129,0.04)_42%,transparent_70%)]"
      />

      {/* Top quiet brand coordinate line */}
      <div className="relative z-10 flex items-center justify-between text-xs text-slate-400">
        <span className="font-mono tracking-wider text-amber-400/90">
          FIDE RULES ENGINE · SERVER-AUTHORITATIVE REAL-TIME ARENA
        </span>
        <span className="font-mono tabular-nums text-slate-300">
          {onlineCount} {onlineCount === 1 ? 'Contender' : 'Contenders'} Online
        </span>
      </div>

      {/* Main Asymmetric Split: Left Negative-Space Title Lockup, Right Live Interactive Centerpiece */}
      <div className="relative z-10 my-auto grid grid-cols-1 lg:grid-cols-12 gap-10 items-center max-w-7xl w-full mx-auto">
        <div className="lg:col-span-6 flex flex-col items-start text-left space-y-6">
          <div className="flex items-center gap-4">
            <GrandmasterCrestSvg className="w-16 h-16 sm:w-20 sm:h-20 shrink-0" />
            <div>
              <p className="text-xs font-mono tracking-widest text-amber-400">
                CHAMPIONSHIP MULTIPLAYER CHESS
              </p>
              <h1
                style={{ fontFamily: "'Cinzel', serif", textWrap: 'balance' }}
                className="text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-slate-50 leading-none mt-1"
              >
                Grandmaster Arena
              </h1>
            </div>
          </div>

          <p className="text-base sm:text-lg text-slate-300 max-w-xl leading-relaxed">
            Compete in real-time Bullet, Blitz, Rapid, and Classical matches with instant WebSocket synchronization, private room codes, live spectator broadcasting, and centipawn post-game analysis.
          </p>

          <div className="flex flex-wrap items-center gap-4 pt-2">
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onStart();
              }}
              className="px-8 py-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-base tracking-wide shadow-lg transition-transform duration-150 active:scale-95 cursor-pointer whitespace-nowrap shrink-0"
            >
              Enter Arena
            </button>
            <span className="text-xs font-mono text-slate-400">
              Press Enter or Space to start
            </span>
          </div>
        </div>

        {/* Interactive Centerpiece Showcase */}
        <div className="lg:col-span-6 flex flex-col items-center justify-center">
          <div className="w-full max-w-[400px] sm:max-w-[440px]">
            <ChessBoard
              gameState={showcaseState}
              perspective="w"
              interactive={true}
              allowedColor="both"
              onMove={(from, to, promotion) => {
                const res = makeMove(showcaseState, { from, to, promotion });
                if (res) setShowcaseState(res.nextState);
              }}
            />
            <div className="mt-2.5 flex items-center justify-between text-xs font-mono text-slate-400 px-1">
              <span>Live Interactive Preview · Evans Gambit</span>
              <span className="tabular-nums">Ply {stepIdx} / {SHOWCASE_MOVES.length}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Single flat borderless control-hint line in bottom safe margin */}
      <div className="relative z-10 text-center text-xs font-mono text-slate-400 tracking-wide">
        Click or Drag to Move · F Flip Board · Esc Pause Menu · M Mute Audio
      </div>
    </div>
  );
};
