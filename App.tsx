
import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  GRID_SIZE, 
  BASE_SCORE, 
  SAMPLE_VERSES 
} from './constants';
import { 
  GameState, 
  CellData, 
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
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
);
const PlaceIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" /></svg>
);
const MenuIcon = () => (
  <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M4 6h16M4 12h16m-7 6h7" /></svg>
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

  useEffect(() => {
    const session = loadSession();
    if (session) setHasSession(true);
    const saved = loadGameData();
    setGameState({
      screen: 'menu',
      score: 0,
      highScore: saved.highScore,
      combo: 0,
      completedVerses: saved.completedVerses,
      currentVerseIndex: 0,
      grid: createEmptyGrid(),
      trayPieces: [null, null, null],
      activePieceIndex: null,
      currentPiecePos: { x: 0, y: 0 },
      isGameOver: false,
      collectedIndices: new Set(),
      isRoundClearing: false,
      language: (localStorage.getItem('lang') as Language) || 'zh'
    });
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
    const canPlace = remainingPieces.some(p => canPlaceAnywhere(state.grid, p!));
    return !canPlace;
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
        collectedIndices: new Set(),
        isRoundClearing: false,
      };
      saveSession(newState);
      return newState;
    });
    setHasSession(true);
    scoreEffectsRef.current = [];
  }, []);

  const proceedToNextVerse = useCallback(() => {
    setGameState(prev => {
      if (!prev) return null;
      const verseIdx = Math.floor(Math.random() * SAMPLE_VERSES.length);
      const verse = SAMPLE_VERSES[verseIdx];
      const newGrid = prev.grid.map(row => row.map(cell => ({ ...cell })));
      distributeVerse(newGrid, verse.text);
      
      const nextState: GameState = {
        ...prev,
        currentVerseIndex: verseIdx,
        grid: newGrid,
        collectedIndices: new Set(),
        isRoundClearing: false,
      };
      saveSession(nextState);
      return nextState;
    });
  }, []);

  const continueGame = useCallback(() => {
    const session = loadSession();
    if (session) {
      setGameState({ ...session, screen: 'playing' });
      scoreEffectsRef.current = [];
    }
  }, []);

  const goToMenu = useCallback(() => {
    if (gameState) {
      saveSession(gameState);
      setGameState({ ...gameState, screen: 'menu' });
    }
  }, [gameState]);

  const toggleLanguage = () => {
    setGameState(prev => {
      if (!prev) return null;
      const nextLang: Language = prev.language === 'en' ? 'zh' : 'en';
      localStorage.setItem('lang', nextLang);
      return { ...prev, language: nextLang };
    });
  };

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
    
    // VERIFIED SCORING LOGIC:
    // 1 line: 100, 2 lines: 400, 3 lines: 900, 4 lines: 1600 (N^2 * 100)
    // If combo > 0 (continuous clears), score is doubled.
    let addedScore = 0;
    if (linesCleared > 0) {
      addedScore = (linesCleared * linesCleared) * 100;
      if (combo > 0) {
        addedScore *= 2;
      }
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
        text: `+${addedScore}${newCombo > 1 ? ` (x${newCombo}!)` : ''}`,
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
      saveSession({ ...nextState, isRoundClearing: true });
      setTimeout(proceedToNextVerse, 2000);
    } else {
      if (checkGameOver(nextState)) {
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

  const rotate = () => {
    if (!gameState || gameState.isRoundClearing || gameState.activePieceIndex === null) return;
    const { trayPieces, activePieceIndex } = gameState;
    const p = trayPieces[activePieceIndex];
    if (!p) return;
    const rotated = rotatePiece(p);
    const newTray = [...trayPieces];
    newTray[activePieceIndex] = rotated;
    const nextState = { ...gameState, trayPieces: newTray };
    setGameState(nextState);
    saveSession(nextState);
  };

  const animate = useCallback(() => {
    if (!gameState || gameState.screen !== 'playing' || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const scaleX = rect.width / LOGICAL_WIDTH;
    const scaleY = rect.height / LOGICAL_HEIGHT;

    ctx.save();
    ctx.scale(dpr, dpr);
    ctx.clearRect(0, 0, rect.width, rect.height);

    ctx.fillStyle = '#f8fafc'; ctx.fillRect(0, 0, rect.width, scaleY * GRID_SIZE);
    ctx.fillStyle = '#f1f5f9'; ctx.fillRect(0, scaleY * TRAY_Y_START, rect.width, scaleY * 4);
    
    ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 1;
    for(let i=0; i<=GRID_SIZE; i++) {
        ctx.beginPath(); ctx.moveTo(i * scaleX, 0); ctx.lineTo(i * scaleX, scaleY * GRID_SIZE); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(0, i * scaleY); ctx.lineTo(rect.width, i * scaleY); ctx.stroke();
    }

    for (let y = 0; y < GRID_SIZE; y++) {
      for (let x = 0; x < GRID_SIZE; x++) {
        const cell = gameState.grid[y][x];
        if (cell.filled) {
          ctx.fillStyle = cell.color || '#cbd5e1';
          ctx.fillRect(x * scaleX + 1, y * scaleY + 1, scaleX - 2, scaleY - 2);
        }
        if (cell.char) {
          const ok = cell.collected || gameState.isRoundClearing;
          if (ok) {
            ctx.fillStyle = '#0ea5e9';
            ctx.font = `bold ${scaleX * 0.7}px sans-serif`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(cell.char, (x + 0.5) * scaleX, (y + 0.5) * scaleY);
          } else {
            ctx.fillStyle = '#e2e8f0';
            ctx.beginPath(); ctx.arc((x + 0.5) * scaleX, (y + 0.5) * scaleY, scaleX * 0.1, 0, Math.PI * 2); ctx.fill();
          }
        }
      }
    }

    gameState.trayPieces.forEach((p, i) => {
      if (!p || gameState.activePieceIndex === i) return;
      const pos = getTrayPiecePos(i, p);
      ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => {
        row.forEach((v, px) => {
          if (v) ctx.fillRect((pos.x + px) * scaleX + 2, (pos.y + py) * scaleY + 2, scaleX - 4, scaleY - 4);
        });
      });
    });

    if (gameState.activePieceIndex !== null) {
      const p = gameState.trayPieces[gameState.activePieceIndex]!;
      const pos = gameState.currentPiecePos;
      
      const snapX = Math.round(pos.x);
      const snapY = Math.round(pos.y);
      if (snapY < GRID_SIZE && snapX >= 0 && snapX <= GRID_SIZE - p.shape[0].length && snapY >= 0 && snapY <= GRID_SIZE - p.shape.length) {
        ctx.globalAlpha = 0.25; ctx.fillStyle = p.color;
        p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((snapX + px) * scaleX, (snapY + py) * scaleY, scaleX, scaleY)));
        ctx.globalAlpha = 1.0;
      }

      ctx.shadowBlur = 15; ctx.shadowColor = 'rgba(14, 165, 233, 0.5)';
      ctx.fillStyle = p.color;
      p.shape.forEach((row, py) => row.forEach((v, px) => v && ctx.fillRect((pos.x + px) * scaleX + 1, (pos.y + py) * scaleY + 1, scaleX - 2, scaleY - 2)));
      
      ctx.strokeStyle = '#0ea5e9'; ctx.lineWidth = 2; ctx.shadowBlur = 0;
      p.shape.forEach((row, py) => row.forEach((v, px) => {
          if (v) ctx.strokeRect((pos.x + px) * scaleX + 1, (pos.y + py) * scaleY + 1, scaleX - 2, scaleY - 2);
      }));
    }

    scoreEffectsRef.current = scoreEffectsRef.current.filter(e => e.life > 0);
    scoreEffectsRef.current.forEach(e => {
        ctx.fillStyle = '#0ea5e9'; ctx.font = `bold ${scaleX * 0.5}px sans-serif`; ctx.globalAlpha = e.life; ctx.textAlign = 'center';
        ctx.fillText(e.text, e.x * scaleX, (e.y - (1 - e.life) * 2) * scaleY); e.life -= 0.02;
    });
    ctx.globalAlpha = 1.0;

    ctx.restore();
    requestRef.current = requestAnimationFrame(animate);
  }, [gameState, getTrayPiecePos]);

  useEffect(() => {
    if (gameState?.screen === 'playing') requestRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(requestRef.current);
  }, [animate, gameState?.screen]);

  const handlePointerDown = (e: React.PointerEvent) => {
    if (gameState?.screen !== 'playing' || gameState.isRoundClearing) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;

    let trayIdx: number | null = null;
    gameState!.trayPieces.forEach((p, i) => {
      if (!p) return;
      const pos = getTrayPiecePos(i, p);
      if (x >= pos.x - 0.3 && x <= pos.x + p.shape[0].length + 0.3 && y >= pos.y - 0.3 && y <= pos.y + p.shape.length + 0.3) trayIdx = i;
    });

    if (trayIdx !== null) {
      const p = gameState!.trayPieces[trayIdx]!;
      const pos = getTrayPiecePos(trayIdx, p);
      setIsDragging(true); setDragOffset({ x: x - pos.x, y: y - pos.y });
      setGameState({ ...gameState!, activePieceIndex: trayIdx, currentPiecePos: pos });
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
      return;
    }

    if (gameState?.activePieceIndex !== null) {
      const p = gameState!.trayPieces[gameState!.activePieceIndex!]!;
      const pos = gameState!.currentPiecePos;
      if (x >= pos.x - 0.2 && x <= pos.x + p.shape[0].length + 0.2 && y >= pos.y - 0.2 && y <= pos.y + p.shape.length + 0.2) {
        setIsDragging(true); setDragOffset({ x: x - pos.x, y: y - pos.y });
        (e.target as HTMLElement).setPointerCapture(e.pointerId);
      }
    }
  };

  const handlePointerMove = (e: React.PointerEvent) => {
    if (!isDragging || !gameState || gameState.activePieceIndex === null) return;
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    const x = ((e.clientX - rect.left) / rect.width) * LOGICAL_WIDTH;
    const y = ((e.clientY - rect.top) / rect.height) * LOGICAL_HEIGHT;
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
        const trayPos = getTrayPiecePos(gameState.activePieceIndex!, p);
        if (pos.y > TRAY_Y_START - 0.5) {
             setGameState({ ...gameState, currentPiecePos: trayPos });
        } else {
             setGameState({ ...gameState });
        }
    }
  };

  if (!gameState) return null;

  if (gameState.screen === 'menu') {
    return (
      <div className="fixed inset-0 bg-white flex flex-col items-center justify-center p-8 space-y-12">
        <div className="absolute top-4 right-4">
          <button 
            onClick={toggleLanguage}
            className="text-[10px] font-black text-sky-500 border-2 border-sky-500 px-3 py-1 rounded-full active:bg-sky-50 transition-colors uppercase"
          >
            {gameState.language === 'en' ? '中文' : 'English'}
          </button>
        </div>
        
        <div className="text-center">
            <h1 className="text-6xl font-black text-sky-500 italic tracking-tighter uppercase mb-2 drop-shadow-sm">{t.menu_title}</h1>
            <p className="text-slate-300 font-bold uppercase tracking-widest text-sm">{t.menu_subtitle}</p>
        </div>

        <div className="bg-slate-50 p-10 rounded-[3rem] w-full max-w-xs text-center border-2 border-slate-100 shadow-inner">
            <span className="text-xs font-black text-slate-300 uppercase tracking-widest mb-1 block">{t.menu_record}</span>
            <span className="text-6xl font-black text-slate-400 leading-none">{gameState.highScore}</span>
        </div>

        <div className="flex flex-col w-full max-w-xs space-y-4">
            {hasSession && (
              <button onClick={continueGame} className="w-full bg-sky-50 text-sky-600 py-6 rounded-3xl font-black text-xl flex items-center justify-center gap-3 active:scale-95 transition-all border border-sky-100">
                <PlayIcon /> {t.btn_continue}
              </button>
            )}
            <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-6 rounded-3xl font-black text-xl shadow-xl border-b-4 border-sky-700 active:translate-y-1 active:border-b-0 transition-all uppercase tracking-widest">
              {t.btn_new_game}
            </button>
        </div>
      </div>
    );
  }

  const currentVerse = SAMPLE_VERSES[gameState.currentVerseIndex];

  return (
    <div className="fixed inset-0 flex flex-col bg-white text-slate-800 overflow-hidden select-none touch-none">
      
      <header className="flex-none bg-white flex justify-between items-center px-4 py-3 border-b border-slate-200 z-20">
        <div className="flex flex-col">
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">{t.hud_high}</span>
          <span className="text-base font-black text-slate-400 leading-none">{gameState.highScore}</span>
        </div>
        <div className="flex-1 flex flex-col items-center">
            <span className="text-[11px] font-black text-sky-500 uppercase tracking-tighter">{t.hud_combo} x{gameState.combo}</span>
            <div className="text-xs font-black text-white bg-sky-500 px-4 py-1 rounded-full shadow-md">
                {gameState.collectedIndices.size} / {currentVerse.text.length}
            </div>
        </div>
        <div className="flex flex-col text-right">
          <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest leading-none mb-1">{t.hud_score}</span>
          <span className="text-base font-black text-sky-500 leading-none">{gameState.score}</span>
        </div>
      </header>

      <main className="flex-1 w-full bg-slate-50 flex items-center justify-center relative overflow-hidden">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          className="w-full h-full block touch-none cursor-grab active:cursor-grabbing max-w-full max-h-full"
          style={{ aspectRatio: `${LOGICAL_WIDTH}/${LOGICAL_HEIGHT}` }}
        />
        {gameState.isRoundClearing && (
          <div className="absolute inset-0 z-30 bg-sky-500/10 backdrop-blur-md flex items-center justify-center p-4">
             <div className="bg-white px-10 py-6 rounded-[3rem] shadow-2xl border-4 border-sky-500 animate-bounce">
                <p className="text-3xl font-black text-sky-500 uppercase italic text-center tracking-tighter">{t.victory_title}</p>
             </div>
          </div>
        )}
      </main>

      <section className="flex-none px-6 py-4 bg-white border-y border-slate-100 min-h-[80px] flex flex-col items-center justify-center z-10">
         <div className="flex flex-wrap justify-center gap-2 max-w-md">
            {currentVerse.text.split('').map((char, i) => {
              const ok = gameState.collectedIndices.has(i) || gameState.isRoundClearing;
              return (
                <span key={i} className={`text-xl font-black transition-all duration-700 ${ok ? 'text-sky-500 scale-125 drop-shadow-md' : 'text-slate-100'}`}>
                  {ok ? char : '□'}
                </span>
              );
            })}
         </div>
         <p className="text-[10px] font-bold text-slate-300 italic mt-2 uppercase tracking-wide">— {currentVerse.reference}</p>
      </section>

      <footer className="flex-none bg-white px-4 pt-4 pb-8 border-t border-slate-200 z-20 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)]">
        <div className="grid grid-cols-4 gap-3 max-w-lg mx-auto">
          <button onClick={rotate} className={`bg-slate-50 text-slate-500 p-4 rounded-[2.5rem] border transition-all flex flex-col items-center justify-center group ${gameState.activePieceIndex !== null ? 'border-sky-300 bg-sky-50 text-sky-600 scale-105 shadow-md' : 'border-slate-200'}`}>
            <RotateIcon />
            <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">{t.btn_rotate}</span>
          </button>
          
          <button onClick={placePiece} className="col-span-2 bg-sky-500 text-white p-4 rounded-[2.5rem] shadow-xl border-b-4 border-sky-700 active:translate-y-1 active:border-b-0 transition-all flex flex-col items-center justify-center">
            <PlaceIcon />
            <span className="text-xs font-black uppercase tracking-widest mt-1">{t.btn_confirm}</span>
          </button>
          
          <button onClick={goToMenu} className="bg-slate-50 text-slate-500 p-4 rounded-[2.5rem] border border-slate-200 active:bg-slate-200 transition-colors flex flex-col items-center justify-center group shadow-sm">
            <MenuIcon />
            <span className="text-[9px] font-black uppercase mt-1 tracking-tighter">{t.btn_home}</span>
          </button>
        </div>
      </footer>

      {gameState.isGameOver && (
        <div className="fixed inset-0 z-50 bg-slate-900/90 backdrop-blur-2xl flex items-center justify-center p-8">
           <div className="bg-white w-full max-w-xs rounded-[4rem] p-12 text-center shadow-2xl animate-in fade-in zoom-in duration-500">
              <h2 className="text-4xl font-black text-sky-500 mb-2 italic tracking-tighter uppercase leading-none">{t.game_over_title}</h2>
              <div className="my-10">
                <p className="text-slate-300 text-[11px] font-black uppercase tracking-widest mb-1">{t.game_over_final_score}</p>
                <p className="text-6xl font-black text-slate-800 tracking-tighter">{gameState.score}</p>
                {gameState.score >= gameState.highScore && (
                    <p className="text-sky-500 font-black text-[10px] mt-2 uppercase tracking-widest animate-pulse">{t.game_over_new_record}</p>
                )}
              </div>
              <div className="space-y-4">
                <button onClick={startNewGame} className="w-full bg-sky-500 text-white py-6 rounded-[2rem] font-black text-xl shadow-xl border-b-4 border-sky-700 active:scale-95 transition-all tracking-widest uppercase">{t.btn_try_again}</button>
                <button onClick={() => { setGameState({ ...gameState, screen: 'menu', isGameOver: false }); setHasSession(false); }} className="w-full bg-slate-100 text-slate-500 py-5 rounded-[2rem] font-black text-sm uppercase tracking-widest active:bg-slate-200 transition-colors">{t.btn_main_menu}</button>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
