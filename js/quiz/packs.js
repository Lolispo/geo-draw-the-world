// Menu games that are a quiz round of a single question type. The quiz screen plays
// them, so a new one is a generator plus an entry here, not a new screen.
//
// A level's `mix` weights the difficulty bands like the Random Quiz modes do; `opts`
// is handed to the generator alongside maxFam. With levels, the high score is kept
// per level as `<id>-<level>`; without, as `<id>`.
export const PACKS = {
  shape: {
    id: 'shape',
    title: 'Guess the Shape',
    type: 'shape',
    size: 10,
    levels: {
      easy: { label: 'Easy', sub: 'The full outline', mix: { gentle: 30, easy: 40, medium: 20, hard: 10 }, opts: { similar: true } },
      // The pixel levels keep to countries most players could name; the resolution is the
      // difficulty.
      medium: { label: 'Medium', sub: '24 × 24 pixels', mix: { gentle: 40, easy: 40, medium: 20 }, opts: { res: 24 } },
      hard: { label: 'Hard', sub: '12 × 12 pixels', mix: { gentle: 45, easy: 45, medium: 10 }, opts: { res: 12 } },
    },
  },
  'flag-pie': {
    id: 'flag-pie',
    title: 'Flag Pie',
    type: 'flag-pie',
    size: 10,
    mix: { gentle: 10, easy: 40, medium: 35, hard: 15 },
  },
};

export const packLevel = (pack, level) => (pack.levels ? (pack.levels[level] ? level : Object.keys(pack.levels)[0]) : null);
export const packScoreKey = (pack, level) => (pack.levels ? `${pack.id}-${packLevel(pack, level)}` : pack.id);
export const packTitle = (pack, level) => (pack.levels ? `${pack.title} · ${pack.levels[packLevel(pack, level)].label}` : pack.title);
