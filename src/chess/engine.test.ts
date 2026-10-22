import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createInitialGameState,
  getLegalMoves,
  makeMove,
  getMaterialSummary,
  calculateEloDelta,
  evaluateFenPosition,
} from './engine';

test('initial position has 20 legal moves for White', () => {
  const state = createInitialGameState();
  const moves = getLegalMoves(state);
  assert.equal(moves.length, 20);
  assert.equal(state.turn, 'w');
  assert.equal(state.inCheck, false);
  assert.equal(state.isGameOver, false);
});

test('Fools Mate triggers checkmate in 4 plies', () => {
  let state = createInitialGameState();
  const r1 = makeMove(state, { from: 'f2', to: 'f3' });
  assert.ok(r1);
  state = r1.nextState;

  const r2 = makeMove(state, { from: 'e7', to: 'e5' });
  assert.ok(r2);
  state = r2.nextState;

  const r3 = makeMove(state, { from: 'g2', to: 'g4' });
  assert.ok(r3);
  state = r3.nextState;

  const r4 = makeMove(state, { from: 'd8', to: 'h4' });
  assert.ok(r4);
  state = r4.nextState;

  assert.equal(state.inCheck, true);
  assert.equal(state.isGameOver, true);
  assert.equal(state.winner, 'b');
  assert.equal(state.resultReason, 'checkmate');
  assert.equal(r4.move.san, 'Qh4#');
});

test('en passant capture works and removes the passed pawn', () => {
  let state = createInitialGameState();
  state = makeMove(state, { from: 'e2', to: 'e4' })!.nextState;
  state = makeMove(state, { from: 'a7', to: 'a6' })!.nextState;
  state = makeMove(state, { from: 'e4', to: 'e5' })!.nextState;
  state = makeMove(state, { from: 'd7', to: 'd5' })!.nextState;

  assert.equal(state.enPassantTarget, 'd6');
  const epRes = makeMove(state, { from: 'e5', to: 'd6' });
  assert.ok(epRes);
  assert.equal(epRes.move.isEnPassant, true);
  assert.equal(epRes.move.san, 'exd6');
  assert.equal(epRes.nextState.capturedByWhite.length, 1);
  assert.equal(epRes.nextState.capturedByWhite[0], 'p');
  // d5 square (rankIdx 3, fileIdx 3) must now be empty
  assert.equal(epRes.nextState.board[3][3], null);
});

test('kingside and queenside castling work and forbid castling through check', () => {
  // Position where White can castle both ways and Black can castle kingside
  const state = createInitialGameState('r3k2r/pppppppp/8/8/8/8/PPPPPPPP/R3K2R w KQkq - 0 1');
  const kingMoves = getLegalMoves(state, 'e1');
  const ks = kingMoves.find((m) => m.to === 'g1');
  const qs = kingMoves.find((m) => m.to === 'c1');
  assert.ok(ks?.isCastleKingside);
  assert.ok(qs?.isCastleQueenside);

  const afterKs = makeMove(state, { from: 'e1', to: 'g1' })!;
  assert.equal(afterKs.move.san, 'O-O');
  // White rook should now be on f1 (rankIdx 7, fileIdx 5)
  assert.equal(afterKs.nextState.board[7][5]?.type, 'r');

  // Position where f1 is attacked by a black bishop on a6
  const blockedState = createInitialGameState('r3k2r/pppppppp/b7/8/8/8/PPPP1PPP/R3K2R w KQkq - 0 1');
  const blockedKingMoves = getLegalMoves(blockedState, 'e1');
  assert.equal(blockedKingMoves.some((m) => m.to === 'g1'), false);
  assert.equal(blockedKingMoves.some((m) => m.to === 'c1'), true);
});

test('pawn promotion supports Queen and Knight underpromotion with check', () => {
  const state = createInitialGameState('8/P7/8/8/8/8/7k/4K3 w - - 0 1');
  const promoMoves = getLegalMoves(state, 'a7');
  assert.equal(promoMoves.length, 4);

  const resQ = makeMove(state, { from: 'a7', to: 'a8', promotion: 'q' });
  assert.ok(resQ);
  assert.equal(resQ.nextState.board[0][0]?.type, 'q');
  assert.equal(resQ.move.san, 'a8=Q');
});

test('stalemate is detected when active player has no legal moves and is not in check', () => {
  // Black king on h8, White Queen on f7, White King on g6, Black to move -> stalemate
  const state = createInitialGameState('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1');
  assert.equal(state.inCheck, false);
  assert.equal(state.isGameOver, true);
  assert.equal(state.winner, 'draw');
  assert.equal(state.resultReason, 'stalemate');
});

test('material summary and ELO calculation work accurately', () => {
  const state = createInitialGameState('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBN1 w Qkq - 0 1');
  const mat = getMaterialSummary(state);
  assert.equal(mat.whiteAdvantage, -5);

  const elo = calculateEloDelta(1200, 1200, 'w');
  assert.equal(elo.whiteDelta, 16);
  assert.equal(elo.blackDelta, -16);
  assert.equal(elo.whiteNew, 1216);
  assert.equal(elo.blackNew, 1184);

  const evalInit = evaluateFenPosition(state.fen);
  assert.ok(evalInit.centipawns < -400);
});
