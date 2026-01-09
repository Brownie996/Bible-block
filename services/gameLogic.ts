
import { GRID_SIZE, TETROMINOES } from '../constants';
import { CellData, Piece, Point, TetrominoType } from '../types';

export const createEmptyGrid = (): CellData[][] => {
  return Array.from({ length: GRID_SIZE }, () =>
    Array.from({ length: GRID_SIZE }, () => ({
      filled: false,
      color: null,
      char: null,
      charIndex: null,
      collected: false,
    }))
  );
};

export const getRandomPiece = (): Piece => {
  const types: TetrominoType[] = ['I', 'O', 'T', 'S', 'Z', 'J', 'L'];
  const type = types[Math.floor(Math.random() * types.length)];
  return { ...TETROMINOES[type] };
};

export const rotatePiece = (piece: Piece): Piece => {
  const shape = piece.shape;
  const newShape = shape[0].map((_, index) =>
    shape.map(row => row[index]).reverse()
  );
  return { ...piece, shape: newShape };
};

export const checkCollision = (
  grid: CellData[][],
  piece: Piece,
  pos: Point
): boolean => {
  for (let y = 0; y < piece.shape.length; y++) {
    for (let x = 0; x < piece.shape[y].length; x++) {
      if (piece.shape[y][x]) {
        const gridX = pos.x + x;
        const gridY = pos.y + y;
        if (
          gridX < 0 ||
          gridX >= GRID_SIZE ||
          gridY < 0 ||
          gridY >= GRID_SIZE ||
          grid[gridY][gridX].filled
        ) {
          return true;
        }
      }
    }
  }
  return false;
};

/**
 * Distributes verse characters on the grid.
 * It clears existing characters but keeps the 'filled' status of blocks.
 */
export const distributeVerse = (grid: CellData[][], verse: string): void => {
  // Clear old characters first
  for (let y = 0; y < GRID_SIZE; y++) {
    for (let x = 0; x < GRID_SIZE; x++) {
      grid[y][x].char = null;
      grid[y][x].charIndex = null;
      grid[y][x].collected = false;
    }
  }

  const chars = verse.split('');
  const totalCells = GRID_SIZE * GRID_SIZE;
  const availableIndices = Array.from({ length: totalCells }, (_, i) => i);
  
  for (let i = availableIndices.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [availableIndices[i], availableIndices[j]] = [availableIndices[j], availableIndices[i]];
  }

  const maxCharsPerLine = Math.ceil(chars.length / (GRID_SIZE / 2)) + 1;
  const rowCounts = new Array(GRID_SIZE).fill(0);
  const colCounts = new Array(GRID_SIZE).fill(0);

  let placed = 0;
  for (const idx of availableIndices) {
    if (placed >= chars.length) break;

    const x = idx % GRID_SIZE;
    const y = Math.floor(idx / GRID_SIZE);

    if (rowCounts[y] < maxCharsPerLine && colCounts[x] < maxCharsPerLine) {
      grid[y][x].char = chars[placed];
      grid[y][x].charIndex = placed;
      grid[y][x].collected = false;
      rowCounts[y]++;
      colCounts[x]++;
      placed++;
    }
  }
};

export const canPlaceAnywhere = (grid: CellData[][], piece: Piece): boolean => {
  let testPiece = piece;
  for (let r = 0; r < 4; r++) {
    for (let y = 0; y <= GRID_SIZE - testPiece.shape.length; y++) {
      for (let x = 0; x <= GRID_SIZE - testPiece.shape[0].length; x++) {
        if (!checkCollision(grid, testPiece, { x, y })) {
          return true;
        }
      }
    }
    testPiece = rotatePiece(testPiece);
  }
  return false;
};
