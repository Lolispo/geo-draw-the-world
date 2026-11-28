// Menu games that are a quiz round of a single question type. The quiz screen plays
// them, so a new one is a generator plus an entry here, not a new screen.
//
// A level's `mix` weights the difficulty bands like the Random Quiz modes do; `opts`
// is handed to the generator alongside maxFam. With levels, the high score is kept
// per level as `<id>-<level>`; without, as `<id>`.
//
// `pools` is an optional second choice, picked alongside the level: which answers come
// up. A pool supplies the mix, the level only its opts. The default pool keeps the
// plain `<id>-<level>` key, so scores from before pools existed stay where they were.
//
// `scoreKey` overrides the key of a pack without levels, for a game that kept scores
// under another name before it became a pack. Keys are permanent.
export const PACKS = {
  shape: {
    id: 'shape',
    title: 'Guess the Shape',
    type: 'shape',
    size: 10,
    levelsLabel: 'Shape',
    levels: {
      easy: { label: 'Outline', sub: 'The full outline', opts: { similar: true } },
      medium: { label: '24 × 24', sub: 'Pixelated', opts: { res: 24 } },
      hard: { label: '12 × 12', sub: 'Very pixelated', opts: { res: 12 } },
    },
    poolsLabel: 'Countries',
    defaultPool: 'mixed',
    pools: {
      known: { label: 'Well known', sub: 'Ones most people could name', mix: { gentle: 55, easy: 45 } },
      mixed: { label: 'Mixed', sub: 'Mostly familiar, a few harder', mix: { gentle: 30, easy: 40, medium: 20, hard: 10 } },
      any: { label: 'Anywhere', sub: 'Small and obscure ones too', mix: { easy: 15, medium: 40, hard: 45 } },
    },
  },
  'flag-pie': {
    id: 'flag-pie',
    title: 'Flag Pie',
    type: 'flag-pie',
    size: 10,
    mix: { gentle: 10, easy: 40, medium: 35, hard: 15 },
  },
  flags: {
    id: 'flags',
    title: 'Flag Color Quiz',
    type: 'flag-missing',
    size: 10,
    mix: { gentle: 10, easy: 40, medium: 35, hard: 15 },
    scoreKey: 'flag-quiz-10',
  },
};

export const packLevel = (pack, level) => (pack.levels ? (pack.levels[level] ? level : Object.keys(pack.levels)[0]) : null);
export const packPool = (pack, pool) => (pack.pools ? (pack.pools[pool] ? pool : pack.defaultPool) : null);
export const packScoreKey = (pack, level, pool) => {
  if (!pack.levels) return pack.scoreKey || pack.id;
  const base = `${pack.id}-${packLevel(pack, level)}`;
  const p = packPool(pack, pool);
  return p && p !== pack.defaultPool ? `${base}-${p}` : base;
};
// The words for a level (and pool), e.g. "Outline · Well known".
export const packLevelLabel = (pack, level, pool) => {
  if (!pack.levels) return '';
  const parts = [pack.levels[packLevel(pack, level)].label];
  if (pack.pools) parts.push(pack.pools[packPool(pack, pool)].label);
  return parts.join(' · ');
};
export const packTitle = (pack, level, pool) => (pack.levels ? `${pack.title} · ${packLevelLabel(pack, level, pool)}` : pack.title);
// What buildTypeRound takes from the pack for this choice.
export const packRoundCfg = (pack, level, pool) => {
  if (!pack.levels) return { mix: pack.mix, opts: {} };
  const lv = pack.levels[packLevel(pack, level)];
  return { mix: pack.pools ? pack.pools[packPool(pack, pool)].mix : lv.mix, opts: lv.opts || {} };
};
