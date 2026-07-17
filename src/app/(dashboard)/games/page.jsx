'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import {
  sfxChessMove, sfxChessCapture, sfxChessCheck, sfxChessCheckmate, sfxChessStalemate, sfxCastle,
  sfxSlide, sfxMerge, sfx2048Win, sfx2048Over,
  sfxSnakeEat, sfxSnakeDie,
  sfxReveal, sfxFlag, sfxUnflag, sfxExplosion, sfxMineWin,
  sfxFlap, sfxFlappyPoint, sfxFlappyHit,
  sfxKick, sfxGoal, sfxWhistle, sfxTackle, sfxSave, sfxPost, sfxCard,
  isMuted, toggleMute,
} from '@/lib/sounds';

// ── Mute toggle button (used in every game header) ─────────────────────────
function MuteBtn() {
  const [muted, setMuted] = useState(false);
  return (
    <button
      onClick={() => setMuted(toggleMute())}
      title={muted ? 'Unmute' : 'Mute'}
      className="w-8 h-8 flex items-center justify-center rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors text-base"
    >
      {muted ? '🔇' : '🔊'}
    </button>
  );
}

// ─────────────────────────────────────────────
// GAME HUB
// ─────────────────────────────────────────────
const GAMES = [
  { id: 'chess',       emoji: '♟️', name: 'Chess',       desc: 'vs Computer or a Friend' },
  { id: '2048',        emoji: '🔢', name: '2048',        desc: 'Merge tiles to reach 2048' },
  { id: 'snake',       emoji: '🐍', name: 'Snake',       desc: 'Classic snake, eat and grow' },
  { id: 'minesweeper', emoji: '💣', name: 'Minesweeper', desc: 'Find all the mines' },
  { id: 'flappy',      emoji: '🐦', name: 'Flappy Bird', desc: 'Tap to stay alive' },
  { id: 'soccer',      emoji: '⚽', name: 'Soccer',      desc: '5v5 with real rules & AI' },
];

