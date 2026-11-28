// How each game's high-score keys read on Your Scores. A mode that mints a key
// registers here how to read it back — its group, its label, and what the stored
// number means — so the scores screen never has to guess. Keys are permanent: a
// renamed round keeps its old key and gets a reader here, not a new key.

import { getDataset, getDatasetList } from './datasets.js';
import { formatElapsed } from './names-sets.js';
import { PACKS, packLevelLabel } from './quiz/packs.js';

export const GROUPS = {
  QUIZ: 'Quiz',
  DRAW: 'Draw the World',
  RANK: 'Rank the World',
  TOPN: 'Top 10 / Bottom 10',
  NAMES: 'Name Them All',
  SHAPE: 'Guess the Shape',
  FLAGS: 'Flags',
  OLDER: 'Older rounds',
};
export const GROUP_ORDER = [GROUPS.QUIZ, GROUPS.DRAW, GROUPS.RANK, GROUPS.TOPN, GROUPS.NAMES, GROUPS.SHAPE, GROUPS.FLAGS, GROUPS.OLDER];

const MODES = [];

// `match(key)` returns { label, detail? } for a key the mode minted, or null.
// `format(rec, key)` says what the stored record means: an average out of 100, a
// streak length, a count of hits. Say the right thing or say nothing.
export function registerScoreMode({ group, match, format }) {
  MODES.push({ group, match, format });
}

// A key that no mode claims is a retired round. It is kept, not hidden: the score was
// earned.
const OLDER = { group: GROUPS.OLDER, format: (rec) => String(rec.score) };

export function describeScore(key) {
  for (const m of MODES) {
    const hit = m.match(key);
    if (hit) return { group: m.group, label: hit.label, detail: hit.detail, mode: m };
  }
  return { group: OLDER.group, label: key, detail: 'from an earlier version', mode: OLDER };
}

export function formatScore(key, rec) {
  return describeScore(key).mode.format(rec, key);
}

const titleFromSlug = (slug) => slug.split('-').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
const prefixed = (key, prefix) => (key.startsWith(prefix) ? key.slice(prefix.length) : null);

// ---------- Quiz ----------

const QUIZ_LABELS = { 'quiz-daily': 'Daily Quiz', 'quiz-easy': 'Random Quiz · Easy', 'quiz-hard': 'Random Quiz · Hard' };
registerScoreMode({
  group: GROUPS.QUIZ,
  match: (key) => (QUIZ_LABELS[key] ? { label: QUIZ_LABELS[key] } : null),
  format: (rec) => `${rec.score}/500`,
});

// ---------- Draw the World ----------

const DRAW_LABELS = {
  daily: 'Daily Challenge',
  quick3: 'Quick 3',
  quick: 'Quick 10',
  famous5: 'Famous 5',
  speed: 'Speed Round',
  streak: 'Streak',
  continents: 'Continents',
  world: 'World',
};
const drawFormat = (rec, key) => (key === 'streak' ? `${rec.score} in a row` : `${rec.score}/100`);
registerScoreMode({
  group: GROUPS.DRAW,
  match: (key) => (DRAW_LABELS[key] ? { label: DRAW_LABELS[key] } : null),
  format: drawFormat,
});
registerScoreMode({
  group: GROUPS.DRAW,
  match: (key) => {
    const region = prefixed(key, 'countries-');
    return region == null ? null : { label: titleFromSlug(region), detail: 'region' };
  },
  format: drawFormat,
});

// ---------- Rank the World ----------

registerScoreMode({
  group: GROUPS.RANK,
  match: (key) => {
    const id = prefixed(key, 'rank-line-');
    return id == null ? null : { label: getDataset(id)?.name || id };
  },
  format: (rec) => `run of ${rec.score}`,
});

// ---------- Quiz-screen packs and the flag games ----------

registerScoreMode({
  group: GROUPS.FLAGS,
  match: (key) => (key === PACKS['flag-pie'].id ? { label: PACKS['flag-pie'].title } : null),
  format: (rec) => `${rec.score} pts`,
});

registerScoreMode({
  group: GROUPS.SHAPE,
  match: (key) => {
    const m = key.match(/^shape-([a-z]+)(?:-([a-z]+))?$/);
    if (!m || !PACKS.shape.levels[m[1]] || (m[2] && !PACKS.shape.pools[m[2]])) return null;
    return { label: packLevelLabel(PACKS.shape, m[1], m[2]) };
  },
  format: (rec) => `${rec.score}/1000`,
});

// flag-quiz-<rounds>: the pack still writes flag-quiz-10, the key the old screen used.
registerScoreMode({
  group: GROUPS.FLAGS,
  match: (key) => {
    const n = prefixed(key, 'flag-quiz-');
    return n == null ? null : { label: PACKS.flags.title, detail: `${n} rounds` };
  },
  format: (rec) => `${rec.score} pts`,
});

registerScoreMode({
  group: GROUPS.FLAGS,
  match: (key) => {
    const n = prefixed(key, 'flag-picker-');
    return n == null ? null : { label: 'Flag Color Picker', detail: `${n} rounds` };
  },
  format: (rec) => `${rec.score} pts`,
});

// ---------- Top 10 / Bottom 10 ----------

const STYLE_LABELS = { cards: 'cards', flags: 'flags only', type: 'typing' };

// topn2-<datasetId>-<scope>-<hi|lo>-<n>-<style>[-easy|-hard]. Both the dataset id and
// the scope can hold dashes, so it is read from the right, and the dataset is then
// matched against the live registry rather than guessed at.
function readTopN(key) {
  const parts = key.slice('topn2-'.length).split('-');
  const diff = (parts[parts.length - 1] === 'easy' || parts[parts.length - 1] === 'hard')
    ? parts.pop() : null;
  const style = parts.pop();
  const n = parts.pop();
  const dir = parts.pop();
  const rest = parts.join('-');
  const ds = getDatasetList().find((d) => rest === d.id || rest.startsWith(`${d.id}-`));
  const scope = ds ? rest.slice(ds.id.length + 1) : '';
  const detail = [
    scope === 'world' || !scope ? 'World' : titleFromSlug(scope),
    STYLE_LABELS[style] || style,
    diff,
  ].filter(Boolean).join(' · ');
  return { label: `${dir === 'lo' ? 'Bottom' : 'Top'} ${n} · ${ds ? ds.name : rest}`, detail };
}
registerScoreMode({
  group: GROUPS.TOPN,
  match: (key) => (key.startsWith('topn2-') ? readTopN(key) : null),
  format: (rec) => `${rec.score}/${rec.total}`,
});

// ---------- Name Them All ----------

registerScoreMode({
  group: GROUPS.NAMES,
  match: (key) => {
    const m = key.match(/^names-(.+)-([a-z])$/);
    return m ? { label: `${titleFromSlug(m[1])} · ${m[2].toUpperCase()}` } : null;
  },
  format: (rec) => `${rec.score}/${rec.total}${rec.ms == null ? '' : ` in ${formatElapsed(rec.ms)}`}`,
});
