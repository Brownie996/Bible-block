
import { GameState } from '../types';

const STORAGE_KEY = 'verse_blocks_data';
const SESSION_KEY = 'verse_blocks_session';

interface PersistentData {
  completedVerses: string[];
  highScore: number;
}

const DEFAULT_DATA: PersistentData = {
  completedVerses: [],
  highScore: 0,
};

export const saveGameData = (data: Partial<PersistentData>) => {
  const existing = loadGameData();
  const updated = { ...existing, ...data };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
};

export const loadGameData = (): PersistentData => {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return DEFAULT_DATA;
  try {
    return { ...DEFAULT_DATA, ...JSON.parse(stored) };
  } catch (e) {
    return DEFAULT_DATA;
  }
};

export const saveSession = (state: any) => {
  if (!state) return;
  const serializable = {
    ...state,
    collectedIndices: Array.from(state.collectedIndices)
  };
  localStorage.setItem(SESSION_KEY, JSON.stringify(serializable));
};

export const loadSession = (): any | null => {
  const stored = localStorage.getItem(SESSION_KEY);
  if (!stored) return null;
  try {
    const data = JSON.parse(stored);
    data.collectedIndices = new Set(data.collectedIndices);
    return data;
  } catch (e) {
    return null;
  }
};

export const clearSession = () => {
  localStorage.removeItem(SESSION_KEY);
};
