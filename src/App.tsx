/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useState, useRef, useCallback } from 'react';
import {
  PlayerProfile,
  LobbySnapshotPayload,
  RoomStatePayload,
  ArchivedGameRecord,
  ClientWsMessage,
  ServerWsMessage,
  TIME_CONTROLS,
} from './chess/types';
import { PieceType } from './chess/engine';
import { soundFX } from './chess/audio';
import { TitleScreen } from './components/TitleScreen';
import { LobbyView } from './components/LobbyView';
import { MatchView } from './components/MatchView';
import { AnalysisView } from './components/AnalysisView';
import { GrandmasterCrestSvg } from './components/ChessPieces';
import {
  signInWithGooglePopup,
  syncUserProfileToFirestore,
  archiveCompletedGameToFirestore,
} from './firebase';
import { Volume2, VolumeX, Pause, Play, Home } from 'lucide-react';

type ShellState = 'title' | 'playing' | 'paused' | 'gameover';
type ArenaSubView = 'lobby' | 'match' | 'analysis';

const INITIAL_LOBBY: LobbySnapshotPayload = {
  onlineCount: 1,
  queueCounts: Object.fromEntries(TIME_CONTROLS.map((t) => [t.id, 0])),
  liveRooms: [],
  leaderboard: [],
  recentGames: [],
};

