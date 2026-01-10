
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GRID_SIZE, 
  SAMPLE_VERSES 
} from './constants';
import { 
  GameState, 
  Piece, 
  Point, 
  ScoreEffect,
  Language
} from './types';
import { 
  createEmptyGrid, 
  getRandomPiece, 
  rotatePiece, 
  checkCollision, 
  distributeVerse, 
  canPlaceAnywhere 
} from './services/gameLogic';
import { loadGameData, saveGameData, saveSession, loadSession, clearSession } from './services/storage';
import { getTranslation } from './services/i18n';

const RotateIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const PlaceIcon = () => (
  <svg className="w-7 h-7" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={4} d="M5 13l4 4L19 7" /></svg>
);
const MenuIcon = () => (
  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16m-7 6h7" /></svg>
);
const PlayIcon = () => (
  <svg className="w-8 h-8" fill="currentColor" viewBox="0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
);

// Logical Constants for Coordinate Mapping
const LOGICAL_WIDTH = 10;
const LOGICAL_BOARD_HEIGHT = 10;
const LOGICAL_TRAY_OFFSET = 10.5; // Gap between board and tray
const LOGICAL_TRAY_HEIGHT = 3;
const LOGICAL_TOTAL_HEIGHT = 14; // Board(10) + Gap(1) + Tray(3)

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const scoreEffectsRef = useRef<ScoreEffect[]>([]);
  const requestRef = useRef<number>(0);

  const getScaleInfo = useCallback(() => {
    if (!canvasRef.current) return { scale: 1, offsetX: 0, offsetY: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    // Scale is determined by the minimum of width/height constraints to ensure full visibility
    const scale = Math.min(rect.width / LOGICAL_WIDTH, rect.height / LOGICAL_TOTAL_HEIGHT);
    const offsetX = (rect.width - (LOGICAL_WIDTH * scale)) / 2;
    const offsetY = (rect.height - (LOGICAL_TOTAL_HEIGHT * scale)) / 2;
    return { scale, offsetX, offsetY };
  }, []);

  useEffect(() => {
    try {
      const session = loadSession();
      if (session) setHasSession(true);
      const saved = loadGameData();
      setGameState({
        screen: 'menu',
        score: 0,
        highScore: saved.highScore || 0,
        combo: 0,
        completedVerses: saved.completedVerses || [],
        currentVerseIndex: 0,
        grid: createEmptyGrid(),
        trayPieces: [null, null, null],
        activePieceIndex: null,
        currentPiecePos: { x: 0, y: 0 },
        isGameOver: false,
        collectedIndices: new Set<number>(),
        isRoundClearing: false,
        language: (localStorage.getItem('lang') as Language) || 'zh'
      });
    } catch (e) {
      console.error("Initialization failed", e);
    }
  }, []);

  const t = getTranslation(gameState?.language || 'zh');

  const getTrayPiecePos = useCallback((index: number, piece: Piece): Point => {
    const sectionWidth = LOGICAL_WIDTH / 3;
    const startX = index * sectionWidth;
    return {
      x: startX + (sectionWidth - piece.shape[0].length) / 2,
      y: LOGICAL_TRAY_OFFSET + (LOGICAL_TRAY_HEIGHT - piece.shape.length) / 2
    };
  }, []);

  const startNewGame = useCallback(() => {
    const saved = loadGameData();
    const verseIdx = Math.floor(Math.random() * SAMPLE_VERSES.length);
    const verse = SAMPLE_VERSES[verseIdx];
    const grid = createEmptyGrid();
    distributeVerse(grid, verse.text);
    const tray = [getRandomPiece(), getRandomPiece(), getRandomPiece()];

    setGameState(prev => {
      if (!prev) return null;
      const newState: GameState = {
        ...prev,
        screen: 'playing',
        score: 0,
        highScore: saved.highScore,
        combo: 0,
        currentVerseIndex: verseIdx,
        grid: grid,
        trayPieces: tray,
        activePieceIndex: null,
        currentPiecePos: { x: 0, y: 0 },
        isGameOver: false,
        collectedIndices: new Set<number>(),
        isRoundClearing: false,
      };
      saveSession(newState);
      return newState;
    });
    setHasSession(true);
    scoreEffectsRef.current = [];
  }, []);

  const placePiece = () => {
    if (!gameState || isDragging || gameState.isRoundClearing || gameState.activePieceIndex === null) return;
    const { trayPieces, activePieceIndex, currentPiecePos, grid, score, combo, collectedIndices, currentVerseIndex, highScore } = gameState;
    const currentPiece = trayPieces[activePieceIndex];
    if (!currentPiece) return;

    const snapX = Math.round(currentPiecePos.x);
    const snapY = Math.round(currentPiecePos.y);

    if (snapY < 0 || snapY > GRID_SIZE - currentPiece.shape.length || 
        snapX < 0 || snapX > GRID_SIZE - currentPiece.shape[0].length || 
        checkCollision(grid, currentPiece, { x: snapX, y: snapY })) {
      // Return to tray if placement invalid
      setGameState({ 
        ...gameState, 
        currentPiecePos: getTrayPiecePos(activePieceIndex, currentPiece),
        activePieceIndex: null 
      });
      return;
    }

    const newGrid = grid.map(row => row.map(cell => ({ ...cell })));
    currentPiece.shape.forEach((row, py) => {
      row.forEach((value, px) => {
        if (value) {
          const gx = snapX + px;
          const gy = snapY + py;
          newGrid[gy][gx].filled = true;
          newGrid[gy][gx].color = currentPiece.color;
        }
      });
    });

    const rowsToRemove: number[] = [];
    const colsToRemove: number[] = [];
    for (let y = 0; y < GRID_SIZE; y++) if (newGrid[y].every(c => c.filled)) rowsToRemove.push(y);
    for (let x = 0; x < GRID_SIZE; x++) {
      let full = true;
      for (let y = 0; y < GRID_SIZE; y++) if (!newGrid[y][x].filled) { full = false; break; }
      if (full) colsToRemove.push(x);
    }

    const collectedInThisTurn = new Set<number>();
    rowsToRemove.forEach(y => {
      for (let x = 0; x < GRID_SIZE; x++) {
        if (newGrid[y][x].charIndex !== null && !newGrid[y][x].collected) {
          newGrid[y][x].collected = true;
          collectedInThisTurn.add(newGrid[y][x].charIndex!);
        }
        newGrid[y][x].filled = false;
      }
    });
    colsToRemove.forEach(x => {
      for (let y = 0; y < GRID_SIZE; y++) {
        if (newGrid[y][x].charIndex !== null && !newGrid[y][x].collected) {
          newGrid[y][x].collected = true;
          collectedInThisTurn.add(newGrid[y][x].charIndex!);
        }
        newGrid[y][x].filled = false;
      }
    });

    const linesCleared = rowsToRemove.length + colsToRemove.length;
    let addedScore = linesCleared > 0 ? (linesCleared * linesCleared) * 100 : 10;
    if (combo > 0 && linesCleared > 0) addedScore *= 2;
    
    const newScore = score + addedScore;
    const newCombo = linesCleared > 0 ? combo + 1 : 0;
    
    if (linesCleared > 0) {
      scoreEffectsRef.current.push({
        id: Date.now(),
        x: snapX + currentPiece.shape[0].length / 2,
        y: snapY + currentPiece.shape.length / 2,
        text: `+${addedScore}${newCombo > 1 ? ` (COMBO x2!)` : ''}`,
        life: 1.0
      });
    }

    const newTray = [...trayPieces];
    newTray[activePieceIndex] = null;
    const isTrayEmpty = newTray.every(p => p === null);
    const finalTray = isTrayEmpty ? [getRandomPiece(), getRandomPiece(), getRandomPiece()] : newTray;
    const newCollectedIndices = new Set([...Array.from(collectedIndices), ...Array.from(collectedInThisTurn)]);
    const currentVerseText = SAMPLE_VERSES[currentVerseIndex].text;

    const nextState: GameState = {
      ...gameState,
      score: newScore,
      combo: newCombo,
      grid: newGrid,
      trayPieces: finalTray,
      activePieceIndex: null,
      collectedIndices: newCollectedIndices,
    };

    if (newCollectedIndices.size >= currentVerseText.length) {
      setGameState({ ...nextState, isRoundClearing: true });
      setTimeout(() => {
         setGameState(prev => {
           if (!prev) return null;
           const verseIdx = Math.floor(Math.random() * SAMPLE_VERSES.length);
           const verse = SAMPLE_VERSES[verseIdx];
           const updatedGrid = prev.grid.map(row => row.map(cell => ({ ...cell })));
           distributeVerse(updatedGrid, verse.text);
           const s: GameState = { ...prev, currentVerseIndex: verseIdx, grid: updatedGrid, collectedIndices: new Set<number>(), isRoundClearing: false };
           saveSession(s);
           return s;
         });
      }, 2000);
    } else {
      const remainingPieces = finalTray.filter(p => p !== null);
      if (remainingPieces.length > 0 && !remainingPieces.some(p => canPlaceAnywhere(newGrid, p!))) {
        let finalHighScore = highScore;
        if (newScore > highScore) {
          finalHighScore = newScore;
          saveGameData({ highScore: finalHighScore });
        }
        setGameState({ ...nextState, highScore: finalHighScore, isGameOver: true });
        clearSession();
        setHasSession(false);
      } else {
        setGameState(nextState);
        saveSession(nextState);
      }
    }
  };

  const animate = useCallback(() => {
    if (!gameState || gameState.screen !== 'playing' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = getScaleInfo();
    
    if (canvas.width !== rect.width * dpr || canvas.height !== rect.height * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);
    ctx.translate(offsetX, offsetY);

    // Draw Board Background
    ctx.fillStyle = '#f8fafc'; 
    ctx.fillRect(0, 0, LOGICAL_WIDTH * scale, LOGICAL_BOARD_HEIGHT * scale);
    
    // Draw Grid Lines
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for(let i=0; i<=GRID_SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(i * scale, 0); ctx.lineTo(i * scale, LOGICAL_BOARD_HEIGHT * scale); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * scale); ctx.lineTo(LOGICAL_WIDTH * scale, i * scale); ctx.stroke();
    }

    // Draw Tray Background
    ctx.fillStyle = '#f1f5f9';
    ctx.fillRect(0, LOGICAL_TRAY_OFFSET * scale, LOGICAL_WIDTH * scale, LOGICAL_TRAY_HEIGHT * scale);

    // Draw Grid Cells
    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = gameState.grid[y][x];
        if (cell.filled) {
          ctx.fillStyle = cell.color || '#cbd5e1';
          ctx.fillRect(x * scale + 1, y * scale + 1, scale - 2, scale - 2);
        }
        if (cell.char) {
          const ok = cell.collected || gameState.isRoundClearing;
          if (ok) {
            ctx.fillStyle = '#0ea5e9'; 
            ctx.font = `bold ${Math.max(12, scale * 0.55)}px sans-serif`; 
            ctx.textAlign = 'center'; 
            ctx.textBaseline = 'middle';
            ctx.fillText(cell.char, (x + 0.5) * scale, (y + 0.5) * scale);
          } else {
            ctx.fillStyle = '#e2e8f0'; 
            ctx.beginPath(); ctx.arc((x + 0.5) * scale, (y + 0.5) * scale, scale * 0.1, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    // Draw Tray Pieces
    gameState.trayPieces.forEach((p, i) => {
      if (!p || gameState.activePieceIndex === i) return;
      const pos = getTrayPiecePos(i, p);
      ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((pos.x + px) * scale + 2, (pos.y + py) * scale + 2, scale - 4, scale - 4)));
    });

    // Draw Active Piece (Floating)
    if (gameState.activePieceIndex !== null) {
      const p = gameState.trayPieces[gameState.activePieceIndex]!;
      const pos = gameState.currentPiecePos;
      const snapX = Math.round(pos.x); const snapY = Math.round(pos.y);
      
      // Draw ghost snap position on grid
      if (snapY < GRID_SIZE && snapX >= 0 && snapX <= GRID_SIZE - p.shape[0].length && snapY >= 0 && snapY <= GRID_SIZE - p.shape.length) {
        ctx.globalAlpha = 0.25; ctx.fillStyle = p.color;
        p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((snapX + px) * scale, (snapY + py) * scale, scale, scale)));
        ctx.globalAlpha = 1.0;
      }
      
      // Draw actual floating piece
      ctx.shadowBlur = 10; ctx.shadowColor = 'rgba(0,0,0,0.2)'; ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((pos.x + px) * scale + 1, (pos.y + py) * scale + 1, scale - 2, scale - 2)));
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.strokeRect((pos.x + px) * scale + 1, (pos.y + py) * scale + 1, scale - 2, scale - 2)));
    }

    // Draw Score Effects
    scoreEffectsRef.current = scoreEffectsRef.current.filter(e => e.life > 0);
    scoreEffectsRef.current.forEach(e => {
        ctx.fillStyle = '#0ea5e9'; ctx.font = `bold ${scale * 0.4}px sans-serif`; ctx.globalAlpha = e.life; ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x * scale, (e.y - (1 - e.life) * 2) * scale); e.life -= 0.02;
    });

    ctx.restore();
    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, getTrayPiecePos, getScaleInfo]);

  useEffect(() => {
    if (gameState?.screen === 'playing') requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, gameState?.screen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!gameState || gameState.screen !== 'playing' || gameState.isRoundClearing) return;
    const { scale, offsetX, offsetY } = getScaleInfo();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left - offsetX) / scale;
    const y = (e.clientY - rect.top - offsetY) / scale;

    // Check 1: Re-picking active piece on grid
    if (gameState.activePieceIndex !== null) {
      const p = gameState.trayPieces[gameState.activePieceIndex]!;
      const pos = gameState.currentPiecePos;
      const margin = 0.5;
      if (x >= pos.x - margin && x <= pos.x + p.shape[0].length + margin && 
          y >= pos.y - margin && y <= pos.y + p.shape.length + margin) {
        setIsDragging(true); setDragOffset({ x: x - pos.x, y: y - pos.y });
        try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch(err){}
        return;
      }
    }

    // Check 2: Picking from tray
    let trayIdx: number | null = null;
    gameState.trayPieces.forEach((p, i) => {
      if (!p) return;
      const pos = getTrayPiecePos(i, p);
      if (x >= pos.x - 0.3 && x <= pos.x + p.shape[0].length + 0.3 && y >= pos.y - 0.3 && y <= pos.y + p.shape.length + 0.3) trayIdx = i;
    });

    if (trayIdx !== null) {
      const p = gameState.trayPieces[trayIdx]!; const pos = getTrayPiecePos(trayIdx, p);
      setIsDragging(true); setDragOffset({ x: x - pos.x, y: y - pos.y });
      setGameState({ ...gameState, activePieceIndex: trayIdx, currentPiecePos: pos });
      try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch(err){}
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !gameState || gameState.activePieceIndex === null) return;
    const { scale, offsetX, offsetY } = getScaleInfo();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = (e.clientX - rect.left - offsetX) / scale;
    const y = (e.clientY - rect.top - offsetY) / scale;
    setGameState({ ...gameState, currentPiecePos: { x: x - dragOffset.x, y: y - dragOffset.y } });
  };

  const handlePointerUp = () => {
    if (!isDragging || !gameState) return;
    setIsDragging(false);
    const p = gameState.trayPieces[gameState.activePieceIndex!];
    if (!p) return;
    const pos = gameState.currentPiecePos;
    // Snap to grid if it's over the board, otherwise keep current floating position for re-dragging
    if (pos.y < GRID_SIZE - 0.2) {
      setGameState({ ...gameState, currentPiecePos: { x: Math.round(pos.x), y: Math.round(pos.y) } });
    }
  };

  if (!gameState) return <div className="fixed inset-0 bg-white flex items-center justify-center text-sky-500 text-xl font-bold">載入中...</div>;

  if (gameState.screen === 'menu') {
    return (
      <div className="flex-1 bg-white flex flex-col items-center justify-center p-8 space-y-8 overflow-y-auto">
        <button onClick={() => { 
          const nextLang: Language = gameState.language === 'en' ? 'zh' : 'en';
          localStorage.setItem('lang', nextLang);
          setGameState({...gameState, language: nextLang});
        }} className="absolute top-4 right-4 text-[10px] font-black text-sky-500 border-2 border-sky-500 px-3 py-1 rounded-full uppercase">{gameState.language === 'en' ? '中文' : 'English'}</button>
        <div className="text-center">
            <h1 className="text-5xl font-black text-sky-500 italic tracking-tighter uppercase mb-2 leading-none">聖經方塊</h1>
            <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px]">{t.menu_subtitle}</p>
        </div>
        <div className="bg-slate-50 p-6 rounded-[3rem] w-full max-w-xs text-center border-2 border-slate-100">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 block">{t.menu_record}</span>
            <span className="text-5xl font-black text-slate-400 leading-none">{gameState.highScore}</span>
        </div>
        <div className="flex flex-col w-full max-w-xs space-y-4">
            {hasSession && <button onClick={() => { const s = loadSession(); if(s) setGameState({...s, screen: 'playing'}); }} className="w-full bg-sky-50 text-sky-600 py-4 rounded-3xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 border border-sky-100"><PlayIcon /> {t.btn_continue}</button>}
            <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-5 rounded-3xl font-black text-lg shadow-xl border-b-4 border-sky-700 active:translate-y-1 active:border-b-0 uppercase tracking-widest">{t.btn_new_game}</button>
        </div>
      </div>
    );
  }

  const currentVerse = SAMPLE_VERSES[gameState.currentVerseIndex];

  return (
    <div className="flex-1 flex flex-col h-full bg-white relative overflow-hidden">
      {/* Header: 10dvh */}
      <header className="h-[10dvh] flex-none bg-white flex justify-between items-center px-4 border-b border-slate-100">
        <div className="flex flex-col"><span className="text-[8px] font-black text-slate-300 uppercase leading-none">{t.hud_high}</span><span className="text-xs font-black text-slate-400 leading-none">{gameState.highScore}</span></div>
        <div className="flex-1 flex flex-col items-center"><span className="text-[9px] font-black text-sky-500 uppercase leading-none">COMBO x{gameState.combo}</span><div className="text-[10px] font-black text-white bg-sky-500 px-3 py-0.5 rounded-full shadow-sm">{gameState.collectedIndices.size}/{currentVerse.text.length}</div></div>
        <div className="flex flex-col text-right"><span className="text-[8px] font-black text-slate-300 uppercase leading-none">{t.hud_score}</span><span className="text-xs font-black text-sky-500 leading-none">{gameState.score}</span></div>
      </header>
      
      {/* Interaction Area (Board + Tray): 50dvh + 15dvh = 65dvh */}
      <main className="h-[65dvh] flex-none bg-slate-50 relative flex items-center justify-center overflow-hidden">
        <canvas 
          ref={canvasRef} 
          onPointerDown={handlePointerDown} 
          onPointerMove={handlePointerMove} 
          onPointerUp={handlePointerUp} 
          className="w-full h-full block touch-none"
        />
        {gameState.isRoundClearing && (
          <div className="absolute inset-0 z-30 bg-sky-500/10 backdrop-blur-sm flex items-center justify-center">
            <div className="bg-white px-8 py-4 rounded-[2rem] shadow-2xl border-4 border-sky-500 animate-bounce text-xl font-black text-sky-500 uppercase italic">
              {t.victory_title}
            </div>
          </div>
        )}
      </main>

      {/* Verse Area: 15dvh */}
      <section className="h-[15dvh] flex-none px-6 bg-white flex flex-col items-center justify-center overflow-hidden border-t border-slate-50">
         <div className="flex flex-wrap justify-center gap-1 max-w-md overflow-y-auto">
            {currentVerse.text.split('').map((char, i) => { 
                const ok = gameState.collectedIndices.has(i) || gameState.isRoundClearing; 
                return <span key={i} className={`text-[15px] sm:text-[18px] font-black transition-all duration-500 ${ok ? 'text-sky-500 scale-105' : 'text-slate-100'}`}>{ok ? char : '□'}</span>; 
            })}
         </div>
         <p className="text-[8px] font-bold text-slate-300 italic mt-1 line-clamp-1">— {currentVerse.reference}</p>
      </section>

      {/* Footer / Buttons: 10dvh */}
      <footer className="h-[10dvh] flex-none bg-white px-4 flex items-center border-t border-slate-100">
        <div className="grid grid-cols-4 gap-2 w-full max-w-lg mx-auto">
          <button onClick={() => { if(gameState.activePieceIndex!==null) { const p = gameState.trayPieces[gameState.activePieceIndex]!; const r = rotatePiece(p); const newTray = [...gameState.trayPieces]; newTray[gameState.activePieceIndex] = r; setGameState({...gameState, trayPieces: newTray}); } }} className="h-10 bg-slate-50 text-slate-500 rounded-2xl border border-slate-200 flex flex-col items-center justify-center active:scale-95"><RotateIcon /><span className="text-[6px] font-black uppercase">{t.btn_rotate}</span></button>
          <button onClick={placePiece} className="h-12 col-span-2 bg-sky-500 text-white rounded-2xl shadow-md border-b-4 border-sky-700 active:translate-y-0.5 active:border-b-0 flex flex-col items-center justify-center"><PlaceIcon /><span className="text-[8px] font-black uppercase">{t.btn_confirm}</span></button>
          <button onClick={() => { saveSession(gameState); setGameState({...gameState, screen: 'menu'}); }} className="h-10 bg-slate-50 text-slate-500 rounded-2xl border border-slate-200 flex flex-col items-center justify-center active:scale-95"><MenuIcon /><span className="text-[6px] font-black uppercase">{t.btn_home}</span></button>
        </div>
      </footer>

      {gameState.isGameOver && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-md flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-xs rounded-[3rem] p-8 text-center shadow-2xl">
              <h2 className="text-2xl font-black text-sky-500 mb-1 italic uppercase">{t.game_over_title}</h2>
              <div className="my-6">
                <p className="text-slate-300 text-[9px] font-black uppercase mb-1">{t.game_over_final_score}</p>
                <p className="text-5xl font-black text-slate-800 tracking-tighter">{gameState.score}</p>
              </div>
              <div className="space-y-2">
                <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-4 rounded-[1.5rem] font-black text-base shadow-lg active:scale-95 uppercase tracking-widest">{t.btn_try_again}</button>
                <button onClick={() => { setGameState({...gameState, screen:'menu', isGameOver:false}); setHasSession(false); }} className="w-full bg-slate-100 text-slate-400 py-3 rounded-[1.5rem] font-black text-[10px] uppercase">{t.btn_main_menu}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
