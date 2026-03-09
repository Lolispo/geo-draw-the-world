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

export function saveScore(mode, score, counted, total) {
  const data = loadAll();
  const prev = data[mode];
  if (!prev || score > prev.score) {
    data[mode] = { score, counted, total, date: Date.now() };
    saveAll(data);
    return true; // new high score
  }
  return false;
}

export function getAllHighScores() {
  return loadAll();
}
