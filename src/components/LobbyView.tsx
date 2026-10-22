import React, { useState } from 'react';
import {
  TIME_CONTROLS,
  TimeCategory,
  PlayerProfile,
  LobbySnapshotPayload,
  ArchivedGameRecord,
} from '../chess/types';
import {
  Swords,
  Lock,
  Globe,
  Eye,
  Trophy,
  History,
  Microscope,
  UserCheck,
  LogIn,
  Loader2,
  X,
} from 'lucide-react';

interface LobbyViewProps {
  profile: PlayerProfile | null;
  lobby: LobbySnapshotPayload;
  inQueue: boolean;
  queuedTimeControlId: string | null;
  authError: string | null;
  onJoinQueue: (timeControlId: string) => void;
  onLeaveQueue: () => void;
  onCreateRoom: (timeControlId: string, isPrivate: boolean, preferredColor: 'w' | 'b' | 'random') => void;
  onJoinRoomByCode: (roomCode: string) => void;
  onSpectateRoom: (roomCode: string) => void;
  onOpenAnalysis: (game: ArchivedGameRecord) => void;
  onLoginAccount: (username: string, password: string, isRegister: boolean) => Promise<boolean>;
  onUpdateDisplayName: (newName: string) => Promise<void>;
  onGoogleSignIn: () => Promise<void>;
}

const CATEGORIES: TimeCategory[] = ['Bullet', 'Blitz', 'Rapid', 'Classical'];

