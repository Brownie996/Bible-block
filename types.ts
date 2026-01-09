
export type Point = { x: number; y: number };

export type TetrominoType = 'I' | 'O' | 'T' | 'S' | 'Z' | 'J' | 'L';

export interface Piece {
  type: TetrominoType;
  shape: number[][];
  color: string;
}

export interface CellData {
  filled: boolean;
  color: string | null;
  char: string | null;
  charIndex: number | null;
  collected: boolean;
}

export interface Verse {
  text: string;
  reference: string;
}

export interface ScoreEffect {
  id: number;
  x: number;
  y: number;
  text: string;
  life: number;
}

export type Language = 'en' | 'zh';

export interface GameState {
  screen: 'menu' | 'playing';
  score: number;
  highScore: number;
  combo: number;
  completedVerses: string[];
  currentVerseIndex: number;
  grid: CellData[][];
  trayPieces: (Piece | null)[];
  activePieceIndex: number | null; 
  currentPiecePos: Point;
  isGameOver: boolean;
  collectedIndices: Set<number>;
  isRoundClearing: boolean;
  language: Language;
}