export default function App() {
  const [shellState, setShellState] = useState<ShellState>(() => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1' || params.get('room')) {
        return 'playing';
      }
    }
    return 'title';
  });

  const [subView, setSubView] = useState<ArenaSubView>('lobby');
  const [profile, setProfile] = useState<PlayerProfile | null>(null);
  const [token, setToken] = useState<string | null>(() =>
    typeof window !== 'undefined' ? window.localStorage.getItem('gm_arena_token') : null
  );
  const [lobby, setLobby] = useState<LobbySnapshotPayload>(INITIAL_LOBBY);
  const [inQueue, setInQueue] = useState(false);
  const [queuedTcId, setQueuedTcId] = useState<string | null>(null);
  const [activeRoom, setActiveRoom] = useState<RoomStatePayload | null>(null);
  const [roomRole, setRoomRole] = useState<'w' | 'b' | 'spectator'>('w');
  const [analysisGame, setAnalysisGame] = useState<ArchivedGameRecord | null>(null);
  const [muted, setMuted] = useState<boolean>(() => soundFX.isMuted());
  const [toastError, setToastError] = useState<string | null>(null);
  const [authError, setAuthError] = useState<string | null>(null);
  const [wsConnected, setWsConnected] = useState(false);

  const wsRef = useRef<WebSocket | null>(null);
  const activeRoomCodeRef = useRef<string | null>(null);
  const prevMoveCountRef = useRef<number>(0);
  const prevRoomStatusRef = useRef<string | null>(null);

  // Sync shell state to document.body.dataset.state
  useEffect(() => {
    const effectiveState: ShellState =
      shellState === 'paused'
        ? 'paused'
        : shellState === 'title'
        ? 'title'
        : subView === 'match' && activeRoom?.status === 'finished'
        ? 'gameover'
        : 'playing';
    document.body.dataset.state = effectiveState;
  }, [shellState, subView, activeRoom?.status]);

  // Clear any held keys on window blur
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement &&
        ['INPUT', 'TEXTAREA', 'SELECT'].includes(document.activeElement.tagName)
      ) {
        return;
      }
      if (e.key === 'Escape' || e.key.toLowerCase() === 'p') {
        if (shellState === 'playing') {
          setShellState('paused');
        } else if (shellState === 'paused') {
          setShellState('playing');
        }
      } else if (e.key.toLowerCase() === 'm') {
        const nextMuted = soundFX.toggleMute();
        setMuted(nextMuted);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [shellState]);

  const sendWsMessage = useCallback((msg: ClientWsMessage) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  }, []);

  // Bootstrap authentication session on mount
  useEffect(() => {
    let cancelled = false;
    async function bootstrapAuth() {
      try {
        const savedToken = window.localStorage.getItem('gm_arena_token');
        if (savedToken) {
          const meRes = await fetch('/api/auth/me', {
            headers: { Authorization: `Bearer ${savedToken}` },
          });
          if (meRes.ok) {
            const data = await meRes.json();
            if (!cancelled) {
              setToken(savedToken);
              setProfile(data.profile);
              return;
            }
          }
        }

        // Otherwise create an instant contender session
        const guestRes = await fetch('/api/auth/guest', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({}),
        });
        if (guestRes.ok) {
          const data = await guestRes.json();
          if (!cancelled) {
            window.localStorage.setItem('gm_arena_token', data.token);
            setToken(data.token);
            setProfile(data.profile);
          }
        }
      } catch (err) {
        console.error('Failed to bootstrap contender session:', err);
      }
    }

    bootstrapAuth();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch initial lobby snapshot via REST
  useEffect(() => {
    fetch('/api/lobby')
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data) setLobby(data);
      })
      .catch(() => {});
  }, []);

  // Connect WebSocket and handle real-time messages
  useEffect(() => {
    if (!token) return;
    let isUnmounted = false;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    function connect() {
      if (isUnmounted) return;
      const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const wsUrl = `${proto}//${window.location.host}/ws`;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        if (isUnmounted) return;
        setWsConnected(true);
        ws.send(JSON.stringify({ type: 'auth:identify', token }));
        if (activeRoomCodeRef.current) {
          ws.send(
            JSON.stringify({
              type: 'room:join',
              roomCode: activeRoomCodeRef.current,
            })
          );
        } else {
          const params = new URLSearchParams(window.location.search);
          const urlRoom = params.get('room');
          if (urlRoom) {
            ws.send(
              JSON.stringify({
                type: 'room:join',
                roomCode: urlRoom.toUpperCase(),
              })
            );
          }
        }
      };

      ws.onmessage = (event) => {
        let msg: ServerWsMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerWsMessage;
        } catch {
          return;
        }

        if (msg.type === 'auth:confirmed') {
          setProfile(msg.profile);
          syncUserProfileToFirestore({
            uid: msg.profile.id,
            displayName: msg.profile.username,
            rating: msg.profile.rating,
            wins: msg.profile.wins,
            losses: msg.profile.losses,
            draws: msg.profile.draws,
          }).catch(() => {});
        } else if (msg.type === 'lobby:update') {
          setLobby(msg.snapshot);
        } else if (msg.type === 'queue:status') {
          setInQueue(msg.inQueue);
          setQueuedTcId(msg.timeControlId);
        } else if (msg.type === 'room:joined') {
          activeRoomCodeRef.current = msg.room.roomCode;
          prevMoveCountRef.current = msg.room.gameState.moveHistory.length;
          prevRoomStatusRef.current = msg.room.status;
          setRoomRole(msg.role);
          setActiveRoom(msg.room);
          setSubView('match');
          if (msg.room.status === 'active') {
            soundFX.playGameStart();
          }
        } else if (msg.type === 'room:state') {
          const nextRoom = msg.room;
          const prevCount = prevMoveCountRef.current;
          const newCount = nextRoom.gameState.moveHistory.length;

          if (prevRoomStatusRef.current === 'waiting' && nextRoom.status === 'active') {
            soundFX.playGameStart();
          }

          if (newCount > prevCount) {
            const lastMove = nextRoom.gameState.moveHistory[newCount - 1];
            if (nextRoom.gameState.inCheck) {
              soundFX.playCheck();
            } else if (lastMove?.promotion) {
              soundFX.playPromote();
            } else if (lastMove?.isCastleKingside || lastMove?.isCastleQueenside) {
              soundFX.playCastle();
            } else if (lastMove?.captured) {
              soundFX.playCapture();
            } else {
              soundFX.playMove();
            }
          }

          if (prevRoomStatusRef.current !== 'finished' && nextRoom.status === 'finished') {
            if (nextRoom.gameState.winner === 'draw') {
              soundFX.playMove();
            } else {
              soundFX.playVictory();
            }
            if (nextRoom.white && nextRoom.black && nextRoom.gameState.winner) {
              archiveCompletedGameToFirestore({
                gameId: `gm_${nextRoom.roomCode}_${nextRoom.finishedAt || Date.now()}`,
                whiteName: nextRoom.white.username,
                blackName: nextRoom.black.username,
                whiteRating: nextRoom.white.rating,
                blackRating: nextRoom.black.rating,
                winner: nextRoom.gameState.winner,
                resultReason: nextRoom.gameState.resultReason || 'checkmate',
                timeControl: `${nextRoom.timeControl.label} ${nextRoom.timeControl.category}`,
                finalFen: nextRoom.gameState.fen,
                pgnMoves: nextRoom.gameState.moveHistory.map((m) => m.san).join(' '),
              }).catch(() => {});
            }
          }

          prevMoveCountRef.current = newCount;
          prevRoomStatusRef.current = nextRoom.status;
          setActiveRoom(nextRoom);
        } else if (msg.type === 'room:clock') {
          setActiveRoom((curr) => {
            if (!curr || curr.roomCode !== msg.roomCode) return curr;
            return {
              ...curr,
              whiteTimeMs: msg.whiteTimeMs,
              blackTimeMs: msg.blackTimeMs,
            };
          });
        } else if (msg.type === 'room:rematch_ready') {
          activeRoomCodeRef.current = msg.newRoomCode;
          prevMoveCountRef.current = 0;
          prevRoomStatusRef.current = 'active';
          setActiveRoom(msg.room);
          soundFX.playGameStart();
        } else if (msg.type === 'error') {
          setToastError(msg.message);
          setTimeout(() => setToastError(null), 4000);
        }
      };

      ws.onclose = () => {
        if (isUnmounted) return;
        setWsConnected(false);
        reconnectTimer = setTimeout(connect, 1500);
      };
    }

    connect();

    return () => {
      isUnmounted = true;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      if (wsRef.current) {
        wsRef.current.close();
      }
    };
  }, [token]);

  const handleLoginAccount = async (
    username: string,
    password: string,
    isRegister: boolean
  ): Promise<boolean> => {
    setAuthError(null);
    try {
      const endpoint = isRegister ? '/api/auth/register' : '/api/auth/login';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      const data = await res.json();
      if (!res.ok) {
        setAuthError(data.error || 'Authentication failed.');
        return false;
      }
      window.localStorage.setItem('gm_arena_token', data.token);
      setToken(data.token);
      setProfile(data.profile);
      sendWsMessage({ type: 'auth:identify', token: data.token });
      return true;
    } catch {
      setAuthError('Network error while authenticating.');
      return false;
    }
  };

  const handleUpdateDisplayName = async (newName: string): Promise<void> => {
    if (!token) return;
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ username: newName }),
      });
      if (res.ok) {
        const data = await res.json();
        setProfile(data.profile);
        sendWsMessage({ type: 'auth:identify', token });
      }
    } catch (err) {
      console.error('Failed to update display name:', err);
    }
  };

  const handleGoogleSignIn = async () => {
    try {
      const fbUser = await signInWithGooglePopup();
      if (!fbUser) return;
      const res = await fetch('/api/auth/firebase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uid: fbUser.uid,
          displayName: fbUser.displayName || fbUser.email?.split('@')[0] || 'Grandmaster',
        }),
      });
      if (res.ok) {
        const data = await res.json();
        window.localStorage.setItem('gm_arena_token', data.token);
        setToken(data.token);
        setProfile(data.profile);
        sendWsMessage({ type: 'auth:identify', token: data.token });
      }
    } catch {
      setToastError('Google sign-in popup was closed or blocked.');
      setTimeout(() => setToastError(null), 3500);
    }
  };

  return (
    <div className="min-h-screen w-full bg-[#090D16] text-slate-100 flex flex-col">
      {/* Title Screen Stage */}
      {shellState === 'title' && (
        <TitleScreen
          onStart={() => setShellState('playing')}
          onlineCount={lobby.onlineCount}
        />
      )}

      {/* Active Game Shell Perimeter Top Strip (No Website Navbar Chrome) */}
      {shellState !== 'title' && (
        <div className="w-full max-w-7xl mx-auto px-3 pt-3 pb-2 sm:px-6 flex items-center justify-between gap-2 border-b border-slate-800/80">
          <div className="flex items-center gap-2 sm:gap-3 min-w-0">
            <button
              type="button"
              onClick={() => {
                if (activeRoomCodeRef.current) {
                  sendWsMessage({
                    type: 'room:leave',
                    roomCode: activeRoomCodeRef.current,
                  });
                  activeRoomCodeRef.current = null;
                }
                setActiveRoom(null);
                setAnalysisGame(null);
                setSubView('lobby');
              }}
              className="flex items-center gap-2 text-left group cursor-pointer focus:outline-none min-w-0"
            >
              <GrandmasterCrestSvg className="w-7 h-7 sm:w-8 sm:h-8 shrink-0" />
              <span
                style={{ fontFamily: "'Cinzel', serif" }}
                className="text-sm sm:text-lg font-bold tracking-tight text-slate-100 group-hover:text-amber-400 transition-colors whitespace-nowrap truncate"
              >
                Grandmaster Arena
              </span>
            </button>
            <span className="hidden md:inline text-slate-700">·</span>
            <span className="hidden md:inline text-xs font-mono text-slate-400 whitespace-nowrap">
              {wsConnected ? 'Live Server Synced' : 'Reconnecting...'}
            </span>
          </div>

          {/* Right Perimeter Utility Controls: Mute [M], Pause [P], Lobby */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {subView !== 'lobby' && (
              <button
                type="button"
                onClick={() => {
                  if (activeRoomCodeRef.current) {
                    sendWsMessage({
                      type: 'room:leave',
                      roomCode: activeRoomCodeRef.current,
                    });
                    activeRoomCodeRef.current = null;
                  }
                  setActiveRoom(null);
                  setAnalysisGame(null);
                  setSubView('lobby');
                }}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Home className="w-3.5 h-3.5 shrink-0" />
                <span>Lobby</span>
              </button>
            )}

            <button
              type="button"
              tabIndex={-1}
              aria-label={muted ? 'Unmute Audio [M]' : 'Mute Audio [M]'}
              onClick={(e) => {
                e.currentTarget.blur();
                const next = soundFX.toggleMute();
                setMuted(next);
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              {muted ? <VolumeX className="w-4 h-4 text-slate-400" /> : <Volume2 className="w-4 h-4 text-amber-400" />}
            </button>

            <button
              type="button"
              tabIndex={-1}
              aria-label="Pause Menu [P]"
              onClick={(e) => {
                e.currentTarget.blur();
                setShellState((s) => (s === 'paused' ? 'playing' : 'paused'));
              }}
              className="w-8 h-8 flex items-center justify-center rounded-lg bg-slate-800/90 hover:bg-slate-700 text-slate-200 transition-colors cursor-pointer"
            >
              <Pause className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Toast Error Notification */}
      {toastError && (
        <div
          role="alert"
          className="fixed bottom-5 right-5 z-50 px-4 py-3 rounded-xl bg-red-950/95 border border-red-500/70 text-red-100 text-xs font-medium shadow-2xl"
        >
          {toastError}
        </div>
      )}

      {/* Main Game Shell Content */}
      {shellState !== 'title' && (
        <main className="flex-1 flex flex-col">
          {subView === 'lobby' && (
            <LobbyView
              profile={profile}
              lobby={lobby}
              inQueue={inQueue}
              queuedTimeControlId={queuedTcId}
              authError={authError}
              onJoinQueue={(tcId) => sendWsMessage({ type: 'queue:join', timeControlId: tcId })}
              onLeaveQueue={() => sendWsMessage({ type: 'queue:leave' })}
              onCreateRoom={(tcId, isPrivate, preferredColor) =>
                sendWsMessage({
                  type: 'room:create',
                  timeControlId: tcId,
                  isPrivate,
                  preferredColor,
                })
              }
              onJoinRoomByCode={(code) =>
                sendWsMessage({ type: 'room:join', roomCode: code })
              }
              onSpectateRoom={(code) =>
                sendWsMessage({ type: 'room:spectate', roomCode: code })
              }
              onOpenAnalysis={(game) => {
                setAnalysisGame(game);
                setSubView('analysis');
              }}
              onLoginAccount={handleLoginAccount}
              onUpdateDisplayName={handleUpdateDisplayName}
              onGoogleSignIn={handleGoogleSignIn}
            />
          )}

          {subView === 'match' && activeRoom && (
            <MatchView
              room={activeRoom}
              role={roomRole}
              currentUserId={profile?.id || ''}
              onMakeMove={(from, to, promotion: PieceType | undefined) =>
                sendWsMessage({
                  type: 'game:move',
                  roomCode: activeRoom.roomCode,
                  from,
                  to,
                  promotion,
                })
              }
              onResign={() =>
                sendWsMessage({ type: 'game:resign', roomCode: activeRoom.roomCode })
              }
              onOfferDraw={() =>
                sendWsMessage({ type: 'game:offer_draw', roomCode: activeRoom.roomCode })
              }
              onRespondDraw={(accept) =>
                sendWsMessage({
                  type: 'game:respond_draw',
                  roomCode: activeRoom.roomCode,
                  accept,
                })
              }
              onOfferRematch={() =>
                sendWsMessage({
                  type: 'game:offer_rematch',
                  roomCode: activeRoom.roomCode,
                })
              }
              onRespondRematch={(accept) =>
                sendWsMessage({
                  type: 'game:respond_rematch',
                  roomCode: activeRoom.roomCode,
                  accept,
                })
              }
              onOpenAnalysis={(game) => {
                setAnalysisGame(game);
                setSubView('analysis');
              }}
              onLeaveRoom={() => {
                sendWsMessage({ type: 'room:leave', roomCode: activeRoom.roomCode });
                activeRoomCodeRef.current = null;
                setActiveRoom(null);
                setSubView('lobby');
              }}
            />
          )}

          {subView === 'analysis' && analysisGame && (
            <AnalysisView
              game={analysisGame}
              onBackToLobby={() => {
                setAnalysisGame(null);
                setSubView(activeRoom ? 'match' : 'lobby');
              }}
            />
          )}
        </main>
      )}

      {/* Pause Modal Overlay */}
      {shellState === 'paused' && (
        <div
          role="dialog"
          aria-label="Game Paused"
          data-testid="pause-modal"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <div className="bg-[#131C31] border border-amber-400/40 rounded-xl p-6 max-w-sm w-full text-center shadow-2xl space-y-4">
            <GrandmasterCrestSvg className="w-12 h-12 mx-auto" />
            <div>
              <p className="text-xs font-mono tracking-widest text-amber-400">
                ARENA MENU
              </p>
              <h3
                style={{ fontFamily: "'Cinzel', serif" }}
                className="text-2xl font-bold text-slate-50 mt-0.5"
              >
                Arena Paused
              </h3>
            </div>

            <div className="grid grid-cols-2 gap-2 text-center text-xs font-mono">
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">CONTENDER ELO</span>
                <span className="text-sm font-bold tabular-nums text-amber-400">
                  {profile?.rating || 1200}
                </span>
              </div>
              <div className="p-2.5 rounded-lg bg-slate-900 border border-slate-800">
                <span className="text-slate-400 block text-[10px]">RECORD</span>
                <span className="text-sm font-bold tabular-nums text-slate-200">
                  {profile ? `${profile.wins}W-${profile.losses}L` : '0W-0L'}
                </span>
              </div>
            </div>

            <div className="space-y-2 pt-1">
              <button
                type="button"
                onClick={() => setShellState('playing')}
                className="w-full flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs tracking-wide cursor-pointer"
              >
                <Play className="w-3.5 h-3.5" />
                Resume Arena
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = soundFX.toggleMute();
                  setMuted(next);
                }}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs cursor-pointer"
              >
                {muted ? 'Audio: Muted (Click to Unmute)' : 'Audio: Active (Click to Mute)'}
              </button>

              {subView !== 'lobby' && (
                <button
                  type="button"
                  onClick={() => {
                    if (activeRoomCodeRef.current) {
                      sendWsMessage({
                        type: 'room:leave',
                        roomCode: activeRoomCodeRef.current,
                      });
                      activeRoomCodeRef.current = null;
                    }
                    setActiveRoom(null);
                    setAnalysisGame(null);
                    setSubView('lobby');
                    setShellState('playing');
                  }}
                  className="w-full py-2.5 px-4 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs cursor-pointer"
                >
                  Return to Lobby
                </button>
              )}

              <button
                type="button"
                onClick={() => setShellState('title')}
                className="w-full py-2.5 px-4 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-slate-200 font-medium text-xs cursor-pointer"
              >
                Title Screen
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