export const LobbyView: React.FC<LobbyViewProps> = ({
  profile,
  lobby,
  inQueue,
  queuedTimeControlId,
  authError,
  onJoinQueue,
  onLeaveQueue,
  onCreateRoom,
  onJoinRoomByCode,
  onSpectateRoom,
  onOpenAnalysis,
  onLoginAccount,
  onUpdateDisplayName,
  onGoogleSignIn,
}) => {
  const [selectedTcId, setSelectedTcId] = useState<string>('rapid_10_0');
  const [categoryFilter, setCategoryFilter] = useState<TimeCategory | 'All'>('All');
  const [preferredColor, setPreferredColor] = useState<'w' | 'b' | 'random'>('w');
  const [roomCodeInput, setRoomCodeInput] = useState('');
  const [joinCodeError, setJoinCodeError] = useState<string | null>(null);

  // Account modal state
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [authMode, setAuthMode] = useState<'login' | 'register' | 'rename'>('rename');
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [localModalError, setLocalModalError] = useState<string | null>(null);

  const filteredTimeControls =
    categoryFilter === 'All'
      ? TIME_CONTROLS
      : TIME_CONTROLS.filter((tc) => tc.category === categoryFilter);

  const selectedTc =
    TIME_CONTROLS.find((tc) => tc.id === selectedTcId) || TIME_CONTROLS[5];

  const handleRoomCodeSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const cleaned = roomCodeInput.trim().toUpperCase();
    if (cleaned.length < 4) {
      setJoinCodeError('Enter a valid 6-character room code.');
      return;
    }
    setJoinCodeError(null);
    onJoinRoomByCode(cleaned);
  };

  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLocalModalError(null);
    if (authMode === 'rename') {
      if (usernameInput.trim().length < 2) {
        setLocalModalError('Name must be at least 2 characters.');
        return;
      }
      await onUpdateDisplayName(usernameInput.trim());
      setShowAccountModal(false);
      return;
    }
    if (usernameInput.trim().length < 2 || passwordInput.length < 3) {
      setLocalModalError('Enter a username (2+ chars) and password (3+ chars).');
      return;
    }
    const ok = await onLoginAccount(
      usernameInput.trim(),
      passwordInput,
      authMode === 'register'
    );
    if (ok) {
      setShowAccountModal(false);
      setPasswordInput('');
    }
  };

  return (
    <div
      data-testid="lobby-view"
      className="w-full max-w-7xl mx-auto px-4 py-5 sm:px-6 space-y-6"
    >
      {/* Contender Profile & Quick Room Code Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-stretch">
        {/* Contender Stats Panel */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2.5">
              <span className="text-xs font-mono text-amber-400 tracking-wider">
                CONTENDER PROFILE
              </span>
              <span className="text-slate-600">·</span>
              <span className="text-xs font-mono tabular-nums text-emerald-400">
                {lobby.onlineCount} Online in Arena
              </span>
            </div>
            <div className="flex items-baseline gap-3">
              <h2
                data-testid="profile-username"
                className="text-xl sm:text-2xl font-bold text-slate-50"
              >
                {profile ? profile.username : 'Initializing...'}
              </h2>
              <span
                data-testid="profile-rating"
                className="text-sm font-mono font-bold tabular-nums text-amber-400"
              >
                {profile ? profile.rating : 1200} ELO
              </span>
            </div>
            {profile && (
              <p className="text-xs font-mono tabular-nums text-slate-400">
                {profile.wins}W · {profile.losses}L · {profile.draws}D ·{' '}
                {profile.wins + profile.losses + profile.draws > 0
                  ? `${Math.round(
                      (profile.wins /
                        (profile.wins + profile.losses + profile.draws)) *
                        100
                    )}% Win Rate`
                  : 'Unranked Calibration'}
              </p>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                setUsernameInput(profile?.username || '');
                setAuthMode('rename');
                setLocalModalError(null);
                setShowAccountModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <UserCheck className="w-3.5 h-3.5 text-amber-400" />
              Account / Name
            </button>
            <button
              type="button"
              onClick={onGoogleSignIn}
              className="flex items-center gap-1.5 px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <LogIn className="w-3.5 h-3.5 text-emerald-400" />
              Google Sync
            </button>
          </div>
        </div>

        {/* Join Private Room by Code Panel */}
        <form
          onSubmit={handleRoomCodeSubmit}
          className="lg:col-span-5 bg-[#111827] border border-slate-800 rounded-xl p-4 sm:p-5 flex flex-col justify-between gap-3"
        >
          <div>
            <label
              htmlFor="room-code-input"
              className="block text-xs font-mono text-amber-400 tracking-wider"
            >
              JOIN PRIVATE ROOM BY CODE
            </label>
            <p className="text-xs text-slate-400 mt-0.5">
              Enter a 6-character invite code shared by a friend to start immediately.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <input
              id="room-code-input"
              type="text"
              maxLength={8}
              value={roomCodeInput}
              onChange={(e) => {
                setRoomCodeInput(e.target.value.toUpperCase());
                if (joinCodeError) setJoinCodeError(null);
              }}
              placeholder="e.g. GM7K2P"
              className="flex-1 px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 font-mono text-sm uppercase tracking-widest placeholder:text-slate-600 focus:outline-none focus:border-amber-400"
            />
            <button
              type="submit"
              className="px-4 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              Join Room
            </button>
          </div>
          {joinCodeError && (
            <p className="text-xs text-red-400 font-medium">{joinCodeError}</p>
          )}
        </form>
      </div>

      {/* Main 12-Column Arena Grid: Left 7 Cols (Time Controls + Matchmaking + Create Room) | Right 5 Cols (Live Rooms + Leaderboard + Recent Games) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left 7 Columns: Time Control Selection & Match Launchers */}
        <div className="lg:col-span-7 bg-[#111827] border border-slate-800 rounded-xl p-5 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-slate-800">
            <div>
              <h3 className="text-base font-bold text-slate-100">
                Select Time Control & Launch Match
              </h3>
              <p className="text-xs text-slate-400">
                Choose Bullet, Blitz, Rapid, or Classical cadence for matchmaking or private rooms.
              </p>
            </div>

            {/* Interactive Category Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
              {(['All', ...CATEGORIES] as const).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setCategoryFilter(cat)}
                  className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                    categoryFilter === cat
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Time Control Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
            {filteredTimeControls.map((tc) => {
              const isSelected = tc.id === selectedTcId;
              const qCount = lobby.queueCounts[tc.id] || 0;
              return (
                <button
                  key={tc.id}
                  type="button"
                  data-testid={`tc-${tc.id}`}
                  onClick={() => setSelectedTcId(tc.id)}
                  className={`flex flex-col items-start justify-between p-3.5 rounded-xl border text-left transition-all cursor-pointer ${
                    isSelected
                      ? 'bg-[#172340] border-amber-400 shadow-md'
                      : 'bg-slate-900/75 border-slate-800/90 hover:border-slate-700'
                  }`}
                >
                  <div className="w-full flex items-center justify-between">
                    <span className="text-lg font-mono font-bold tabular-nums text-slate-100">
                      {tc.label}
                    </span>
                    <span className="text-[11px] font-mono text-amber-400/90">
                      {tc.category}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-400 mt-1.5 line-clamp-1">
                    {tc.description}
                  </p>
                  {qCount > 0 && (
                    <span className="mt-2 text-[10px] font-mono tabular-nums text-emerald-400">
                      {qCount} waiting in queue
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          {/* Color Preference for Room Creation */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-800/80">
            <span className="text-xs text-slate-300 font-medium">
              Room Host Piece Color:
            </span>
            <div className="flex items-center gap-1.5 p-1 bg-slate-900 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'w', label: 'White' },
                  { id: 'random', label: 'Random' },
                  { id: 'b', label: 'Black' },
                ] as const
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setPreferredColor(opt.id)}
                  className={`px-3 py-1 rounded text-xs font-medium transition-colors cursor-pointer whitespace-nowrap ${
                    preferredColor === opt.id
                      ? 'bg-slate-700 text-slate-100'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
            </div>
          </div>

          {/* Primary Matchmaking & Room Creation Actions */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
            {inQueue ? (
              <button
                type="button"
                data-testid="cancel-queue-btn"
                onClick={onLeaveQueue}
                className="sm:col-span-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap"
              >
                <Loader2 className="w-4 h-4 animate-spin" />
                Searching ({TIME_CONTROLS.find((t) => t.id === queuedTimeControlId)?.label}) · Cancel
              </button>
            ) : (
              <button
                type="button"
                data-testid="find-match-btn"
                onClick={() => onJoinQueue(selectedTc.id)}
                className="sm:col-span-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs tracking-wide transition-colors cursor-pointer whitespace-nowrap"
              >
                <Swords className="w-4 h-4" />
                Find Opponent ({selectedTc.label})
              </button>
            )}

            <button
              type="button"
              data-testid="create-private-room-btn"
              onClick={() => onCreateRoom(selectedTc.id, true, preferredColor)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Lock className="w-3.5 h-3.5 text-amber-400" />
              Create Private Room
            </button>

            <button
              type="button"
              data-testid="create-public-room-btn"
              onClick={() => onCreateRoom(selectedTc.id, false, preferredColor)}
              className="flex items-center justify-center gap-2 py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-100 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap"
            >
              <Globe className="w-3.5 h-3.5 text-emerald-400" />
              Create Open Table
            </button>
          </div>
        </div>

        {/* Right 5 Columns: Live Rooms / Spectate + Leaderboard + Match History */}
        <div className="lg:col-span-5 space-y-5">
          {/* Live Arena Tables & Spectator Feed */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Eye className="w-4 h-4 text-emerald-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Live Arena Tables & Spectator Broadcast
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {lobby.liveRooms.length} Active
              </span>
            </div>

            {lobby.liveRooms.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                No public tables currently underway. Create an Open Table or start Matchmaking to play!
              </p>
            ) : (
              <div className="space-y-2 max-h-[210px] overflow-y-auto">
                {lobby.liveRooms.map((rm) => (
                  <div
                    key={rm.roomCode}
                    className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs"
                  >
                    <div className="min-w-0">
                      <div className="font-medium text-slate-200 truncate">
                        {rm.whiteName} ({rm.whiteRating}){' '}
                        <span className="text-slate-500">vs</span>{' '}
                        {rm.blackName ? `${rm.blackName} (${rm.blackRating})` : 'Waiting for Challenger...'}
                      </div>
                      <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                        Room {rm.roomCode} · {rm.timeControl.label} {rm.timeControl.category} ·{' '}
                        {rm.status === 'waiting'
                          ? 'Open Seat'
                          : `${rm.moveCount} plies · ${rm.spectatorCount} watching`}
                      </div>
                    </div>

                    {rm.status === 'waiting' ? (
                      <button
                        type="button"
                        onClick={() => onJoinRoomByCode(rm.roomCode)}
                        className="px-3 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        Join Seat
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => onSpectateRoom(rm.roomCode)}
                        className="flex items-center gap-1 px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <Eye className="w-3.5 h-3.5 text-amber-400" />
                        Spectate
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Leaderboard */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <Trophy className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Grandmaster Standings
                </h3>
              </div>
              <span className="text-xs font-mono text-slate-400">ELO Rating</span>
            </div>

            <div className="divide-y divide-slate-800/60 max-h-[190px] overflow-y-auto text-xs">
              {lobby.leaderboard.slice(0, 8).map((u, idx) => (
                <div
                  key={u.id}
                  className="flex items-center justify-between py-2 px-1"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-5 font-mono tabular-nums text-slate-500">
                      {String(idx + 1).padStart(2, '0')}.
                    </span>
                    <span className="font-medium text-slate-200 truncate">
                      {u.username}
                    </span>
                  </div>
                  <div className="flex items-center gap-3 font-mono tabular-nums shrink-0">
                    <span className="text-slate-400 text-[11px]">
                      {u.wins}W/{u.losses}L/{u.draws}D
                    </span>
                    <span className="font-bold text-amber-400 w-12 text-right">
                      {u.rating}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Archived Match History & Post-Game Analysis Launcher */}
          <div className="bg-[#111827] border border-slate-800 rounded-xl p-4 space-y-3">
            <div className="flex items-center justify-between pb-2 border-b border-slate-800">
              <div className="flex items-center gap-2">
                <History className="w-4 h-4 text-amber-400" />
                <h3 className="text-sm font-bold text-slate-100">
                  Recent Database Games & Analysis
                </h3>
              </div>
              <span className="text-xs font-mono tabular-nums text-slate-400">
                {lobby.recentGames.length} Archived
              </span>
            </div>

            <div className="space-y-2 max-h-[210px] overflow-y-auto">
              {lobby.recentGames.map((g) => (
                <div
                  key={g.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-slate-900/90 border border-slate-800 text-xs"
                >
                  <div className="min-w-0">
                    <div className="font-medium text-slate-200 truncate">
                      {g.whiteName} ({g.whiteRatingAfter}) vs {g.blackName} ({g.blackRatingAfter})
                    </div>
                    <div className="text-[11px] font-mono tabular-nums text-slate-400 mt-0.5">
                      {g.winner === 'w' ? '1-0' : g.winner === 'b' ? '0-1' : '½-½'} · {g.resultReason} · {g.timeControl.label} · {g.moves.length} plies
                    </div>
                  </div>
                  <button
                    type="button"
                    aria-label={`Analyze ${g.whiteName} vs ${g.blackName}`}
                    onClick={() => onOpenAnalysis(g)}
                    className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-800 hover:bg-amber-400 hover:text-slate-950 text-slate-200 font-semibold text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Microscope className="w-3.5 h-3.5" />
                    Analyze
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Account Login / Register / Rename Modal */}
      {showAccountModal && (
        <div
          role="dialog"
          aria-label="Contender Account Settings"
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/85 p-4"
        >
          <div className="bg-[#131C31] border border-slate-700 rounded-xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-100">
                Contender Account & Identity
              </h3>
              <button
                type="button"
                aria-label="Close Account Modal"
                onClick={() => setShowAccountModal(false)}
                className="text-slate-400 hover:text-slate-200 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="flex items-center gap-1 p-1 bg-slate-900 rounded-lg border border-slate-800">
              {(
                [
                  { id: 'rename', label: 'Update Name' },
                  { id: 'login', label: 'Sign In' },
                  { id: 'register', label: 'Register Account' },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => {
                    setAuthMode(tab.id);
                    setLocalModalError(null);
                  }}
                  className={`flex-1 py-1.5 rounded text-xs font-medium transition-colors cursor-pointer ${
                    authMode === tab.id
                      ? 'bg-amber-400 text-slate-950 font-bold'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            <form onSubmit={handleAccountSubmit} className="space-y-3">
              <div>
                <label
                  htmlFor="account-username"
                  className="block text-xs font-medium text-slate-300 mb-1"
                >
                  Contender Username
                </label>
                <input
                  id="account-username"
                  type="text"
                  value={usernameInput}
                  onChange={(e) => setUsernameInput(e.target.value)}
                  placeholder="Enter contender handle"
                  className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                />
              </div>

              {authMode !== 'rename' && (
                <div>
                  <label
                    htmlFor="account-password"
                    className="block text-xs font-medium text-slate-300 mb-1"
                  >
                    Password
                  </label>
                  <input
                    id="account-password"
                    type="password"
                    value={passwordInput}
                    onChange={(e) => setPasswordInput(e.target.value)}
                    placeholder="Enter password"
                    className="w-full px-3.5 py-2 rounded-lg bg-slate-950 border border-slate-700 text-slate-100 text-sm focus:outline-none focus:border-amber-400"
                  />
                </div>
              )}

              {(localModalError || authError) && (
                <p className="text-xs text-red-400">
                  {localModalError || authError}
                </p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAccountModal(false)}
                  className="px-4 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-medium cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold cursor-pointer"
                >
                  {authMode === 'rename'
                    ? 'Save Name'
                    : authMode === 'login'
                    ? 'Sign In'
                    : 'Create Account'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
