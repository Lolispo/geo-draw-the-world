// localStorage high scores

const STORAGE_KEY = 'geo-draw-high-scores';

function loadAll() {
  try {
    return JSON.parse(localStorage.getItem(STORAGE_KEY)) || {};
  } catch { return {}; }
}

function saveAll(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}

export function getHighScore(mode) {
  const data = loadAll();
  return data[mode] || null;
}

// `ms` is an optional time taken: on an equal score the faster one is the better.
export function saveScore(mode, score, counted, total, { ms } = {}) {
  const data = loadAll();
  const prev = data[mode];
  const faster = prev && score === prev.score && ms != null && (prev.ms == null || ms < prev.ms);
  if (!prev || score > prev.score || faster) {
    data[mode] = ms == null ? { score, counted, total, date: Date.now() } : { score, counted, total, ms, date: Date.now() };
    saveAll(data);
    return true; // new high score
  }
  return false;
}

export function getAllHighScores() {
  return loadAll();
}

// Only the scores screen calls this, and only behind a confirm (TODOS #41).
export function clearScores() {
  localStorage.removeItem(STORAGE_KEY);
}