function GameHub({ onSelect }) {
  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center p-8">
      <div className="absolute top-4 right-4"><MuteBtn /></div>
      <h1 className="text-4xl font-bold mb-2 text-white">Games</h1>
      <p className="text-gray-400 mb-10 text-lg">Pick a game to play</p>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6 w-full max-w-4xl">
        {GAMES.map((g) => (
          <div
            key={g.id}
            className="bg-gray-900 hover:bg-gray-800 border border-gray-800 rounded-xl p-6 flex flex-col items-center gap-3 cursor-pointer transition-all duration-200 hover:border-gray-600 hover:scale-105"
            onClick={() => onSelect(g.id)}
          >
            <span className="text-6xl">{g.emoji}</span>
            <h2 className="text-xl font-semibold">{g.name}</h2>
            <p className="text-gray-400 text-sm text-center">{g.desc}</p>
            <button className="mt-2 px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-white font-medium transition-colors">
              Play
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// CHESS
// ─────────────────────────────────────────────
const PIECE_UNICODE = {
  wK:'♔', wQ:'♕', wR:'♖', wB:'♗', wN:'♘', wP:'♙',
  bK:'♚', bQ:'♛', bR:'♜', bB:'♝', bN:'♞', bP:'♟',
};

const PIECE_VALUES = { P:100, N:320, B:330, R:500, Q:900, K:20000 };

const PST = {
  P: [
     0,  0,  0,  0,  0,  0,  0,  0,
    50, 50, 50, 50, 50, 50, 50, 50,
    10, 10, 20, 30, 30, 20, 10, 10,
     5,  5, 10, 25, 25, 10,  5,  5,
     0,  0,  0, 20, 20,  0,  0,  0,
     5, -5,-10,  0,  0,-10, -5,  5,
     5, 10, 10,-20,-20, 10, 10,  5,
     0,  0,  0,  0,  0,  0,  0,  0,
  ],
  N: [
    -50,-40,-30,-30,-30,-30,-40,-50,
    -40,-20,  0,  0,  0,  0,-20,-40,
    -30,  0, 10, 15, 15, 10,  0,-30,
    -30,  5, 15, 20, 20, 15,  5,-30,
    -30,  0, 15, 20, 20, 15,  0,-30,
    -30,  5, 10, 15, 15, 10,  5,-30,
    -40,-20,  0,  5,  5,  0,-20,-40,
    -50,-40,-30,-30,-30,-30,-40,-50,
  ],
  B: [
    -20,-10,-10,-10,-10,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5, 10, 10,  5,  0,-10,
    -10,  5,  5, 10, 10,  5,  5,-10,
    -10,  0, 10, 10, 10, 10,  0,-10,
    -10, 10, 10, 10, 10, 10, 10,-10,
    -10,  5,  0,  0,  0,  0,  5,-10,
    -20,-10,-10,-10,-10,-10,-10,-20,
  ],
  R: [
     0,  0,  0,  0,  0,  0,  0,  0,
     5, 10, 10, 10, 10, 10, 10,  5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
    -5,  0,  0,  0,  0,  0,  0, -5,
     0,  0,  0,  5,  5,  0,  0,  0,
  ],
  Q: [
    -20,-10,-10, -5, -5,-10,-10,-20,
    -10,  0,  0,  0,  0,  0,  0,-10,
    -10,  0,  5,  5,  5,  5,  0,-10,
     -5,  0,  5,  5,  5,  5,  0, -5,
      0,  0,  5,  5,  5,  5,  0, -5,
    -10,  5,  5,  5,  5,  5,  0,-10,
    -10,  0,  5,  0,  0,  0,  0,-10,
    -20,-10,-10, -5, -5,-10,-10,-20,
  ],
  K: [
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -30,-40,-40,-50,-50,-40,-40,-30,
    -20,-30,-30,-40,-40,-30,-30,-20,
    -10,-20,-20,-20,-20,-20,-20,-10,
     20, 20,  0,  0,  0,  0, 20, 20,
     20, 30, 10,  0,  0, 10, 30, 20,
  ],
};

function initChessBoard() {
  const b = Array(64).fill(null);
  const backRank = ['R','N','B','Q','K','B','N','R'];
  for (let c = 0; c < 8; c++) {
    b[c] = 'b' + backRank[c];
    b[8+c] = 'bP';
    b[48+c] = 'wP';
    b[56+c] = 'w' + backRank[c];
  }
  return b;
}

function colorOf(piece) { return piece ? piece[0] : null; }
function typeOf(piece) { return piece ? piece[1] : null; }
function enemy(color) { return color === 'w' ? 'b' : 'w'; }

function isOnBoard(r, c) { return r >= 0 && r < 8 && c >= 0 && c < 8; }

function getRawMoves(board, idx, state) {
  const piece = board[idx];
  if (!piece) return [];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const row = Math.floor(idx / 8);
  const col = idx % 8;
  const moves = [];

  const add = (r, c, promoteTo) => {
    if (!isOnBoard(r, c)) return false;
    const target = board[r * 8 + c];
    if (target && colorOf(target) === color) return false;
    moves.push({ from: idx, to: r * 8 + c, promoteTo: promoteTo || null });
    return !target;
  };

  const slide = (dr, dc) => {
    let r = row + dr, c = col + dc;
    while (isOnBoard(r, c)) {
      const target = board[r * 8 + c];
      if (target) {
        if (colorOf(target) !== color) moves.push({ from: idx, to: r * 8 + c, promoteTo: null });
        break;
      }
      moves.push({ from: idx, to: r * 8 + c, promoteTo: null });
      r += dr; c += dc;
    }
  };

  if (type === 'P') {
    const dir = color === 'w' ? -1 : 1;
    const startRow = color === 'w' ? 6 : 1;
    const promRow = color === 'w' ? 0 : 7;
    const nr = row + dir;
    if (isOnBoard(nr, col) && !board[nr * 8 + col]) {
      if (nr === promRow) {
        ['Q','R','B','N'].forEach(p => moves.push({ from: idx, to: nr * 8 + col, promoteTo: color + p }));
      } else {
        moves.push({ from: idx, to: nr * 8 + col, promoteTo: null });
        if (row === startRow && !board[(nr + dir) * 8 + col]) {
          moves.push({ from: idx, to: (nr + dir) * 8 + col, promoteTo: null });
        }
      }
    }
    for (const dc of [-1, 1]) {
      const nc = col + dc;
      if (!isOnBoard(nr, nc)) continue;
      const target = board[nr * 8 + nc];
      if (target && colorOf(target) !== color) {
        if (nr === promRow) {
          ['Q','R','B','N'].forEach(p => moves.push({ from: idx, to: nr * 8 + nc, promoteTo: color + p }));
        } else {
          moves.push({ from: idx, to: nr * 8 + nc, promoteTo: null });
        }
      }
      const epIdx = nr * 8 + nc;
      if (state.enPassant === epIdx) {
        moves.push({ from: idx, to: epIdx, promoteTo: null, enPassant: true });
      }
    }
  } else if (type === 'N') {
    [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]].forEach(([dr,dc]) => add(row+dr, col+dc));
  } else if (type === 'B') {
    [[-1,-1],[-1,1],[1,-1],[1,1]].forEach(([dr,dc]) => slide(dr,dc));
  } else if (type === 'R') {
    [[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr,dc));
  } else if (type === 'Q') {
    [[-1,-1],[-1,1],[1,-1],[1,1],[-1,0],[1,0],[0,-1],[0,1]].forEach(([dr,dc]) => slide(dr,dc));
  } else if (type === 'K') {
    [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]].forEach(([dr,dc]) => add(row+dr, col+dc));
    // Castling
    if (color === 'w') {
      if (state.castleRights.wK && !board[63-1] && !board[63-2] && board[63] === 'wR') {
        moves.push({ from: idx, to: 62, castle: 'wK' });
      }
      if (state.castleRights.wQ && !board[56+1] && !board[56+2] && !board[56+3] && board[56] === 'wR') {
        moves.push({ from: idx, to: 58, castle: 'wQ' });
      }
    } else {
      if (state.castleRights.bK && !board[1] && !board[2] && board[7] === 'bR') {
        moves.push({ from: idx, to: 6, castle: 'bK' });
      }
      if (state.castleRights.bQ && !board[1] && !board[2] && !board[3] && board[0] === 'bR') {
        moves.push({ from: idx, to: 2, castle: 'bQ' });
      }
    }
  }

  return moves;
}

function applyMove(board, move, state) {
  const nb = [...board];
  const piece = nb[move.from];
  const color = colorOf(piece);
  const type = typeOf(piece);
  const newState = {
    castleRights: { ...state.castleRights },
    enPassant: -1,
  };

  // En passant capture
  if (move.enPassant) {
    const capturedRow = color === 'w' ? Math.floor(move.to / 8) + 1 : Math.floor(move.to / 8) - 1;
    nb[capturedRow * 8 + (move.to % 8)] = null;
  }

  // Double pawn push → set enPassant
  if (type === 'P') {
    const fromRow = Math.floor(move.from / 8);
    const toRow = Math.floor(move.to / 8);
    if (Math.abs(fromRow - toRow) === 2) {
      newState.enPassant = ((fromRow + toRow) / 2) * 8 + (move.from % 8);
    }
  }

  // Castling rook move
  if (move.castle === 'wK') { nb[61] = 'wR'; nb[63] = null; }
  if (move.castle === 'wQ') { nb[59] = 'wR'; nb[56] = null; }
  if (move.castle === 'bK') { nb[5]  = 'bR'; nb[7]  = null; }
  if (move.castle === 'bQ') { nb[3]  = 'bR'; nb[0]  = null; }

  // Update castle rights
  if (move.from === 60) { newState.castleRights.wK = false; newState.castleRights.wQ = false; }
  if (move.from === 4)  { newState.castleRights.bK = false; newState.castleRights.bQ = false; }
  if (move.from === 63 || move.to === 63) newState.castleRights.wK = false;
  if (move.from === 56 || move.to === 56) newState.castleRights.wQ = false;
  if (move.from === 7  || move.to === 7)  newState.castleRights.bK = false;
  if (move.from === 0  || move.to === 0)  newState.castleRights.bQ = false;

  nb[move.to] = move.promoteTo || piece;
  nb[move.from] = null;

  return { board: nb, state: newState };
}

function findKing(board, color) {
  return board.findIndex(p => p === color + 'K');
}

function isAttacked(board, idx, byColor) {
  const row = Math.floor(idx / 8);
  const col = idx % 8;

  // Pawns
  const pDir = byColor === 'w' ? 1 : -1;
  for (const dc of [-1, 1]) {
    const r = row + pDir, c = col + dc;
    if (isOnBoard(r, c) && board[r*8+c] === byColor + 'P') return true;
  }
  // Knights
  for (const [dr, dc] of [[-2,-1],[-2,1],[-1,-2],[-1,2],[1,-2],[1,2],[2,-1],[2,1]]) {
    const r = row+dr, c = col+dc;
    if (isOnBoard(r,c) && board[r*8+c] === byColor+'N') return true;
  }
  // Bishop/Queen diagonals
  for (const [dr, dc] of [[-1,-1],[-1,1],[1,-1],[1,1]]) {
    let r = row+dr, c = col+dc;
    while (isOnBoard(r,c)) {
      const p = board[r*8+c];
      if (p) { if (colorOf(p) === byColor && (typeOf(p)==='B'||typeOf(p)==='Q')) return true; break; }
      r+=dr; c+=dc;
    }
  }
  // Rook/Queen straights
  for (const [dr, dc] of [[-1,0],[1,0],[0,-1],[0,1]]) {
    let r = row+dr, c = col+dc;
    while (isOnBoard(r,c)) {
      const p = board[r*8+c];
      if (p) { if (colorOf(p) === byColor && (typeOf(p)==='R'||typeOf(p)==='Q')) return true; break; }
      r+=dr; c+=dc;
    }
  }
  // King
  for (const [dr, dc] of [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]) {
    const r = row+dr, c = col+dc;
    if (isOnBoard(r,c) && board[r*8+c] === byColor+'K') return true;
  }
  return false;
}

function inCheck(board, color) {
  const ki = findKing(board, color);
  if (ki === -1) return false;
  return isAttacked(board, ki, enemy(color));
}

function getLegalMoves(board, color, state) {
  const moves = [];
  for (let i = 0; i < 64; i++) {
    if (colorOf(board[i]) !== color) continue;
    const raw = getRawMoves(board, i, state);
    for (const m of raw) {
      // Validate castling: can't castle through check
      if (m.castle) {
        if (inCheck(board, color)) continue;
        const passThrough = m.castle === 'wK' ? [61] : m.castle === 'wQ' ? [59] : m.castle === 'bK' ? [5] : [3];
        if (passThrough.some(sq => isAttacked(board, sq, enemy(color)))) continue;
      }
      const { board: nb } = applyMove(board, m, state);
      if (!inCheck(nb, color)) moves.push(m);
    }
  }
  return moves;
}

function evaluateBoard(board) {
  let score = 0;
  for (let i = 0; i < 64; i++) {
    const p = board[i];
    if (!p) continue;
    const color = colorOf(p);
    const type = typeOf(p);
    const val = PIECE_VALUES[type] || 0;
    const row = Math.floor(i / 8);
    const pstIdx = color === 'w' ? i : (7 - row) * 8 + (i % 8);
    const pst = PST[type] ? PST[type][pstIdx] : 0;
    score += color === 'w' ? (val + pst) : -(val + pst);
  }
  return score;
}

function minimax(board, state, depth, alpha, beta, maximizing) {
  const color = maximizing ? 'w' : 'b';
  const moves = getLegalMoves(board, color, state);

  if (depth === 0 || moves.length === 0) {
    if (moves.length === 0) {
      if (inCheck(board, color)) return maximizing ? -100000 : 100000;
      return 0;
    }
    return evaluateBoard(board);
  }

  // Move ordering: captures first
  moves.sort((a, b) => {
    const av = board[a.to] ? (PIECE_VALUES[typeOf(board[a.to])] || 0) : 0;
    const bv = board[b.to] ? (PIECE_VALUES[typeOf(board[b.to])] || 0) : 0;
    return bv - av;
  });

  if (maximizing) {
    let best = -Infinity;
    for (const m of moves) {
      const { board: nb, state: ns } = applyMove(board, m, state);
      const score = minimax(nb, ns, depth - 1, alpha, beta, false);
      best = Math.max(best, score);
      alpha = Math.max(alpha, score);
      if (beta <= alpha) break;
    }
    return best;
  } else {
    let best = Infinity;
    for (const m of moves) {
      const { board: nb, state: ns } = applyMove(board, m, state);
      const score = minimax(nb, ns, depth - 1, alpha, beta, true);
      best = Math.min(best, score);
      beta = Math.min(beta, score);
      if (beta <= alpha) break;
    }
    return best;
  }
}

function getBestAIMove(board, state) {
  const moves = getLegalMoves(board, 'b', state);
  if (!moves.length) return null;

  // Auto-promote to queen
  const processedMoves = moves.map(m => ({
    ...m,
    promoteTo: m.promoteTo ? 'bQ' : null,
  }));

  let bestScore = Infinity;
  let bestMove = processedMoves[0];

  for (const m of processedMoves) {
    const { board: nb, state: ns } = applyMove(board, m, state);
    const score = minimax(nb, ns, 2, -Infinity, Infinity, true);
    if (score < bestScore) {
      bestScore = score;
      bestMove = m;
    }
  }
  return bestMove;
}

function ChessGame({ onBack }) {
  const [mode, setMode] = useState(null); // null | 'cpu' | 'pvp'
  const [board, setBoard] = useState(initChessBoard());
  const [gameState, setGameState] = useState({
    castleRights: { wK: true, wQ: true, bK: true, bQ: true },
    enPassant: -1,
  });
  const [turn, setTurn] = useState('w');
  const [selected, setSelected] = useState(null);
  const [legalMoves, setLegalMoves] = useState([]);
  const [lastMove, setLastMove] = useState(null);
  const [status, setStatus] = useState('');
  const [gameOver, setGameOver] = useState(false);
  const [flipped, setFlipped] = useState(false);
  const [thinking, setThinking] = useState(false);
  const [promoDialog, setPromoDialog] = useState(null);
  const [captured, setCaptured] = useState({ w: [], b: [] });

  const resetGame = useCallback((m) => {
    setBoard(initChessBoard());
    setGameState({ castleRights: { wK: true, wQ: true, bK: true, bQ: true }, enPassant: -1 });
    setTurn('w');
    setSelected(null);
    setLegalMoves([]);
    setLastMove(null);
    setStatus('');
    setGameOver(false);
    setThinking(false);
    setPromoDialog(null);
    setCaptured({ w: [], b: [] });
    if (m !== undefined) setMode(m);
  }, []);

  const doMove = useCallback((board, move, state, turn, capturedState) => {
    const captured = board[move.to];
    const { board: nb, state: ns } = applyMove(board, move, state);
    const nextTurn = enemy(turn);

    const newCaptured = { ...capturedState };
    if (captured) {
      newCaptured[turn] = [...(newCaptured[turn] || []), captured];
    }
    if (move.enPassant) {
      const epColor = turn === 'w' ? 'b' : 'w';
      newCaptured[turn] = [...(newCaptured[turn] || []), epColor + 'P'];
    }

    const nextMoves = getLegalMoves(nb, nextTurn, ns);
    let newStatus = '';
    let over = false;

    if (nextMoves.length === 0) {
      if (inCheck(nb, nextTurn)) {
        newStatus = (turn === 'w' ? 'White' : 'Black') + ' wins by checkmate!';
      } else {
        newStatus = 'Draw by stalemate!';
      }
      over = true;
    } else if (inCheck(nb, nextTurn)) {
      newStatus = (nextTurn === 'w' ? 'White' : 'Black') + ' is in check!';
    }

    return { board: nb, state: ns, nextTurn, captured: newCaptured, status: newStatus, gameOver: over };
  }, []);

  // Play the right sound after a chess move
  const playChessSound = useCallback((move, originalBoard, result) => {
    const { status, gameOver } = result;
    const wasCapture = !!originalBoard[move.to] || !!move.enPassant;
    const isCastleMove = typeOf(originalBoard[move.from]) === 'K' &&
      Math.abs((move.to % 8) - (move.from % 8)) === 2;
    if (gameOver) {
      if (status.includes('checkmate')) sfxChessCheckmate();
      else sfxChessStalemate();
    } else if (status.includes('check')) {
      sfxChessCheck();
    } else if (isCastleMove) {
      sfxCastle();
    } else if (wasCapture) {
      sfxChessCapture();
    } else {
      sfxChessMove();
    }
  }, []);

  const handleSquareClick = useCallback((idx) => {
    if (gameOver || thinking) return;
    if (mode === 'cpu' && turn === 'b') return;

    const piece = board[idx];

    if (selected === null) {
      if (piece && colorOf(piece) === turn) {
        setSelected(idx);
        const moves = getLegalMoves(board, turn, gameState);
        setLegalMoves(moves.filter(m => m.from === idx));
      }
      return;
    }

    if (selected === idx) { setSelected(null); setLegalMoves([]); return; }

    if (piece && colorOf(piece) === turn) {
      setSelected(idx);
      const moves = getLegalMoves(board, turn, gameState);
      setLegalMoves(moves.filter(m => m.from === idx));
      return;
    }

    const move = legalMoves.find(m => m.to === idx);
    if (!move) { setSelected(null); setLegalMoves([]); return; }

    // Check if pawn promotion needs dialog
    const p = board[move.from];
    const isPromo = typeOf(p) === 'P' && (Math.floor(move.to / 8) === 0 || Math.floor(move.to / 8) === 7);
    if (isPromo && !move.promoteTo) {
      setPromoDialog({ move, color: turn });
      return;
    }

    const result = doMove(board, move, gameState, turn, captured);
    playChessSound(move, board, result);
    setBoard(result.board);
    setGameState(result.state);
    setTurn(result.nextTurn);
    setCaptured(result.captured);
    setStatus(result.status);
    setGameOver(result.gameOver);
    setLastMove({ from: move.from, to: move.to });
    setSelected(null);
    setLegalMoves([]);
  }, [board, gameState, turn, selected, legalMoves, gameOver, thinking, mode, captured, doMove, playChessSound]);

  const handlePromoSelect = useCallback((piece) => {
    if (!promoDialog) return;
    const move = { ...promoDialog.move, promoteTo: piece };
    const result = doMove(board, move, gameState, turn, captured);
    playChessSound(move, board, result);
    setBoard(result.board);
    setGameState(result.state);
    setTurn(result.nextTurn);
    setCaptured(result.captured);
    setStatus(result.status);
    setGameOver(result.gameOver);
    setLastMove({ from: move.from, to: move.to });
    setSelected(null);
    setLegalMoves([]);
    setPromoDialog(null);
  }, [promoDialog, board, gameState, turn, captured, doMove]);

  // AI move
  useEffect(() => {
    if (mode !== 'cpu' || turn !== 'b' || gameOver) return;
    setThinking(true);
    const timer = setTimeout(() => {
      const move = getBestAIMove(board, gameState);
      if (move) {
        const result = doMove(board, move, gameState, 'b', captured);
        playChessSound(move, board, result);
        setBoard(result.board);
        setGameState(result.state);
        setTurn(result.nextTurn);
        setCaptured(result.captured);
        setStatus(result.status);
        setGameOver(result.gameOver);
        setLastMove({ from: move.from, to: move.to });
      }
      setThinking(false);
    }, 100);
    return () => clearTimeout(timer);
  }, [mode, turn, board, gameState, gameOver, captured, doMove]);

  if (!mode) {
    return (
      <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-center gap-6">
        <button onClick={onBack} className="absolute top-4 left-4 px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
        <div className="absolute top-4 right-4"><MuteBtn /></div>
        <h1 className="text-4xl font-bold">♟ Chess</h1>
        <div className="flex gap-4">
          <button onClick={() => setMode('cpu')} className="px-8 py-4 bg-indigo-600 hover:bg-indigo-500 rounded-xl text-lg font-semibold">vs Computer</button>
          <button onClick={() => setMode('pvp')} className="px-8 py-4 bg-green-700 hover:bg-green-600 rounded-xl text-lg font-semibold">vs Player</button>
        </div>
      </div>
    );
  }

  const displayBoard = flipped ? [...board].reverse() : board;
  const kingIdx = inCheck(board, turn) ? findKing(board, turn) : -1;

  const renderCaptured = (color) => {
    const pieces = captured[color] || [];
    return (
      <div className="flex flex-wrap gap-0.5 min-h-6">
        {pieces.map((p, i) => (
          <span key={i} style={{ fontSize: '16px', color: colorOf(p) === 'w' ? '#f0d9b5' : '#1a0e00', filter: colorOf(p) === 'w' ? 'drop-shadow(0 1px 1px rgba(0,0,0,0.9))' : 'none' }}>
            {PIECE_UNICODE[p]}
          </span>
        ))}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start pt-4 pb-8 px-4">
      <div className="w-full max-w-2xl">
        <div className="flex items-center justify-between mb-3">
          <button onClick={onBack} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
          <div className="text-center">
            <span className={`font-semibold ${thinking ? 'animate-pulse text-yellow-400' : ''}`}>
              {gameOver ? status : thinking ? 'AI thinking…' : status || `${turn === 'w' ? 'White' : 'Black'}'s turn`}
            </span>
          </div>
          <button onClick={() => setFlipped(f => !f)} className="px-4 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">🔄 Flip</button>
        </div>

        {/* Captured by black (top) */}
        <div className="mb-1 px-1">{renderCaptured(flipped ? 'w' : 'b')}</div>

        {/* Board */}
        <div className="relative w-full" style={{ aspectRatio: '1/1', maxWidth: '560px', margin: '0 auto' }}>
          <div className="grid grid-cols-8 w-full h-full">
            {displayBoard.map((piece, displayIdx) => {
              const actualIdx = flipped ? 63 - displayIdx : displayIdx;
              const r = Math.floor(actualIdx / 8);
              const c = actualIdx % 8;
              const isLight = (r + c) % 2 === 0;
              const isSelected = selected === actualIdx;
              const isLastMove = lastMove && (lastMove.from === actualIdx || lastMove.to === actualIdx);
              const isValidTarget = legalMoves.some(m => m.to === actualIdx);
              const isCapture = isValidTarget && !!piece;
              const isKingCheck = actualIdx === kingIdx;

              let bg = isLight ? 'bg-amber-100' : 'bg-amber-800';
              if (isSelected || isLastMove) bg = 'bg-yellow-400';
              if (isKingCheck) bg = 'bg-red-500';

              return (
                <div
                  key={actualIdx}
                  className={`${bg} flex items-center justify-center cursor-pointer relative`}
                  style={{ aspectRatio: '1/1' }}
                  onClick={() => handleSquareClick(actualIdx)}
                >
                  {isValidTarget && !isCapture && (
                    <div className="absolute w-1/3 h-1/3 rounded-full bg-black opacity-25 z-10" />
                  )}
                  {isCapture && (
                    <div className="absolute inset-0 rounded-sm border-4 border-black opacity-30 z-10" />
                  )}
                  {piece && (
                    <span
                      style={{
                        fontSize: 'clamp(22px, 4.5vw, 44px)',
                        lineHeight: 1,
                        color: colorOf(piece) === 'w' ? '#f0d9b5' : '#1a0e00',
                        filter: colorOf(piece) === 'w'
                          ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.9)) drop-shadow(0 0 1px rgba(0,0,0,1))'
                          : 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
                        userSelect: 'none',
                        zIndex: 20,
                        position: 'relative',
                      }}
                    >
                      {PIECE_UNICODE[piece]}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {/* Game Over Overlay */}
          {gameOver && (
            <div className="absolute inset-0 bg-black bg-opacity-70 flex flex-col items-center justify-center rounded gap-4">
              <p className="text-2xl font-bold text-white text-center px-4">{status}</p>
              <div className="flex gap-3">
                <button onClick={() => resetGame(mode)} className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold">Rematch</button>
                <button onClick={() => resetGame(null)} className="px-6 py-3 bg-gray-700 hover:bg-gray-600 rounded-lg font-semibold">Menu</button>
              </div>
            </div>
          )}

          {/* Promotion Dialog */}
          {promoDialog && (
            <div className="absolute inset-0 bg-black bg-opacity-80 flex items-center justify-center">
              <div className="bg-gray-800 rounded-xl p-6 flex flex-col items-center gap-4">
                <p className="text-white font-semibold">Choose promotion</p>
                <div className="flex gap-3">
                  {['Q','R','B','N'].map(t => (
                    <button
                      key={t}
                      onClick={() => handlePromoSelect(promoDialog.color + t)}
                      className="w-12 h-12 bg-gray-700 hover:bg-gray-600 rounded-lg flex items-center justify-center text-2xl"
                    >
                      <span style={{
                        color: promoDialog.color === 'w' ? '#f0d9b5' : '#1a0e00',
                        filter: promoDialog.color === 'w' ? 'drop-shadow(0 1px 2px rgba(0,0,0,0.9))' : 'drop-shadow(0 1px 2px rgba(0,0,0,0.7))',
                      }}>
                        {PIECE_UNICODE[promoDialog.color + t]}
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Captured by white (bottom) */}
        <div className="mt-1 px-1">{renderCaptured(flipped ? 'b' : 'w')}</div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// 2048
// ─────────────────────────────────────────────
const TILE_COLORS = {
  2:    'bg-yellow-100 text-gray-700',
  4:    'bg-yellow-200 text-gray-700',
  8:    'bg-orange-300 text-white',
  16:   'bg-orange-400 text-white',
  32:   'bg-orange-500 text-white',
  64:   'bg-red-500 text-white',
  128:  'bg-yellow-400 text-white',
  256:  'bg-yellow-500 text-white',
  512:  'bg-yellow-600 text-white',
  1024: 'bg-amber-600 text-white',
  2048: 'bg-amber-700 text-white font-extrabold',
};

function newGrid() { return Array(4).fill(null).map(() => Array(4).fill(0)); }

function addTile(grid) {
  const empty = [];
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++)
      if (grid[r][c] === 0) empty.push([r, c]);
  if (!empty.length) return grid;
  const [r, c] = empty[Math.floor(Math.random() * empty.length)];
  const ng = grid.map(row => [...row]);
  ng[r][c] = Math.random() < 0.9 ? 2 : 4;
  return ng;
}

function slideRow(row) {
  const nums = row.filter(x => x !== 0);
  const merged = [];
  let i = 0, score = 0;
  while (i < nums.length) {
    if (i + 1 < nums.length && nums[i] === nums[i+1]) {
      merged.push(nums[i] * 2);
      score += nums[i] * 2;
      i += 2;
    } else {
      merged.push(nums[i]);
      i++;
    }
  }
  while (merged.length < 4) merged.push(0);
  return { row: merged, score };
}

function moveGrid(grid, dir) {
  let ng = grid.map(r => [...r]);
  let totalScore = 0;
  let changed = false;

  const transpose = (g) => g[0].map((_, c) => g.map(r => r[c]));
  const reverseRows = (g) => g.map(r => [...r].reverse());

  if (dir === 'left') {
    ng = ng.map(row => { const r = slideRow(row); totalScore += r.score; if (r.row.some((v,i) => v !== row[i])) changed = true; return r.row; });
  } else if (dir === 'right') {
    ng = reverseRows(ng);
    ng = ng.map(row => { const r = slideRow(row); totalScore += r.score; if (r.row.some((v,i) => v !== row[i])) changed = true; return r.row; });
    ng = reverseRows(ng);
  } else if (dir === 'up') {
    ng = transpose(ng);
    ng = ng.map(row => { const r = slideRow(row); totalScore += r.score; if (r.row.some((v,i) => v !== row[i])) changed = true; return r.row; });
    ng = transpose(ng);
  } else if (dir === 'down') {
    ng = transpose(ng);
    ng = reverseRows(ng);
    ng = ng.map(row => { const r = slideRow(row); totalScore += r.score; if (r.row.some((v,i) => v !== row[i])) changed = true; return r.row; });
    ng = reverseRows(ng);
    ng = transpose(ng);
  }

  return { grid: ng, score: totalScore, changed };
}

function isGameOver2048(grid) {
  for (let r = 0; r < 4; r++)
    for (let c = 0; c < 4; c++) {
      if (grid[r][c] === 0) return false;
      if (r < 3 && grid[r][c] === grid[r+1][c]) return false;
      if (c < 3 && grid[r][c] === grid[r][c+1]) return false;
    }
  return true;
}

function Game2048({ onBack }) {
  const initState = () => {
    let g = newGrid();
    g = addTile(g);
    g = addTile(g);
    return g;
  };

  const [grid, setGrid] = useState(initState);
  const [score, setScore] = useState(0);
  const [best, setBest] = useState(() => {
    try { return parseInt(localStorage.getItem('2048-best') || '0'); } catch { return 0; }
  });
  const [gameOver, setGameOver] = useState(false);
  const [won, setWon] = useState(false);

  const handleMove = useCallback((dir) => {
    if (gameOver) return;
    setGrid(prev => {
      const { grid: ng, score: gained, changed } = moveGrid(prev, dir);
      if (!changed) return prev;
      const withNew = addTile(ng);
      // Sound: merge pop if any tiles merged, otherwise slide whoosh
      if (gained > 0) sfxMerge(gained);
      else sfxSlide();
      setScore(s => {
        const ns = s + gained;
        setBest(b => {
          const nb = Math.max(b, ns);
          try { localStorage.setItem('2048-best', nb); } catch {}
          return nb;
        });
        return ns;
      });
      if (!won && withNew.flat().includes(2048)) { setWon(true); sfx2048Win(); }
      if (isGameOver2048(withNew)) { setGameOver(true); sfx2048Over(); }
      return withNew;
    });
  }, [gameOver, won]);

  useEffect(() => {
    const handler = (e) => {
      const map = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
      if (map[e.key]) { e.preventDefault(); handleMove(map[e.key]); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [handleMove]);

  const newGame = () => {
    setGrid(initState());
    setScore(0);
    setGameOver(false);
    setWon(false);
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start pt-6 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
          <h1 className="text-3xl font-bold">2048</h1>
          <div className="flex gap-2 items-center">
            <MuteBtn />
            <button onClick={newGame} className="px-3 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg text-sm">New</button>
          </div>
        </div>

        <div className="flex justify-center gap-4 mb-4">
          <div className="bg-gray-800 rounded-lg px-6 py-2 text-center">
            <div className="text-xs text-gray-400 uppercase">Score</div>
            <div className="text-xl font-bold">{score}</div>
          </div>
          <div className="bg-gray-800 rounded-lg px-6 py-2 text-center">
            <div className="text-xs text-gray-400 uppercase">Best</div>
            <div className="text-xl font-bold">{best}</div>
          </div>
        </div>

        <div className="relative bg-gray-700 rounded-xl p-2 select-none">
          <div className="grid grid-cols-4 gap-2">
            {grid.flat().map((val, i) => (
              <div
                key={i}
                className={`aspect-square rounded-lg flex items-center justify-center font-bold text-lg transition-all ${
                  val ? (TILE_COLORS[val] || 'bg-amber-800 text-white') : 'bg-gray-800'
                }`}
              >
                {val !== 0 ? val : ''}
              </div>
            ))}
          </div>
          {(gameOver || won) && (
            <div className="absolute inset-0 bg-black bg-opacity-70 rounded-xl flex flex-col items-center justify-center gap-3">
              <p className="text-2xl font-bold">{won ? '🎉 You won!' : 'Game Over!'}</p>
              <p className="text-gray-300">Score: {score}</p>
              <button onClick={newGame} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold">Play Again</button>
            </div>
          )}
        </div>

        {/* Mobile controls */}
        <div className="mt-4 flex flex-col items-center gap-1">
          <button onClick={() => handleMove('up')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">▲</button>
          <div className="flex gap-1">
            <button onClick={() => handleMove('left')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">◄</button>
            <button onClick={() => handleMove('down')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">▼</button>
            <button onClick={() => handleMove('right')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">►</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// SNAKE
// ─────────────────────────────────────────────
const SNAKE_COLS = 20;
const SNAKE_ROWS = 20;
const CELL_SIZE = 20;

function SnakeGame({ onBack }) {
  const canvasRef = useRef(null);
  const snakeRef = useRef([{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }]);
  const dirRef = useRef({ dx: 1, dy: 0 });
  const nextDirRef = useRef({ dx: 1, dy: 0 });
  const foodRef = useRef({ x: 15, y: 10 });
  const scoreRef = useRef(0);
  const gameStateRef = useRef('idle'); // idle | playing | paused | dead
  const intervalRef = useRef(null);
  const speedRef = useRef(150);
  const foodCountRef = useRef(0);

  const [displayScore, setDisplayScore] = useState(0);
  const [displayState, setDisplayState] = useState('idle');

  const randomFood = useCallback((snake) => {
    let pos;
    do {
      pos = { x: Math.floor(Math.random() * SNAKE_COLS), y: Math.floor(Math.random() * SNAKE_ROWS) };
    } while (snake.some(s => s.x === pos.x && s.y === pos.y));
    return pos;
  }, []);

  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;

    ctx.fillStyle = '#111827';
    ctx.fillRect(0, 0, W, H);

    // Grid
    ctx.strokeStyle = '#1f2937';
    ctx.lineWidth = 0.5;
    for (let x = 0; x <= W; x += CELL_SIZE) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke(); }
    for (let y = 0; y <= H; y += CELL_SIZE) { ctx.beginPath(); ctx.moveTo(0, y); ctx.lineTo(W, y); ctx.stroke(); }

    // Food
    const food = foodRef.current;
    ctx.fillStyle = '#ef4444';
    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 10;
    ctx.beginPath();
    ctx.arc(food.x * CELL_SIZE + CELL_SIZE/2, food.y * CELL_SIZE + CELL_SIZE/2, CELL_SIZE/2 - 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;

    // Snake
    const snake = snakeRef.current;
    snake.forEach((seg, i) => {
      ctx.fillStyle = i === 0 ? '#22c55e' : '#16a34a';
      ctx.beginPath();
      ctx.roundRect(seg.x * CELL_SIZE + 1, seg.y * CELL_SIZE + 1, CELL_SIZE - 2, CELL_SIZE - 2, 3);
      ctx.fill();
    });

    // Score
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.font = 'bold 16px sans-serif';
    ctx.textAlign = 'left';
    ctx.fillText(`Score: ${scoreRef.current}`, 8, 20);

    if (gameStateRef.current === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Snake', W/2, H/2 - 30);
      ctx.font = '16px sans-serif';
      ctx.fillText('Press Space or ↑ to Start', W/2, H/2 + 10);
    } else if (gameStateRef.current === 'paused') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Paused', W/2, H/2);
      ctx.font = '14px sans-serif';
      ctx.fillText('Press Space to resume', W/2, H/2 + 30);
    } else if (gameStateRef.current === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 24px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', W/2, H/2 - 30);
      ctx.font = '18px sans-serif';
      ctx.fillText(`Score: ${scoreRef.current}`, W/2, H/2 + 5);
      ctx.font = '14px sans-serif';
      ctx.fillText('Press Space or click to restart', W/2, H/2 + 35);
    }
  }, []);

  const gameLoop = useCallback(() => {
    if (gameStateRef.current !== 'playing') return;
    const snake = snakeRef.current;
    const dir = nextDirRef.current;
    dirRef.current = dir;

    const head = { x: snake[0].x + dir.dx, y: snake[0].y + dir.dy };

    // Wall collision
    if (head.x < 0 || head.x >= SNAKE_COLS || head.y < 0 || head.y >= SNAKE_ROWS) {
      sfxSnakeDie();
      gameStateRef.current = 'dead';
      setDisplayState('dead');
      draw();
      return;
    }
    // Self collision
    if (snake.some(s => s.x === head.x && s.y === head.y)) {
      sfxSnakeDie();
      gameStateRef.current = 'dead';
      setDisplayState('dead');
      draw();
      return;
    }

    const newSnake = [head, ...snake];
    const food = foodRef.current;
    if (head.x === food.x && head.y === food.y) {
      sfxSnakeEat();
      scoreRef.current++;
      foodCountRef.current++;
      setDisplayScore(scoreRef.current);
      foodRef.current = randomFood(newSnake);
      // Speed up every 5 food
      if (foodCountRef.current % 5 === 0 && speedRef.current > 60) {
        speedRef.current = Math.max(60, speedRef.current - 15);
        clearInterval(intervalRef.current);
        intervalRef.current = setInterval(gameLoop, speedRef.current);
      }
    } else {
      newSnake.pop();
    }

    snakeRef.current = newSnake;
    draw();
  }, [draw, randomFood]);

  const startGame = useCallback(() => {
    snakeRef.current = [{ x: 10, y: 10 }, { x: 9, y: 10 }, { x: 8, y: 10 }];
    dirRef.current = { dx: 1, dy: 0 };
    nextDirRef.current = { dx: 1, dy: 0 };
    foodRef.current = randomFood(snakeRef.current);
    scoreRef.current = 0;
    speedRef.current = 150;
    foodCountRef.current = 0;
    setDisplayScore(0);
    gameStateRef.current = 'playing';
    setDisplayState('playing');
    clearInterval(intervalRef.current);
    intervalRef.current = setInterval(gameLoop, speedRef.current);
  }, [gameLoop, randomFood]);

  useEffect(() => {
    draw();
  }, [draw]);

  useEffect(() => {
    const handleKey = (e) => {
      const cur = dirRef.current;
      if (e.code === 'Space') {
        e.preventDefault();
        if (gameStateRef.current === 'idle' || gameStateRef.current === 'dead') {
          startGame();
        } else if (gameStateRef.current === 'playing') {
          gameStateRef.current = 'paused';
          setDisplayState('paused');
          clearInterval(intervalRef.current);
          draw();
        } else if (gameStateRef.current === 'paused') {
          gameStateRef.current = 'playing';
          setDisplayState('playing');
          intervalRef.current = setInterval(gameLoop, speedRef.current);
        }
        return;
      }
      const dirs = {
        ArrowUp: { dx: 0, dy: -1 }, w: { dx: 0, dy: -1 }, W: { dx: 0, dy: -1 },
        ArrowDown: { dx: 0, dy: 1 }, s: { dx: 0, dy: 1 }, S: { dx: 0, dy: 1 },
        ArrowLeft: { dx: -1, dy: 0 }, a: { dx: -1, dy: 0 }, A: { dx: -1, dy: 0 },
        ArrowRight: { dx: 1, dy: 0 }, d: { dx: 1, dy: 0 }, D: { dx: 1, dy: 0 },
      };
      const newDir = dirs[e.key];
      if (!newDir) return;
      if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.key)) e.preventDefault();
      if (gameStateRef.current === 'idle' || gameStateRef.current === 'dead') { startGame(); }
      if (newDir.dx === -cur.dx && newDir.dy === -cur.dy) return;
      nextDirRef.current = newDir;
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [startGame, gameLoop, draw]);

  useEffect(() => {
    return () => clearInterval(intervalRef.current);
  }, []);

  const handleDpad = (dir) => {
    const cur = dirRef.current;
    const dirs = {
      up: { dx: 0, dy: -1 }, down: { dx: 0, dy: 1 },
      left: { dx: -1, dy: 0 }, right: { dx: 1, dy: 0 },
    };
    const newDir = dirs[dir];
    if (gameStateRef.current === 'idle' || gameStateRef.current === 'dead') startGame();
    if (newDir.dx === -cur.dx && newDir.dy === -cur.dy) return;
    nextDirRef.current = newDir;
  };

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start pt-6 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
          <h1 className="text-2xl font-bold">🐍 Snake</h1>
          <div className="flex items-center gap-2">
            <MuteBtn />
            <div className="text-right">
              <div className="text-sm text-gray-400">Score</div>
              <div className="font-bold">{displayScore}</div>
            </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={SNAKE_COLS * CELL_SIZE}
          height={SNAKE_ROWS * CELL_SIZE}
          className="rounded-xl w-full cursor-pointer"
          style={{ imageRendering: 'pixelated' }}
          onClick={() => {
            if (gameStateRef.current === 'idle' || gameStateRef.current === 'dead') startGame();
          }}
        />

        {/* D-pad */}
        <div className="mt-4 flex flex-col items-center gap-1">
          <button onClick={() => handleDpad('up')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">▲</button>
          <div className="flex gap-1">
            <button onClick={() => handleDpad('left')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">◄</button>
            <button onClick={() => handleDpad('down')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">▼</button>
            <button onClick={() => handleDpad('right')} className="w-12 h-10 bg-gray-700 hover:bg-gray-600 rounded-lg text-lg">►</button>
          </div>
          <p className="text-gray-500 text-xs mt-1">Space to pause</p>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// MINESWEEPER
// ─────────────────────────────────────────────
const MS_CONFIGS = {
  beginner:     { rows: 9,  cols: 9,  mines: 10 },
  intermediate: { rows: 16, cols: 16, mines: 40 },
  expert:       { rows: 16, cols: 30, mines: 99 },
};

const NUM_COLORS = ['','text-blue-400','text-green-400','text-red-400','text-blue-800','text-red-800','text-cyan-400','text-gray-900','text-gray-500'];

function makeMSBoard(rows, cols) {
  return Array(rows).fill(null).map(() =>
    Array(cols).fill(null).map(() => ({ revealed: false, flagged: false, mine: false, neighborCount: 0 }))
  );
}

function placeMines(board, rows, cols, mines, safeR, safeC) {
  const nb = board.map(row => row.map(c => ({ ...c })));
  const safe = new Set();
  for (let dr = -1; dr <= 1; dr++)
    for (let dc = -1; dc <= 1; dc++) {
      const r = safeR + dr, c = safeC + dc;
      if (r >= 0 && r < rows && c >= 0 && c < cols) safe.add(r * cols + c);
    }
  let placed = 0;
  while (placed < mines) {
    const r = Math.floor(Math.random() * rows);
    const c = Math.floor(Math.random() * cols);
    if (!nb[r][c].mine && !safe.has(r * cols + c)) {
      nb[r][c].mine = true;
      placed++;
    }
  }
  // Compute neighbor counts
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      if (nb[r][c].mine) continue;
      let count = 0;
      for (let dr = -1; dr <= 1; dr++)
        for (let dc = -1; dc <= 1; dc++) {
          const nr = r+dr, nc = c+dc;
          if (nr >= 0 && nr < rows && nc >= 0 && nc < cols && nb[nr][nc].mine) count++;
        }
      nb[r][c].neighborCount = count;
    }
  return nb;
}

function floodReveal(board, rows, cols, r, c) {
  const nb = board.map(row => row.map(cell => ({ ...cell })));
  const stack = [[r, c]];
  const visited = new Set();
  while (stack.length) {
    const [cr, cc] = stack.pop();
    const key = cr * cols + cc;
    if (visited.has(key)) continue;
    visited.add(key);
    if (!nb[cr][cc].revealed && !nb[cr][cc].flagged) {
      nb[cr][cc].revealed = true;
      if (nb[cr][cc].neighborCount === 0 && !nb[cr][cc].mine) {
        for (let dr = -1; dr <= 1; dr++)
          for (let dc = -1; dc <= 1; dc++) {
            const nr = cr+dr, nc = cc+dc;
            if (nr >= 0 && nr < rows && nc >= 0 && nc < cols) stack.push([nr, nc]);
          }
      }
    }
  }
  return nb;
}

function Minesweeper({ onBack }) {
  const [difficulty, setDifficulty] = useState('beginner');
  const config = MS_CONFIGS[difficulty];
  const [board, setBoard] = useState(() => makeMSBoard(config.rows, config.cols));
  const [gamePhase, setGamePhase] = useState('idle'); // idle | playing | won | lost
  const [firstClick, setFirstClick] = useState(true);
  const [flagCount, setFlagCount] = useState(0);
  const [time, setTime] = useState(0);
  const timerRef = useRef(null);

  const resetGame = useCallback((diff) => {
    const c = MS_CONFIGS[diff || difficulty];
    setBoard(makeMSBoard(c.rows, c.cols));
    setGamePhase('idle');
    setFirstClick(true);
    setFlagCount(0);
    setTime(0);
    clearInterval(timerRef.current);
  }, [difficulty]);

  const changeDifficulty = (d) => {
    setDifficulty(d);
    const c = MS_CONFIGS[d];
    setBoard(makeMSBoard(c.rows, c.cols));
    setGamePhase('idle');
    setFirstClick(true);
    setFlagCount(0);
    setTime(0);
    clearInterval(timerRef.current);
  };

  useEffect(() => () => clearInterval(timerRef.current), []);

  const checkWin = (b, rows, cols, mines) => {
    let revealed = 0;
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++)
        if (b[r][c].revealed) revealed++;
    return revealed === rows * cols - mines;
  };

  const handleClick = (r, c) => {
    if (gamePhase === 'won' || gamePhase === 'lost') return;
    const cell = board[r][c];
    if (cell.revealed || cell.flagged) return;

    let nb = board;
    if (firstClick) {
      nb = placeMines(board, config.rows, config.cols, config.mines, r, c);
      setFirstClick(false);
      setGamePhase('playing');
      timerRef.current = setInterval(() => setTime(t => t + 1), 1000);
    }

    if (nb[r][c].mine) {
      sfxExplosion();
      // Reveal all mines
      nb = nb.map(row => row.map(cell => cell.mine ? { ...cell, revealed: true } : cell));
      setBoard(nb);
      setGamePhase('lost');
      clearInterval(timerRef.current);
      return;
    }

    sfxReveal();
    nb = floodReveal(nb, config.rows, config.cols, r, c);
    setBoard(nb);
    if (checkWin(nb, config.rows, config.cols, config.mines)) {
      sfxMineWin();
      setGamePhase('won');
      clearInterval(timerRef.current);
    }
  };

  const handleRightClick = (e, r, c) => {
    e.preventDefault();
    if (gamePhase === 'won' || gamePhase === 'lost') return;
    const cell = board[r][c];
    if (cell.revealed) return;
    const nb = board.map(row => row.map(c2 => ({ ...c2 })));
    nb[r][c].flagged = !nb[r][c].flagged;
    if (nb[r][c].flagged) sfxFlag(); else sfxUnflag();
    setBoard(nb);
    setFlagCount(f => nb[r][c].flagged ? f + 1 : f - 1);
  };

  const emoji = gamePhase === 'lost' ? '😵' : gamePhase === 'won' ? '😎' : '😊';

  const cellSize = useMemo(() => {
    if (difficulty === 'expert') return 'w-6 h-6 text-xs';
    if (difficulty === 'intermediate') return 'w-7 h-7 text-sm';
    return 'w-8 h-8 text-sm';
  }, [difficulty]);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start pt-6 px-2">
      <div className="w-full" style={{ maxWidth: difficulty === 'expert' ? '800px' : '400px' }}>
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
          <h1 className="text-xl font-bold">💣 Minesweeper</h1>
          <MuteBtn />
        </div>

        {/* Controls row */}
        <div className="flex items-center justify-between mb-3 gap-2 flex-wrap">
          <div className="flex gap-1">
            {Object.keys(MS_CONFIGS).map(d => (
              <button
                key={d}
                onClick={() => changeDifficulty(d)}
                className={`px-2 py-1 rounded text-xs capitalize ${difficulty === d ? 'bg-indigo-600' : 'bg-gray-700 hover:bg-gray-600'}`}
              >
                {d}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm">🚩 {config.mines - flagCount}</span>
            <button onClick={() => resetGame()} className="text-2xl hover:scale-110 transition-transform">{emoji}</button>
            <span className="text-sm">⏱ {time}s</span>
          </div>
        </div>

        {/* Board */}
        <div className="bg-gray-800 p-2 rounded-xl overflow-auto">
          <div className="inline-block">
            {board.map((row, r) => (
              <div key={r} className="flex">
                {row.map((cell, c) => {
                  let content = '';
                  let classes = `${cellSize} border border-gray-700 flex items-center justify-center cursor-pointer font-bold select-none `;
                  if (!cell.revealed) {
                    classes += 'bg-gray-600 hover:bg-gray-500 ';
                    if (cell.flagged) content = '🚩';
                  } else if (cell.mine) {
                    classes += 'bg-red-800 ';
                    content = '💣';
                  } else {
                    classes += 'bg-gray-800 ';
                    if (cell.neighborCount > 0) {
                      content = cell.neighborCount;
                      classes += NUM_COLORS[cell.neighborCount] + ' ';
                    }
                  }
                  return (
                    <div
                      key={c}
                      className={classes}
                      onClick={() => handleClick(r, c)}
                      onContextMenu={(e) => handleRightClick(e, r, c)}
                    >
                      {content}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
        </div>

        {(gamePhase === 'won' || gamePhase === 'lost') && (
          <div className="mt-4 text-center">
            <p className="text-xl font-bold mb-2">{gamePhase === 'won' ? '🎉 You Won!' : '💥 Game Over!'}</p>
            <button onClick={() => resetGame()} className="px-6 py-2 bg-indigo-600 hover:bg-indigo-500 rounded-lg font-semibold">Play Again</button>
          </div>
        )}
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────
// FLAPPY BIRD
// ─────────────────────────────────────────────
const GRAVITY = 0.5;
const FLAP_STRENGTH = -9;
const PIPE_SPEED = 3;
const PIPE_GAP = 150;
const PIPE_SPACING = 220;
const FB_W = 400;
const FB_H = 600;
const BIRD_X = 80;
const BIRD_R = 18;
const PIPE_W = 52;
const GROUND_H = 60;

function FlappyBird({ onBack }) {
  const canvasRef = useRef(null);
  const birdRef = useRef({ y: 250, vy: 0 });
  const pipesRef = useRef([]);
  const scoreRef = useRef(0);
  const hiRef = useRef(() => { try { return parseInt(localStorage.getItem('flappy-hi') || '0'); } catch { return 0; } });
  const stateRef = useRef('idle');
  const rafRef = useRef(null);
  const lastTimeRef = useRef(0);
  const passedRef = useRef(new Set());

  const [displayScore, setDisplayScore] = useState(0);
  const [displayHi, setDisplayHi] = useState(0);
  const [displayState, setDisplayState] = useState('idle');

  useEffect(() => {
    try { hiRef.current = parseInt(localStorage.getItem('flappy-hi') || '0'); } catch {}
    setDisplayHi(hiRef.current);
  }, []);

  const spawnPipe = useCallback(() => {
    const minGapY = PIPE_GAP / 2 + 30;
    const maxGapY = FB_H - GROUND_H - PIPE_GAP / 2 - 30;
    const gapY = minGapY + Math.random() * (maxGapY - minGapY);
    pipesRef.current.push({ x: FB_W + PIPE_W, gapY });
  }, []);

  const resetFlappy = useCallback(() => {
    birdRef.current = { y: 250, vy: 0 };
    pipesRef.current = [];
    scoreRef.current = 0;
    passedRef.current = new Set();
    setDisplayScore(0);
    spawnPipe();
  }, [spawnPipe]);

  const drawFrame = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = FB_W, H = FB_H;

    // Sky gradient
    const sky = ctx.createLinearGradient(0, 0, 0, H - GROUND_H);
    sky.addColorStop(0, '#87CEEB');
    sky.addColorStop(1, '#b0e0e6');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, W, H - GROUND_H);

    // Ground
    ctx.fillStyle = '#8B6914';
    ctx.fillRect(0, H - GROUND_H, W, GROUND_H);
    ctx.fillStyle = '#5a8a00';
    ctx.fillRect(0, H - GROUND_H, W, 12);

    // Pipes
    pipesRef.current.forEach(pipe => {
      const topH = pipe.gapY - PIPE_GAP / 2;
      const botY = pipe.gapY + PIPE_GAP / 2;
      const botH = H - GROUND_H - botY;

      ctx.fillStyle = '#22c55e';
      // Top pipe body
      ctx.fillRect(pipe.x, 0, PIPE_W, topH - 12);
      // Top pipe cap
      ctx.fillRect(pipe.x - 4, topH - 12, PIPE_W + 8, 12);

      // Bottom pipe body
      ctx.fillRect(pipe.x, botY + 12, PIPE_W, botH - 12);
      // Bottom pipe cap
      ctx.fillRect(pipe.x - 4, botY, PIPE_W + 8, 12);

      // Pipe highlight
      ctx.fillStyle = '#16a34a';
      ctx.fillRect(pipe.x + 4, 0, 8, topH - 12);
      ctx.fillRect(pipe.x + 4, botY + 12, 8, botH - 12);
    });

    // Bird
    const bird = birdRef.current;
    const angle = Math.min(Math.max(bird.vy * 0.05, -0.5), 1);
    ctx.save();
    ctx.translate(BIRD_X, bird.y);
    ctx.rotate(angle);

    // Body
    ctx.fillStyle = '#facc15';
    ctx.beginPath();
    ctx.arc(0, 0, BIRD_R, 0, Math.PI * 2);
    ctx.fill();

    // Wing
    ctx.fillStyle = '#fbbf24';
    ctx.beginPath();
    ctx.ellipse(-4, 6, 10, 6, -0.3, 0, Math.PI * 2);
    ctx.fill();

    // Eye
    ctx.fillStyle = 'white';
    ctx.beginPath();
    ctx.arc(8, -5, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#1e293b';
    ctx.beginPath();
    ctx.arc(10, -5, 3, 0, Math.PI * 2);
    ctx.fill();

    // Beak
    ctx.fillStyle = '#f97316';
    ctx.beginPath();
    ctx.moveTo(16, -2);
    ctx.lineTo(26, 2);
    ctx.lineTo(16, 6);
    ctx.closePath();
    ctx.fill();

    ctx.restore();

    // Score
    ctx.fillStyle = 'white';
    ctx.font = 'bold 32px sans-serif';
    ctx.textAlign = 'center';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 4;
    ctx.strokeText(scoreRef.current, W / 2, 50);
    ctx.fillText(scoreRef.current, W / 2, 50);

    // Hi-score
    ctx.font = '16px sans-serif';
    ctx.strokeText(`Best: ${hiRef.current}`, W / 2, 75);
    ctx.fillText(`Best: ${hiRef.current}`, W / 2, 75);

    if (stateRef.current === 'idle') {
      ctx.fillStyle = 'rgba(0,0,0,0.4)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Flappy Bird', W/2, H/2 - 40);
      ctx.font = '18px sans-serif';
      ctx.fillText('Click / Space to Flap', W/2, H/2 + 10);
    } else if (stateRef.current === 'dead') {
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white';
      ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center';
      ctx.fillText('Game Over!', W/2, H/2 - 50);
      ctx.font = '22px sans-serif';
      ctx.fillText(`Score: ${scoreRef.current}`, W/2, H/2);
      ctx.fillText(`Best: ${hiRef.current}`, W/2, H/2 + 35);
      ctx.font = '16px sans-serif';
      ctx.fillText('Click / Space to restart', W/2, H/2 + 70);
    }
  }, []);

  const gameLoop = useCallback((time) => {
    if (stateRef.current !== 'playing') { drawFrame(); return; }

    const bird = birdRef.current;
    bird.vy += GRAVITY;
    bird.y += bird.vy;

    // Move pipes
    pipesRef.current.forEach(p => { p.x -= PIPE_SPEED; });
    pipesRef.current = pipesRef.current.filter(p => p.x > -PIPE_W - 10);

    // Spawn pipes
    const lastPipe = pipesRef.current[pipesRef.current.length - 1];
    if (!lastPipe || lastPipe.x < FB_W - PIPE_SPACING) spawnPipe();

    // Score
    pipesRef.current.forEach((p, i) => {
      if (!passedRef.current.has(i) && p.x + PIPE_W < BIRD_X) {
        passedRef.current.add(i);
        sfxFlappyPoint();
        scoreRef.current++;
        setDisplayScore(scoreRef.current);
        if (scoreRef.current > hiRef.current) {
          hiRef.current = scoreRef.current;
          setDisplayHi(scoreRef.current);
          try { localStorage.setItem('flappy-hi', scoreRef.current); } catch {}
        }
      }
    });

    // Collision: ground/ceiling
    if (bird.y + BIRD_R >= FB_H - GROUND_H || bird.y - BIRD_R <= 0) {
      sfxFlappyHit();
      stateRef.current = 'dead';
      setDisplayState('dead');
      drawFrame();
      return;
    }

    // Collision: pipes
    for (const pipe of pipesRef.current) {
      if (BIRD_X + BIRD_R > pipe.x + 4 && BIRD_X - BIRD_R < pipe.x + PIPE_W - 4) {
        const topH = pipe.gapY - PIPE_GAP / 2;
        const botY = pipe.gapY + PIPE_GAP / 2;
        if (bird.y - BIRD_R < topH || bird.y + BIRD_R > botY) {
          sfxFlappyHit();
          stateRef.current = 'dead';
          setDisplayState('dead');
          drawFrame();
          return;
        }
      }
    }

    drawFrame();
    rafRef.current = requestAnimationFrame(gameLoop);
  }, [drawFrame, spawnPipe]);

  const flap = useCallback(() => {
    sfxFlap();
    if (stateRef.current === 'idle') {
      resetFlappy();
      stateRef.current = 'playing';
      setDisplayState('playing');
      birdRef.current.vy = FLAP_STRENGTH;
      rafRef.current = requestAnimationFrame(gameLoop);
    } else if (stateRef.current === 'playing') {
      birdRef.current.vy = FLAP_STRENGTH;
    } else if (stateRef.current === 'dead') {
      resetFlappy();
      stateRef.current = 'playing';
      setDisplayState('playing');
      birdRef.current.vy = FLAP_STRENGTH;
      cancelAnimationFrame(rafRef.current);
      rafRef.current = requestAnimationFrame(gameLoop);
    }
  }, [resetFlappy, gameLoop]);

  useEffect(() => {
    drawFrame();
  }, [drawFrame]);

  useEffect(() => {
    const handler = (e) => {
      if (e.code === 'Space') { e.preventDefault(); flap(); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [flap]);

  useEffect(() => {
    return () => cancelAnimationFrame(rafRef.current);
  }, []);

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center justify-start pt-6 px-4">
      <div className="w-full max-w-sm">
        <div className="flex items-center justify-between mb-4">
          <button onClick={onBack} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
          <h1 className="text-2xl font-bold">🐦 Flappy Bird</h1>
          <div className="flex items-center gap-2">
            <MuteBtn />
            <div className="text-right text-sm">
              <div className="text-gray-400">Best: {displayHi}</div>
            </div>
          </div>
        </div>

        <canvas
          ref={canvasRef}
          width={FB_W}
          height={FB_H}
          className="rounded-xl w-full cursor-pointer"
          onClick={flap}
          style={{ maxHeight: '70vh', objectFit: 'contain' }}
        />

        <div className="mt-4 flex justify-center">
          <button
            onClick={flap}
            className="px-10 py-4 bg-yellow-500 hover:bg-yellow-400 rounded-xl text-gray-900 font-bold text-lg active:scale-95 transition-transform"
          >
            FLAP
          </button>
        </div>
        <p className="text-center text-gray-500 text-xs mt-2">Space or Click to flap</p>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────
// SOCCER GAME  (5-a-side top-down, real rules, canvas-based)
// ─────────────────────────────────────────────────────────────────────────

// ── Constants ──────────────────────────────────────────────────────────────
const SC_W = 820, SC_H = 540;
const FX = 30, FY = 30, FW = 760, FH = 480;
const FCX = FX + FW / 2, FCY = FY + FH / 2;
const GOAL_H = 90, GOAL_D = 14;           // goal height, depth
const PEN_W = 110, PEN_H = 200;           // penalty box
const GOAL_BOX_W = 45, GOAL_BOX_H = 110; // six-yard box
const CENTER_R = 65;
const P_R = 11, BALL_R = 7;              // radii
const P_SPEED = 2.6, P_SPRINT = 4.0;
const GK_SPEED = 2.2;
const BALL_FRICTION = 0.982;
const KICK_POWER = 14, SHOT_POWER = 16, PASS_POWER = 10;
const TACKLE_RANGE = P_R + BALL_R + 3;
const HALF_SECS = 3 * 60; // 3-minute halves for quick games

// ── Helpers ────────────────────────────────────────────────────────────────
const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
const norm = (v) => { const m = Math.hypot(v.x, v.y); return m ? { x: v.x/m, y: v.y/m } : { x:0, y:0 }; };
const lerp = (a, b, t) => a + (b - a) * t;
const angleToGoal = (px, py, team) => {
  const gx = team === 'home' ? FX + FW + GOAL_D : FX - GOAL_D;
  const gy = FCY;
  return Math.atan2(gy - py, gx - px);
};

// Formation: home attacks right, away attacks left
// Positions are fractions of field (0..1)
const FORMATIONS = {
  home: [
    { role: 'gk',  bx: 0.04, by: 0.50 },
    { role: 'def', bx: 0.22, by: 0.25 },
    { role: 'def', bx: 0.22, by: 0.75 },
    { role: 'mid', bx: 0.45, by: 0.30 },
    { role: 'att', bx: 0.68, by: 0.50 },
  ],
  away: [
    { role: 'gk',  bx: 0.96, by: 0.50 },
    { role: 'def', bx: 0.78, by: 0.25 },
    { role: 'def', bx: 0.78, by: 0.75 },
    { role: 'mid', bx: 0.55, by: 0.70 },
    { role: 'att', bx: 0.32, by: 0.50 },
  ],
};

function makePlayers() {
  const players = [];
  for (const team of ['home', 'away']) {
    FORMATIONS[team].forEach((f, i) => {
      players.push({
        id: team[0] + i,
        team,
        role: f.role,
        number: i + 1,
        x: FX + f.bx * FW,
        y: FY + f.by * FH,
        vx: 0, vy: 0,
        bx: f.bx, by: f.by,   // base position fractions
        name: ['Keeper','Santos','Bruno','Diaz','Suarez','García','Mbappé','Kane','De Bruyne','Salah','Ronaldo'][i] || `P${i}`,
      });
    });
  }
  return players;
}

function makeBall(kickTeam = 'home') {
  return { x: FCX, y: FCY, vx: 0, vy: 0, lastTeam: null, lastId: null };
}

// Offside check: attacker must have >= 1 defender (not GK) behind them when ball is played
function isOffside(attacker, ball, defenders, attackDir) {
  if (attacker.role === 'gk') return false;
  // Only offside in opponent half
  const inOppHalf = attackDir === 'right' ? ball.x > FCX : ball.x < FCX;
  if (!inOppHalf) return false;
  // Second-to-last defender position
  const defX = defenders
    .filter(d => d.role !== 'gk')
    .map(d => d.x)
    .sort((a, b) => attackDir === 'right' ? b - a : a - b);
  const secondLastX = defX[0] ?? (attackDir === 'right' ? FX + FW : FX);
  return attackDir === 'right' ? attacker.x > secondLastX : attacker.x < secondLastX;
}

function SoccerGame({ onBack }) {
  const canvasRef = useRef(null);
  const rafRef = useRef(null);
  const lastTickRef = useRef(null);

  // All mutable game state in refs (no re-render overhead in game loop)
  const ballRef = useRef(makeBall());
  const playersRef = useRef(makePlayers());
  const gsRef = useRef({
    phase: 'pregame',    // pregame | kickoff | playing | dead_ball | halftime | fulltime
    half: 1,
    timeLeft: HALF_SECS,
    score: { home: 0, away: 0 },
    events: [],
    deadBall: null,       // { type, x, y, team } when in dead_ball
    kickoffTeam: 'home',
    controlledId: null,   // which home player human controls
    deadBallTimer: 0,     // countdown before AI takes dead ball
    offsideTimer: 0,
    goalTimer: 0,
    halftimeTimer: 0,
    cards: [],            // { id, team, type, minute }
  });
  const keysRef = useRef({ up:false, down:false, left:false, right:false, shoot:false, sprint:false });

  // React state for HUD (updated ~10× per second to avoid thrashing)
  const [hud, setHud] = useState({
    score: { home: 0, away: 0 },
    timeLeft: HALF_SECS,
    half: 1,
    phase: 'pregame',
    events: [],
    cards: [],
  });

  // ── Drawing ──────────────────────────────────────────────────────────────
  const draw = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const { W, H } = { W: SC_W, H: SC_H };
    const gs = gsRef.current;
    const ball = ballRef.current;
    const players = playersRef.current;

    // Background (stands)
    ctx.fillStyle = '#1a472a';
    ctx.fillRect(0, 0, W, H);

    // Field
    ctx.fillStyle = '#2d6a4f';
    ctx.fillRect(FX, FY, FW, FH);

    // Stripes
    for (let i = 0; i < 8; i++) {
      if (i % 2 === 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.05)';
        ctx.fillRect(FX + i * (FW / 8), FY, FW / 8, FH);
      }
    }

    // Field border
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = 2;
    ctx.strokeRect(FX, FY, FW, FH);

    // Halfway line
    ctx.beginPath(); ctx.moveTo(FCX, FY); ctx.lineTo(FCX, FY + FH); ctx.stroke();

    // Center circle
    ctx.beginPath(); ctx.arc(FCX, FCY, CENTER_R, 0, Math.PI * 2); ctx.stroke();
    ctx.beginPath(); ctx.arc(FCX, FCY, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();

    // Penalty areas
    for (const side of ['home', 'away']) {
      const x = side === 'home' ? FX : FX + FW - PEN_W;
      const y = FCY - PEN_H / 2;
      ctx.strokeRect(x, y, PEN_W, PEN_H);

      // Six-yard box
      const gx = side === 'home' ? FX : FX + FW - GOAL_BOX_W;
      ctx.strokeRect(gx, FCY - GOAL_BOX_H / 2, GOAL_BOX_W, GOAL_BOX_H);

      // Penalty spot
      const px = side === 'home' ? FX + 75 : FX + FW - 75;
      ctx.beginPath(); ctx.arc(px, FCY, 3, 0, Math.PI * 2); ctx.fillStyle = 'white'; ctx.fill();

      // Penalty arc
      ctx.beginPath();
      const arcAngle = Math.acos((PEN_W - 75) / CENTER_R);
      if (side === 'home') ctx.arc(px, FCY, CENTER_R, -arcAngle, arcAngle);
      else ctx.arc(px, FCY, CENTER_R, Math.PI - arcAngle, Math.PI + arcAngle);
      ctx.stroke();
    }

    // Goals
    for (const side of ['home', 'away']) {
      const gx = side === 'home' ? FX - GOAL_D : FX + FW;
      const gy = FCY - GOAL_H / 2;
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(gx, gy, GOAL_D, GOAL_H);
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 3;
      ctx.strokeRect(gx, gy, GOAL_D, GOAL_H);
      ctx.lineWidth = 2;
    }

    // Ball shadow
    ctx.beginPath();
    ctx.ellipse(ball.x + 2, ball.y + 3, BALL_R + 1, BALL_R - 1, 0, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fill();

    // Ball
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, BALL_R, 0, Math.PI * 2);
    ctx.fillStyle = 'white';
    ctx.fill();
    ctx.strokeStyle = '#333';
    ctx.lineWidth = 1;
    ctx.stroke();
    // Ball pattern (pentagon dots)
    [[0,-4],[3,3],[-3,3]].forEach(([dx,dy]) => {
      ctx.beginPath(); ctx.arc(ball.x+dx, ball.y+dy, 1.5, 0, Math.PI*2);
      ctx.fillStyle = '#333'; ctx.fill();
    });

    // Players
    players.forEach(p => {
      const isControlled = p.id === gs.controlledId;
      const isHome = p.team === 'home';
      const nearBall = dist(p, ball) < TACKLE_RANGE + 5;

      // Shadow
      ctx.beginPath(); ctx.ellipse(p.x+2, p.y+4, P_R, P_R-2, 0, 0, Math.PI*2);
      ctx.fillStyle = 'rgba(0,0,0,0.25)'; ctx.fill();

      // Body
      ctx.beginPath(); ctx.arc(p.x, p.y, P_R, 0, Math.PI*2);
      ctx.fillStyle = isHome ? '#3b82f6' : '#ef4444';
      ctx.fill();
      ctx.strokeStyle = isHome ? '#1d4ed8' : '#b91c1c';
      ctx.lineWidth = 2; ctx.stroke();

      // Inner circle (kit detail)
      ctx.beginPath(); ctx.arc(p.x, p.y, P_R - 4, 0, Math.PI*2);
      ctx.strokeStyle = isHome ? 'rgba(255,255,255,0.4)' : 'rgba(255,255,255,0.4)';
      ctx.lineWidth = 1; ctx.stroke();

      // Number
      ctx.fillStyle = 'white';
      ctx.font = `bold ${p.role === 'gk' ? 8 : 9}px sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(p.role === 'gk' ? 'GK' : p.number, p.x, p.y);

      // Controlled player indicator
      if (isControlled) {
        ctx.beginPath(); ctx.arc(p.x, p.y, P_R + 5, 0, Math.PI * 2);
        ctx.strokeStyle = '#facc15';
        ctx.lineWidth = 2;
        ctx.setLineDash([4, 3]);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      // Cards above player
      const myCards = gs.cards.filter(c => c.id === p.id);
      myCards.forEach((card, ci) => {
        ctx.fillStyle = card.type === 'yellow' ? '#facc15' : '#ef4444';
        ctx.fillRect(p.x - 4 + ci * 7, p.y - P_R - 12, 5, 7);
      });
    });

    // Dead ball indicators
    if (gs.phase === 'dead_ball' && gs.deadBall) {
      const db = gs.deadBall;
      ctx.beginPath();
      ctx.arc(db.x, db.y, 14, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(255,255,0,0.8)';
      ctx.lineWidth = 2;
      ctx.setLineDash([3, 3]);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = 'rgba(255,255,0,0.9)';
      ctx.font = 'bold 10px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      const label = db.type === 'corner' ? 'CK' : db.type === 'goal_kick' ? 'GK' : db.type === 'throw_in' ? 'TI' : 'FK';
      ctx.fillText(label, db.x, db.y - 20);
    }

    // Overlays
    if (gs.offsideTimer > 0) {
      ctx.fillStyle = 'rgba(239,68,68,0.85)';
      ctx.fillRect(FCX - 80, FCY - 20, 160, 40);
      ctx.fillStyle = 'white'; ctx.font = 'bold 18px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⛔ OFFSIDE', FCX, FCY);
    }

    if (gs.goalTimer > 0) {
      const alpha = Math.min(1, gs.goalTimer / 60);
      ctx.fillStyle = `rgba(0,0,0,${alpha * 0.5})`;
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = `rgba(250,204,21,${alpha})`;
      ctx.font = 'bold 64px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚽ GOAL!', FCX, FCY - 20);
      ctx.font = '24px sans-serif'; ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      const lastGoal = gs.events.filter(e => e.type === 'goal').slice(-1)[0];
      if (lastGoal) ctx.fillText(`${lastGoal.team === 'home' ? 'HOME' : 'AWAY'} ${lastGoal.score}`, FCX, FCY + 30);
    }

    if (gs.phase === 'pregame') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white'; ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('⚽ Soccer', FCX, FCY - 50);
      ctx.font = '18px sans-serif'; ctx.fillStyle = '#d1d5db';
      ctx.fillText('WASD / Arrow keys to move', FCX, FCY);
      ctx.fillText('Space = Shoot / Kick', FCX, FCY + 30);
      ctx.fillText('Shift = Sprint', FCX, FCY + 58);
      ctx.font = 'bold 20px sans-serif'; ctx.fillStyle = '#facc15';
      ctx.fillText('Press Space or Click to Kick Off!', FCX, FCY + 100);
    }

    if (gs.phase === 'halftime') {
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = 'white'; ctx.font = 'bold 32px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('HALF TIME', FCX, FCY - 30);
      ctx.font = '22px sans-serif'; ctx.fillStyle = '#facc15';
      ctx.fillText(`HOME ${gs.score.home}  –  ${gs.score.away} AWAY`, FCX, FCY + 10);
      ctx.font = '16px sans-serif'; ctx.fillStyle = '#9ca3af';
      ctx.fillText('Second half starting soon...', FCX, FCY + 45);
    }

    if (gs.phase === 'fulltime') {
      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.fillRect(0, 0, W, H);
      ctx.fillStyle = '#facc15'; ctx.font = 'bold 36px sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('FULL TIME', FCX, FCY - 60);
      ctx.font = '28px sans-serif'; ctx.fillStyle = 'white';
      ctx.fillText(`HOME  ${gs.score.home}  –  ${gs.score.away}  AWAY`, FCX, FCY - 10);
      const winner = gs.score.home > gs.score.away ? 'HOME WINS! 🏆' : gs.score.away > gs.score.home ? 'AWAY WINS! 🏆' : "IT'S A DRAW!";
      ctx.font = 'bold 22px sans-serif'; ctx.fillStyle = '#86efac';
      ctx.fillText(winner, FCX, FCY + 35);
      ctx.font = '15px sans-serif'; ctx.fillStyle = '#6b7280';
      ctx.fillText('Click "Play Again" to restart', FCX, FCY + 70);
    }
  }, []);

  // ── Physics update ─────────────────────────────────────────────────────
  const updateBall = useCallback(() => {
    const ball = ballRef.current;
    ball.x += ball.vx; ball.y += ball.vy;
    ball.vx *= BALL_FRICTION; ball.vy *= BALL_FRICTION;
    if (Math.abs(ball.vx) < 0.05) ball.vx = 0;
    if (Math.abs(ball.vy) < 0.05) ball.vy = 0;
    // Clamp to field bounds (will be overridden by boundary checks)
  }, []);

  // ── AI logic ───────────────────────────────────────────────────────────
  const updateAI = useCallback(() => {
    const ball = ballRef.current;
    const players = playersRef.current;
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;

    players.forEach(p => {
      if (p.id === gs.controlledId) return; // human controlled

      const isHome = p.team === 'home';
      const attackDir = isHome ? 'right' : 'left';
      const goalX = isHome ? FX + FW + GOAL_D / 2 : FX - GOAL_D / 2;
      const goalY = FCY;
      const myGoalX = isHome ? FX - GOAL_D / 2 : FX + FW + GOAL_D / 2;

      const teammates = players.filter(t => t.team === p.team && t.id !== p.id);
      const opponents = players.filter(t => t.team !== p.team);
      const nearestOpp = opponents.reduce((a, b) => dist(p, a) < dist(p, b) ? a : b, opponents[0]);

      let targetX = FX + p.bx * FW;
      let targetY = FY + p.by * FH;
      let speed = P_SPEED * 0.85;

      const ballDist = dist(p, ball);
      const hasBall = ballDist < TACKLE_RANGE;
      const teamHasBall = players.some(t => t.team === p.team && dist(t, ball) < TACKLE_RANGE);

      if (p.role === 'gk') {
        // GK: stay on goal line, move laterally to track ball
        const gkX = isHome ? FX + 18 : FX + FW - 18;
        targetX = gkX;
        targetY = clamp(ball.y, FCY - GOAL_H / 2 + P_R, FCY + GOAL_H / 2 - P_R);
        speed = GK_SPEED;
        // Rush out if ball entering penalty area
        const penX1 = isHome ? FX : FX + FW - PEN_W;
        const penX2 = isHome ? FX + PEN_W : FX + FW;
        const ballInPen = ball.x > penX1 && ball.x < penX2 && Math.abs(ball.y - FCY) < PEN_H / 2;
        if (ballInPen && !teamHasBall && ballDist < PEN_W * 0.7) {
          targetX = ball.x; targetY = ball.y; speed = GK_SPEED * 1.2;
          if (hasBall) {
            // Kick away from goal
            const angle = Math.atan2(ball.y - FCY, isHome ? ball.x - FX - 10 : ball.x - FX - FW + 10);
            ball.vx = Math.cos(angle) * KICK_POWER * (isHome ? 1 : -1);
            ball.vy = Math.sin(angle) * KICK_POWER + (Math.random() - 0.5) * 3;
            ball.lastTeam = p.team; ball.lastId = p.id;
            sfxSave();
          }
        }
      } else if (p.role === 'att') {
        if (hasBall) {
          // Shoot if in range, else dribble toward goal
          const distToGoal = Math.hypot(goalX - p.x, goalY - p.y);
          const inShootRange = isHome ? p.x > FX + FW * 0.55 : p.x < FX + FW * 0.45;
          if (inShootRange || distToGoal < 160) {
            const spread = (Math.random() - 0.5) * 0.4;
            const angle = Math.atan2(goalY - ball.y + spread * GOAL_H, goalX - ball.x);
            ball.vx = Math.cos(angle) * SHOT_POWER;
            ball.vy = Math.sin(angle) * SHOT_POWER + spread * 2;
            ball.lastTeam = p.team; ball.lastId = p.id;
            sfxKick();
          } else {
            targetX = goalX; targetY = goalY;
            speed = P_SPEED * 1.05;
          }
        } else if (teamHasBall) {
          // Make a run toward goal
          const runX = isHome ? clamp(p.x + 80, FX + FW * 0.5, FX + FW * 0.9) : clamp(p.x - 80, FX + FW * 0.1, FX + FW * 0.5);
          targetX = runX;
          targetY = clamp(p.by * FH + FY + (Math.random() - 0.5) * 30, FY + P_R, FY + FH - P_R);
        } else {
          // Press ball carrier
          targetX = ball.x; targetY = ball.y; speed = P_SPEED * 1.0;
        }
      } else if (p.role === 'mid') {
        if (hasBall) {
          // Pass to attacker or shoot
          const attacker = teammates.find(t => t.role === 'att');
          if (attacker && dist(attacker, { x: goalX, y: goalY }) < dist(p, { x: goalX, y: goalY })) {
            const angle = Math.atan2(attacker.y - ball.y, attacker.x - ball.x);
            ball.vx = Math.cos(angle) * PASS_POWER;
            ball.vy = Math.sin(angle) * PASS_POWER;
            ball.lastTeam = p.team; ball.lastId = p.id;
            sfxKick();
          } else {
            targetX = goalX; targetY = goalY; speed = P_SPEED;
          }
        } else {
          // Support play
          const supportX = isHome ? clamp(ball.x - 60, FX + FW * 0.25, FX + FW * 0.7) : clamp(ball.x + 60, FX + FW * 0.3, FX + FW * 0.75);
          targetX = supportX; targetY = clamp(ball.y + (Math.random()-0.5)*50, FY+P_R, FY+FH-P_R);
          if (!teamHasBall) { targetX = ball.x; targetY = ball.y; speed = P_SPEED * 0.9; }
        }
      } else if (p.role === 'def') {
        if (hasBall) {
          // Clear the ball forward or pass to mid
          const mid = teammates.find(t => t.role === 'mid');
          const angle = mid ? Math.atan2(mid.y - ball.y, mid.x - ball.x) : Math.atan2(goalY - ball.y, goalX - ball.x);
          ball.vx = Math.cos(angle) * PASS_POWER * 1.1;
          ball.vy = Math.sin(angle) * PASS_POWER * 1.1 + (Math.random()-0.5)*2;
          ball.lastTeam = p.team; ball.lastId = p.id;
          sfxKick();
        } else if (!teamHasBall) {
          // Defensive position: between ball and own goal
          const midX = (ball.x + myGoalX) / 2;
          const midY = (ball.y + FCY) / 2;
          targetX = clamp(midX, FX + FW * (isHome ? 0.05 : 0.5), FX + FW * (isHome ? 0.5 : 0.95));
          targetY = clamp(midY, FY + P_R, FY + FH - P_R);
          speed = P_SPEED * 0.85;
        } else {
          // Hold position
          targetX = FX + p.bx * FW;
          targetY = FY + p.by * FH;
        }
      }

      // Move toward target
      const dx = targetX - p.x, dy = targetY - p.y;
      const d = Math.hypot(dx, dy);
      if (d > 1) {
        p.vx = lerp(p.vx, (dx / d) * speed, 0.25);
        p.vy = lerp(p.vy, (dy / d) * speed, 0.25);
      } else {
        p.vx *= 0.7; p.vy *= 0.7;
      }

      // Apply velocity
      p.x = clamp(p.x + p.vx, FX + P_R, FX + FW - P_R);
      p.y = clamp(p.y + p.vy, FY + P_R, FY + FH - P_R);

      // AI tackle: if opponent has ball, challenge
      if (!teamHasBall && ballDist < TACKLE_RANGE && ball.lastTeam !== p.team) {
        // 35% chance to win tackle per frame when in range
        if (Math.random() < 0.06) {
          const angle = angleToGoal(ball.x, ball.y, p.team);
          ball.vx = Math.cos(angle) * (KICK_POWER * 0.6);
          ball.vy = Math.sin(angle) * (KICK_POWER * 0.6) + (Math.random() - 0.5) * 4;
          ball.lastTeam = p.team; ball.lastId = p.id;
          sfxTackle();
        }
      }
    });
  }, []);

  // ── Human player control ──────────────────────────────────────────────
  const updateHumanPlayer = useCallback(() => {
    const keys = keysRef.current;
    const gs = gsRef.current;
    const players = playersRef.current;
    const ball = ballRef.current;
    if (gs.phase !== 'playing') return;

    // Auto-select nearest home player to ball
    const homePlayers = players.filter(p => p.team === 'home');
    const nearest = homePlayers.reduce((a, b) => dist(a, ball) < dist(b, ball) ? a : b);
    gs.controlledId = nearest.id;
    const p = players.find(pl => pl.id === gs.controlledId);
    if (!p) return;

    const speed = (keys.sprint ? P_SPRINT : P_SPEED);
    let dx = 0, dy = 0;
    if (keys.up || keys.w) dy = -1;
    if (keys.down || keys.s) dy = 1;
    if (keys.left || keys.a) dx = -1;
    if (keys.right || keys.d) dx = 1;

    if (dx || dy) {
      const m = Math.hypot(dx, dy);
      p.vx = lerp(p.vx, (dx / m) * speed, 0.35);
      p.vy = lerp(p.vy, (dy / m) * speed, 0.35);
    } else {
      p.vx *= 0.7; p.vy *= 0.7;
    }

    p.x = clamp(p.x + p.vx, FX + P_R, FX + FW - P_R);
    p.y = clamp(p.y + p.vy, FY + P_R, FY + FH - P_R);

    // Shoot/kick
    if (keys.shoot) {
      const ballDist = dist(p, ball);
      if (ballDist < TACKLE_RANGE + 2) {
        const targetGoalX = FX + FW + GOAL_D / 2; // home attacks right
        const targetGoalY = FCY + (Math.random() - 0.5) * 30;
        const dx2 = targetGoalX - ball.x, dy2 = targetGoalY - ball.y;
        const power = ballDist < TACKLE_RANGE ? SHOT_POWER : KICK_POWER;
        const m2 = Math.hypot(dx2, dy2);
        ball.vx = (dx2 / m2) * power;
        ball.vy = (dy2 / m2) * power + (Math.random() - 0.5) * 2;
        ball.lastTeam = 'home'; ball.lastId = p.id;
        sfxKick();
      }
    }
  }, []);

  // ── Boundary & rules ───────────────────────────────────────────────────
  const checkBoundaries = useCallback(() => {
    const ball = ballRef.current;
    const gs = gsRef.current;
    const minute = Math.ceil(((HALF_SECS - gs.timeLeft) + (gs.half - 1) * HALF_SECS) / 60);

    // Check GOAL
    const inGoalY = ball.y > FCY - GOAL_H / 2 && ball.y < FCY + GOAL_H / 2;
    if (ball.x < FX && inGoalY) {
      // Away scores
      gs.score.away++;
      const scoreStr = `${gs.score.home}-${gs.score.away}`;
      gs.events.push({ type: 'goal', team: 'away', minute, score: scoreStr });
      gs.goalTimer = 120;
      sfxGoal();
      setTimeout(() => { sfxWhistle(); }, 800);
      resetToKickoff('home', gs);
      return;
    }
    if (ball.x > FX + FW && inGoalY) {
      // Home scores
      gs.score.home++;
      const scoreStr = `${gs.score.home}-${gs.score.away}`;
      gs.events.push({ type: 'goal', team: 'home', minute, score: scoreStr });
      gs.goalTimer = 120;
      sfxGoal();
      setTimeout(() => { sfxWhistle(); }, 800);
      resetToKickoff('away', gs);
      return;
    }

    // Sideline out (throw-in)
    if (ball.y < FY || ball.y > FY + FH) {
      const side = ball.y < FY ? FY + BALL_R + 1 : FY + FH - BALL_R - 1;
      const throwTeam = ball.lastTeam === 'home' ? 'away' : 'home';
      gs.phase = 'dead_ball';
      gs.deadBall = { type: 'throw_in', x: clamp(ball.x, FX + 10, FX + FW - 10), y: side, team: throwTeam };
      ball.x = gs.deadBall.x; ball.y = gs.deadBall.y; ball.vx = 0; ball.vy = 0;
      gs.deadBallTimer = 90;
      sfxWhistle();
      return;
    }

    // End-line out (corner or goal kick)
    if (ball.x < FX - BALL_R || ball.x > FX + FW + BALL_R) {
      const isLeft = ball.x < FX;
      // Which team was defending?
      const defendingTeam = isLeft ? 'home' : 'away';
      const attackingTeam = isLeft ? 'away' : 'home';
      if (ball.lastTeam === defendingTeam) {
        // Corner kick for attacking team
        const cx = isLeft ? FX + 5 : FX + FW - 5;
        const cy = ball.y < FCY ? FY + 5 : FY + FH - 5;
        gs.phase = 'dead_ball';
        gs.deadBall = { type: 'corner', x: cx, y: cy, team: attackingTeam };
        ball.x = cx; ball.y = cy; ball.vx = 0; ball.vy = 0;
        gs.deadBallTimer = 120;
        sfxWhistle();
      } else {
        // Goal kick for defending team
        const gkX = isLeft ? FX + 20 : FX + FW - 20;
        gs.phase = 'dead_ball';
        gs.deadBall = { type: 'goal_kick', x: gkX, y: clamp(ball.y, FCY - GOAL_BOX_H/2, FCY + GOAL_BOX_H/2), team: defendingTeam };
        ball.x = gs.deadBall.x; ball.y = gs.deadBall.y; ball.vx = 0; ball.vy = 0;
        gs.deadBallTimer = 90;
        sfxWhistle();
      }
      return;
    }

    // Offside check: only on passes/shots from own half
    if (gs.phase === 'playing' && ball.lastTeam) {
      const attackers = playersRef.current.filter(p => p.team === ball.lastTeam && p.role === 'att');
      const defenders = playersRef.current.filter(p => p.team !== ball.lastTeam && p.role !== 'gk');
      const attackDir = ball.lastTeam === 'home' ? 'right' : 'left';
      // Simplified: check if any attacker is past all non-GK defenders
      for (const att of attackers) {
        if (isOffside(att, ball, defenders, attackDir)) {
          gs.offsideTimer = 90;
          gs.phase = 'dead_ball';
          // Free kick to defenders
          const fkTeam = ball.lastTeam === 'home' ? 'away' : 'home';
          gs.deadBall = { type: 'free_kick', x: ball.x, y: ball.y, team: fkTeam };
          ball.vx = 0; ball.vy = 0;
          gs.deadBallTimer = 90;
          sfxWhistle();
          break;
        }
      }
    }
  }, []);

  // ── Dead ball execution (AI takes set pieces) ─────────────────────────
  const updateDeadBall = useCallback(() => {
    const gs = gsRef.current;
    const ball = ballRef.current;
    const players = playersRef.current;
    if (gs.phase !== 'dead_ball' || !gs.deadBall) return;

    gs.deadBallTimer--;
    if (gs.deadBallTimer <= 0) {
      const db = gs.deadBall;
      const isHuman = db.team === 'home';
      // AI or kickoff
      const goalX = db.team === 'home' ? FX + FW : FX;
      let angle;
      if (db.type === 'corner') {
        // Aim toward penalty area
        angle = Math.atan2(FCY - ball.y, (db.team === 'home' ? FX + FW * 0.85 : FX + FW * 0.15) - ball.x);
        ball.vx = Math.cos(angle) * PASS_POWER * 1.2;
        ball.vy = Math.sin(angle) * PASS_POWER * 1.2 + (Math.random() - 0.5) * 3;
      } else if (db.type === 'goal_kick') {
        angle = Math.atan2((Math.random()-0.5)*FH*0.5 + FCY - ball.y, goalX - ball.x);
        ball.vx = Math.cos(angle) * KICK_POWER * 1.2;
        ball.vy = Math.sin(angle) * KICK_POWER * 1.2;
      } else if (db.type === 'throw_in') {
        angle = Math.atan2(goalX - ball.x > 0 ? -30 : 30, goalX - ball.x);
        const atan = Math.atan2(FCY - ball.y, goalX - ball.x);
        ball.vx = Math.cos(atan) * PASS_POWER * 0.8;
        ball.vy = Math.sin(atan) * PASS_POWER * 0.8;
      } else {
        // free_kick
        angle = Math.atan2(FCY - ball.y + (Math.random()-0.5)*30, goalX - ball.x);
        ball.vx = Math.cos(angle) * KICK_POWER;
        ball.vy = Math.sin(angle) * KICK_POWER;
      }
      ball.lastTeam = db.team; ball.lastId = null;
      sfxKick();
      gs.phase = 'playing';
      gs.deadBall = null;
    }
  }, []);

  // ── Timer ──────────────────────────────────────────────────────────────
  const updateTimer = useCallback((dt) => {
    const gs = gsRef.current;
    if (gs.phase !== 'playing') return;
    gs.timeLeft -= dt;
    if (gs.goalTimer > 0) gs.goalTimer--;
    if (gs.offsideTimer > 0) gs.offsideTimer--;

    if (gs.timeLeft <= 0) {
      if (gs.half === 1) {
        gs.phase = 'halftime';
        gs.halftimeTimer = 180; // 3 seconds before second half
        gs.half = 2;
        sfxWhistle();
        setTimeout(() => {
          gs.timeLeft = HALF_SECS;
          gs.phase = 'kickoff';
          gs.kickoffTeam = 'away';
          resetToKickoff('away', gs);
          gsRef.current.phase = 'kickoff';
        }, 3000);
      } else {
        gs.phase = 'fulltime';
        sfxWhistle();
        setTimeout(() => sfxWhistle(), 400);
        setTimeout(() => sfxWhistle(), 800);
      }
    }
  }, []);

  // ── Reset helpers ─────────────────────────────────────────────────────
  function resetToKickoff(kickTeam, gs) {
    const players = playersRef.current;
    players.forEach(p => {
      p.x = FX + p.bx * FW; p.y = FY + p.by * FH;
      p.vx = 0; p.vy = 0;
    });
    ballRef.current = { x: FCX, y: FCY, vx: 0, vy: 0, lastTeam: null, lastId: null };
    gs.phase = 'kickoff';
    gs.kickoffTeam = kickTeam;
    gs.deadBall = null;
  }

  // ── Main game loop ─────────────────────────────────────────────────────
  const gameLoop = useCallback((ts) => {
    const gs = gsRef.current;

    const dt = lastTickRef.current ? Math.min((ts - lastTickRef.current) / 1000, 0.05) : 1/60;
    lastTickRef.current = ts;

    if (gs.phase === 'playing') {
      updateHumanPlayer();
      updateAI();
      updateBall();
      checkBoundaries();
      updateTimer(dt);
    } else if (gs.phase === 'dead_ball') {
      updateDeadBall();
    } else if (gs.phase === 'kickoff') {
      // Auto start kickoff after 1s
      updateHumanPlayer();
    }

    draw();

    // Update HUD every ~10 frames
    if (Math.random() < 0.1) {
      setHud({
        score: { ...gs.score },
        timeLeft: Math.max(0, Math.ceil(gs.timeLeft)),
        half: gs.half,
        phase: gs.phase,
        events: [...gs.events],
        cards: [...gs.cards],
      });
    }

    rafRef.current = requestAnimationFrame(gameLoop);
  }, [draw, updateHumanPlayer, updateAI, updateBall, checkBoundaries, updateTimer, updateDeadBall]);

  // ── Kickoff on space/click ────────────────────────────────────────────
  const startKickoff = useCallback(() => {
    const gs = gsRef.current;
    const ball = ballRef.current;
    if (gs.phase === 'pregame' || gs.phase === 'kickoff') {
      gs.phase = 'playing';
      // Kick ball slightly toward opponent
      ball.vx = gs.kickoffTeam === 'home' ? 3 : -3;
      ball.vy = (Math.random() - 0.5) * 2;
      ball.lastTeam = gs.kickoffTeam;
      sfxWhistle();
    }
  }, []);

  const resetGame = useCallback(() => {
    const gs = gsRef.current;
    const players = makePlayers();
    playersRef.current = players;
    ballRef.current = makeBall();
    gs.phase = 'pregame';
    gs.half = 1;
    gs.timeLeft = HALF_SECS;
    gs.score = { home: 0, away: 0 };
    gs.events = [];
    gs.deadBall = null;
    gs.kickoffTeam = 'home';
    gs.controlledId = null;
    gs.goalTimer = 0;
    gs.offsideTimer = 0;
    gs.cards = [];
    setHud({ score: { home: 0, away: 0 }, timeLeft: HALF_SECS, half: 1, phase: 'pregame', events: [], cards: [] });
  }, []);

  // ── Effects ───────────────────────────────────────────────────────────
  useEffect(() => {
    draw();
    rafRef.current = requestAnimationFrame(gameLoop);
    return () => cancelAnimationFrame(rafRef.current);
  }, [gameLoop, draw]);

  useEffect(() => {
    const down = (e) => {
      const k = keysRef.current;
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') { k.up = true; e.preventDefault(); }
      if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') { k.down = true; e.preventDefault(); }
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') { k.left = true; e.preventDefault(); }
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') { k.right = true; e.preventDefault(); }
      if (e.key === ' ') { k.shoot = true; startKickoff(); e.preventDefault(); }
      if (e.key === 'Shift') k.sprint = true;
    };
    const up = (e) => {
      const k = keysRef.current;
      if (e.key === 'ArrowUp'    || e.key === 'w' || e.key === 'W') k.up = false;
      if (e.key === 'ArrowDown'  || e.key === 's' || e.key === 'S') k.down = false;
      if (e.key === 'ArrowLeft'  || e.key === 'a' || e.key === 'A') k.left = false;
      if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') k.right = false;
      if (e.key === ' ') k.shoot = false;
      if (e.key === 'Shift') k.sprint = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [startKickoff]);

  // Format mm:ss
  const fmt = (s) => `${Math.floor(s/60).toString().padStart(2,'0')}:${(s%60).toString().padStart(2,'0')}`;

  return (
    <div className="min-h-screen bg-gray-950 text-white flex flex-col items-center pt-4 px-2">
      {/* Header */}
      <div className="w-full max-w-4xl flex items-center justify-between mb-3 px-1">
        <button onClick={onBack} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">← Back</button>
        <div className="flex items-center gap-6">
          {/* Score */}
          <div className="flex items-center gap-4 bg-gray-900 rounded-xl px-6 py-2">
            <div className="text-center">
              <div className="text-xs text-blue-400 font-semibold">🏠 HOME</div>
              <div className="text-3xl font-black tabular-nums">{hud.score.home}</div>
            </div>
            <div className="text-center text-gray-500">
              <div className="text-lg font-bold">–</div>
              <div className="text-xs text-gray-500">
                {hud.phase === 'fulltime' ? 'FT' : hud.phase === 'halftime' ? 'HT' : `${fmt(hud.timeLeft)}`}
              </div>
              <div className="text-xs text-gray-600">H{hud.half}</div>
            </div>
            <div className="text-center">
              <div className="text-xs text-red-400 font-semibold">AWAY 🛫</div>
              <div className="text-3xl font-black tabular-nums">{hud.score.away}</div>
            </div>
          </div>
        </div>
        <div className="flex gap-2">
          <MuteBtn />
          <button onClick={resetGame} className="px-3 py-2 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm">↺ Reset</button>
        </div>
      </div>

      {/* Canvas */}
      <canvas
        ref={canvasRef}
        width={SC_W}
        height={SC_H}
        className="rounded-xl w-full cursor-pointer"
        style={{ maxWidth: SC_W, maxHeight: '60vh', objectFit: 'contain' }}
        onClick={startKickoff}
      />

      {/* Controls hint + Events */}
      <div className="w-full max-w-4xl mt-3 flex gap-4 flex-wrap">
        {/* Controls */}
        <div className="bg-gray-900 rounded-xl px-4 py-3 text-xs text-gray-400 flex-1 min-w-48">
          <p className="font-semibold text-gray-200 mb-1">Controls</p>
          <p>🕹 <b>WASD</b> or <b>Arrow Keys</b> — Move</p>
          <p>⚡ <b>Space</b> — Shoot / Kick off</p>
          <p>💨 <b>Shift</b> — Sprint</p>
          <p className="mt-1 text-gray-500 italic">You control the nearest player to the ball (yellow ring)</p>
        </div>

        {/* Match events */}
        <div className="bg-gray-900 rounded-xl px-4 py-3 text-xs flex-1 min-w-48 max-h-28 overflow-y-auto">
          <p className="font-semibold text-gray-200 mb-1">Match Events</p>
          {hud.events.length === 0 && <p className="text-gray-600 italic">No events yet</p>}
          {[...hud.events].reverse().map((e, i) => (
            <div key={i} className={`flex gap-2 ${e.team === 'home' ? 'text-blue-400' : 'text-red-400'}`}>
              <span className="text-gray-500">{e.minute}&apos;</span>
              <span>{e.type === 'goal' ? '⚽ Goal!' : e.type === 'yellow' ? '🟨 Yellow Card' : '🟥 Red Card'}</span>
              <span className="text-gray-300 ml-auto">{e.score}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Full time play again */}
      {hud.phase === 'fulltime' && (
        <button onClick={resetGame} className="mt-4 px-8 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-semibold text-lg transition-colors">
          ▶ Play Again
        </button>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────
// MAIN PAGE
// ─────────────────────────────────────────────
export default function GamesPage() {
  const [activeGame, setActiveGame] = useState(null);

  const handleBack = useCallback(() => setActiveGame(null), []);

  if (activeGame === 'chess')       return <ChessGame onBack={handleBack} />;
  if (activeGame === '2048')        return <Game2048 onBack={handleBack} />;
  if (activeGame === 'snake')       return <SnakeGame onBack={handleBack} />;
  if (activeGame === 'minesweeper') return <Minesweeper onBack={handleBack} />;
  if (activeGame === 'flappy')      return <FlappyBird onBack={handleBack} />;
  if (activeGame === 'soccer')      return <SoccerGame onBack={handleBack} />;

  return <GameHub onSelect={setActiveGame} />;
}
