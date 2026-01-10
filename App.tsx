
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
  <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM9.555 7.168A1 1 0 008 8v4a1 1 0 001.555.832l3-2a1 1 0 000-1.664l-3-2z" clipRule="evenodd" /></svg>
);

const LOGICAL_WIDTH = 10;
const LOGICAL_HEIGHT = 15.0; 
const TRAY_Y_START = 11.5;

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [hasSession, setHasSession] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragOffset, setDragOffset] = useState<Point>({ x: 0, y: 0 });
  const scoreEffectsRef = useRef<ScoreEffect[]>([]);
  const requestRef = useRef<number>(0);

  const getScaleInfo = useCallback(() => {
    if (!canvasRef.current) return { scale: 1, offsetX: 0, offsetY: 0 };
    const rect = canvasRef.current.getBoundingClientRect();
    const scale = rect.width / LOGICAL_WIDTH;
    return { scale, offsetX: 0, offsetY: 0 };
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
      y: TRAY_Y_START + (3.0 - piece.shape.length) / 2
    };
  }, []);

  const checkGameOver = (state: GameState): boolean => {
    const remainingPieces = state.trayPieces.filter(p => p !== null);
    if (remainingPieces.length === 0) return false;
    return !remainingPieces.some(p => canPlaceAnywhere(state.grid, p!));
  };

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
    let addedScore = 0;
    if (linesCleared > 0) {
      addedScore = (linesCleared * linesCleared) * 100;
      if (combo > 0) addedScore *= 2;
    } else {
      addedScore = 10;
    }
    
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
    } else if (checkGameOver(nextState)) {
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
  };

  const animate = useCallback(() => {
    if (!gameState || gameState.screen !== 'playing' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const scale = rect.width / LOGICAL_WIDTH;
    const targetCanvasHeight = LOGICAL_HEIGHT * scale;
    
    if (canvas.width !== rect.width * dpr || canvas.height !== targetCanvasHeight * dpr) {
        canvas.width = rect.width * dpr;
        canvas.height = targetCanvasHeight * dpr;
    }

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, targetCanvasHeight);
    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, rect.width, GRID_SIZE * scale);
    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, TRAY_Y_START * scale, rect.width, 3.5 * scale);
    
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for(let i=0; i<=GRID_SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(i * scale, 0); ctx.lineTo(i * scale, GRID_SIZE * scale); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * scale); ctx.lineTo(GRID_SIZE * scale, i * scale); ctx.stroke();
    }

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
            ctx.fillStyle = '#0ea5e9'; ctx.font = `bold ${Math.max(12, scale * 0.58)}px sans-serif`; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(cell.char, (x + 0.5) * scale, (y + 0.5) * scale);
          } else {
            ctx.fillStyle = '#e2e8f0'; ctx.beginPath(); ctx.arc((x + 0.5) * scale, (y + 0.5) * scale, scale * 0.1, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    gameState.trayPieces.forEach((p, i) => {
      if (!p || gameState.activePieceIndex === i) return;
      const pos = getTrayPiecePos(i, p);
      ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((pos.x + px) * scale + 2, (pos.y + py) * scale + 2, scale - 4, scale - 4)));
    });

    if (gameState.activePieceIndex !== null) {
      const p = gameState.trayPieces[gameState.activePieceIndex]!;
      const pos = gameState.currentPiecePos;
      const snapX = Math.round(pos.x); const snapY = Math.round(pos.y);
      if (snapY < GRID_SIZE && snapX >= 0 && snapX <= GRID_SIZE - p.shape[0].length && snapY >= 0 && snapY <= GRID_SIZE - p.shape.length) {
        ctx.globalAlpha = 0.25; ctx.fillStyle = p.color;
        p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((snapX + px) * scale, (snapY + py) * scale, scale, scale)));
        ctx.globalAlpha = 1.0;
      }
      ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(14, 165, 233, 0.5)'; ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((pos.x + px) * scale + 1, (pos.y + py) * scale + 1, scale - 2, scale - 2)));
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.strokeRect((pos.x + px) * scale + 1, (pos.y + py) * scale + 1, scale - 2, scale - 2)));
    }

    scoreEffectsRef.current = scoreEffectsRef.current.filter(e => e.life > 0);
    scoreEffectsRef.current.forEach(e => {
        ctx.fillStyle = '#0ea5e9'; ctx.font = `bold ${scale * 0.4}px sans-serif`; ctx.globalAlpha = e.life; ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x * scale, (e.y - (1 - e.life) * 2) * scale); e.life -= 0.02;
    });

    ctx.restore();
    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, getTrayPiecePos]);

  useEffect(() => {
    if (gameState?.screen === 'playing') requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, gameState?.screen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (!gameState || gameState.screen !== 'playing' || gameState.isRoundClearing) return;
    const { scale } = getScaleInfo();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;

    // 1. First Check: Re-picking active piece from grid
    if (gameState.activePieceIndex !== null) {
      const p = gameState.trayPieces[gameState.activePieceIndex]!;
      const pos = gameState.currentPiecePos;
      // Define a small margin for easier picking
      const margin = 0.3;
      if (x >= pos.x - margin && x <= pos.x + p.shape[0].length + margin && 
          y >= pos.y - margin && y <= pos.y + p.shape.length + margin) {
        setIsDragging(true);
        setDragOffset({ x: x - pos.x, y: y - pos.y });
        try { (e.target as HTMLElement).setPointerCapture(e.pointerId); } catch(err){}
        return;
      }
    }

    // 2. Second Check: Picking a piece from tray
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
    const { scale } = getScaleInfo();
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX - rect.left) / scale;
    const y = (e.clientY - rect.top) / scale;
    setGameState({ ...gameState, currentPiecePos: { x: x - dragOffset.x, y: y - dragOffset.y } });
  };

  const handlePointerUp = () => {
    if (!isDragging || !gameState) return;
    setIsDragging(false);
    const p = gameState.trayPieces[gameState.activePieceIndex!];
    if (!p) return;
    const pos = gameState.currentPiecePos;
    if (pos.y < GRID_SIZE - 0.2) {
      setGameState({ ...gameState, currentPiecePos: { x: Math.round(pos.x), y: Math.round(pos.y) } });
    } else {
      setGameState({ ...gameState, currentPiecePos: getTrayPiecePos(gameState.activePieceIndex!, p) });
    }
  };

  if (!gameState) return <div className="fixed inset-0 bg-slate-900 flex items-center justify-center text-white text-xl font-bold">載入中...</div>;

  if (gameState.screen === 'menu') {
    return (
      <div className="min-h-screen bg-white flex flex-col items-center justify-center p-8 space-y-12">
        <button onClick={() => { 
          const nextLang: Language = gameState.language === 'en' ? 'zh' : 'en';
          localStorage.setItem('lang', nextLang);
          setGameState({...gameState, language: nextLang});
        }} className="absolute top-4 right-4 text-[10px] font-black text-sky-500 border-2 border-sky-500 px-3 py-1 rounded-full uppercase">{gameState.language === 'en' ? '中文' : 'English'}</button>
        <div className="text-center">
            <h1 className="text-5xl font-black text-sky-500 italic tracking-tighter uppercase mb-2 leading-none">{t.menu_title}</h1>
            <p className="text-slate-300 font-bold uppercase tracking-widest text-[10px]">{t.menu_subtitle}</p>
        </div>
        <div className="bg-slate-50 p-8 rounded-[3rem] w-full max-w-xs text-center border-2 border-slate-100">
            <span className="text-[10px] font-black text-slate-300 uppercase tracking-widest mb-1 block">{t.menu_record}</span>
            <span className="text-5xl font-black text-slate-400 leading-none">{gameState.highScore}</span>
        </div>
        <div className="flex flex-col w-full max-w-xs space-y-4">
            {hasSession && <button onClick={() => { const s = loadSession(); if(s) setGameState({...s, screen: 'playing'}); }} className="w-full bg-sky-50 text-sky-600 py-5 rounded-3xl font-black text-lg flex items-center justify-center gap-3 active:scale-95 border border-sky-100"><PlayIcon /> {t.btn_continue}</button>}
            <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-5 rounded-3xl font-black text-lg shadow-xl border-b-4 border-sky-700 active:translate-y-1 active:border-b-0 uppercase tracking-widest">{t.btn_new_game}</button>
        </div>
      </div>
    );
  }

  const currentVerse = SAMPLE_VERSES[gameState.currentVerseIndex];

  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-800 relative">
      <header className="flex-none bg-white flex justify-between items-center px-4 py-2 border-b border-slate-200 sticky top-0 z-40">
        <div className="flex flex-col"><span className="text-[8px] font-black text-slate-300 uppercase leading-none mb-1">{t.hud_high}</span><span className="text-xs font-black text-slate-400 leading-none">{gameState.highScore}</span></div>
        <div className="flex-1 flex flex-col items-center"><span className="text-[9px] font-black text-sky-500 uppercase leading-none mb-1">COMBO x{gameState.combo}</span><div className="text-[10px] font-black text-white bg-sky-500 px-3 py-0.5 rounded-full shadow-sm">{gameState.collectedIndices.size} / {currentVerse.text.length}</div></div>
        <div className="flex flex-col text-right"><span className="text-[8px] font-black text-slate-300 uppercase leading-none mb-1">{t.hud_score}</span><span className="text-xs font-black text-sky-500 leading-none">{gameState.score}</span></div>
      </header>
      
      <main className="flex-none w-full bg-slate-100 relative">
        <canvas 
          ref={canvasRef} 
          onPointerDown={handlePointerDown} 
          onPointerMove={handlePointerMove} 
          onPointerUp={handlePointerUp} 
          className="w-full block touch-none"
          style={{ height: 'auto', aspectRatio: '10/15' }}
        />
        {gameState.isRoundClearing && (
          <div className="absolute inset-0 z-30 bg-sky-500/10 backdrop-blur-md flex items-center justify-center">
            <div className="bg-white px-8 py-4 rounded-[2.5rem] shadow-2xl border-4 border-sky-500 animate-bounce text-xl font-black text-sky-500 uppercase italic">
              {t.victory_title}
            </div>
          </div>
        )}
      </main>

      <section className="flex-none px-6 py-3 bg-white border-y border-slate-100 min-h-[80px] flex flex-col items-center justify-center">
         <div className="flex flex-wrap justify-center gap-1 max-w-md">
            {currentVerse.text.split('').map((char, i) => { 
                const ok = gameState.collectedIndices.has(i) || gameState.isRoundClearing; 
                return <span key={i} className={`text-[16px] sm:text-[18px] font-black transition-all duration-700 ${ok ? 'text-sky-500 scale-105' : 'text-slate-100'}`}>{ok ? char : '□'}</span>; 
            })}
         </div>
         <p className="text-[8px] font-bold text-slate-300 italic mt-1">— {currentVerse.reference}</p>
      </section>

      <footer className="flex-none bg-white px-4 pt-3 pb-8 border-t border-slate-200">
        <div className="grid grid-cols-4 gap-2 max-w-lg mx-auto">
          <button onClick={() => { if(gameState.activePieceIndex!==null) { const p = gameState.trayPieces[gameState.activePieceIndex]!; const r = rotatePiece(p); const newTray = [...gameState.trayPieces]; newTray[gameState.activePieceIndex] = r; setGameState({...gameState, trayPieces: newTray}); } }} className="bg-slate-50 text-slate-500 p-2 rounded-[1.5rem] border border-slate-200 flex flex-col items-center justify-center active:scale-95"><RotateIcon /><span className="text-[7px] font-black uppercase mt-1">{t.btn_rotate}</span></button>
          <button onClick={placePiece} className="col-span-2 bg-sky-500 text-white p-2 rounded-[1.5rem] shadow-md border-b-2 border-sky-700 active:translate-y-0.5 active:border-b-0 flex flex-col items-center justify-center"><PlaceIcon /><span className="text-[9px] font-black uppercase mt-1">{t.btn_confirm}</span></button>
          <button onClick={() => { saveSession(gameState); setGameState({...gameState, screen: 'menu'}); }} className="bg-slate-50 text-slate-500 p-2 rounded-[1.5rem] border border-slate-200 flex flex-col items-center justify-center active:scale-95"><MenuIcon /><span className="text-[7px] font-black uppercase mt-1">{t.btn_home}</span></button>
        </div>
      </footer>

      {gameState.isGameOver && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-xl flex items-center justify-center p-6">
           <div className="bg-white w-full max-w-xs rounded-[3.5rem] p-8 text-center shadow-2xl border-2 border-white/50">
              <h2 className="text-2xl font-black text-sky-500 mb-1 italic uppercase leading-none">{t.game_over_title}</h2>
              <div className="my-6">
                <p className="text-slate-300 text-[9px] font-black uppercase mb-1">{t.game_over_final_score}</p>
                <p className="text-5xl font-black text-slate-800 tracking-tighter">{gameState.score}</p>
                {gameState.score >= gameState.highScore && <p className="text-sky-500 font-black text-[8px] mt-1 uppercase animate-pulse">{t.game_over_new_record}</p>}
              </div>
              <div className="space-y-2">
                <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-4 rounded-[1.5rem] font-black text-base shadow-lg border-b-2 border-sky-700 active:scale-95 uppercase">{t.btn_try_again}</button>
                <button onClick={() => { setGameState({...gameState, screen:'menu', isGameOver:false}); setHasSession(false); }} className="w-full bg-slate-100 text-slate-500 py-3 rounded-[1.5rem] font-black text-[10px] uppercase">{t.btn_main_menu}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
