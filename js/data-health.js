// Cross-file integrity checks over the shipped data (TODOS #71).
//
// These are the failures that do not announce themselves. A join that stops joining, a
// percentage that stops adding up, a figure that contradicts another figure derived from
// the same source — none of it throws, and none of it looks wrong in a single row. They
// run against the committed files rather than a snapshot, so they cannot go stale while
// the data moves.
//
// Each check returns one of:
//   'pass' — nothing to do
//   'look' — true, and worth a human deciding whether it matters
//   'fail' — a contradiction the data should not be able to contain
// `look` is deliberately not `fail`: the World Bank disagreeing with itself about Cyprus
// is real and is not ours to fix, and crying wolf about it trains people to ignore the lot.

const rgbDist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

export function runDataChecks({ entities, datasets, attributes, electricity, flags, aliases, sources, counts }) {
  const out = [];
  const add = (state, what, detail, codes = []) => out.push({ state, what, detail, codes });
  const codes = Object.keys(entities);
  const V = (id) => datasets.datasets.find((d) => d.id === id)?.values || {};
  const name = (c) => entities[c]?.name ?? c;

  // 0. is data/sources.json still describing the data we actually have? (TODOS #79)
  //
  // Regenerating the registry after a data rebuild is the step a human skips, and a
  // stale "retrieved" date is invisible — it looks exactly like a fresh one. The entity
  // counts are the tell: sources.json records what each file held when it was
  // generated, so a file that has since grown or shrunk proves the registry is behind.
  if (sources) {
    const src = sources.sources || {};
    const behind = [];
    for (const [id, s] of Object.entries(src)) {
      for (const f of s.files || []) {
        const live = counts?.[f.path];
        if (live == null || f.covers == null) continue;
        if (live !== f.covers) behind.push(`${f.path}: ${live} now, ${f.covers} when ${id} was recorded`);
      }
    }
    add(behind.length ? 'fail' : 'pass', 'data/sources.json is up to date',
      behind.length
        ? `${behind.length} file(s) have changed since the registry was generated — run `
          + `\`node scripts/build-sources.mjs\`. ${behind.join('; ')}`
        : 'Every file the registry describes still holds the number of entities it recorded.');

    // A metric nobody declared a source for would show no provenance at all, silently.
    const unsourced = (datasets?.datasets || [])
      .filter((d) => !d.source || !src[d.source])
      .map((d) => d.id);
    add(unsourced.length ? 'fail' : 'pass', 'every metric names a source we know',
      unsourced.length
        ? `${unsourced.join(', ')} — add the source to scripts/lib/provenance.mjs and re-run the builds.`
        : `All ${(datasets?.datasets || []).length} metrics resolve to an entry in data/sources.json.`,
      []);
  }

  // 1. the joins
  {
    const orphans = [];
    for (const [file, keys] of [
      ['attributes.json', Object.keys(attributes)],
      ['electricity.json', Object.keys(electricity)],
      ['flags.json', flags.map((f) => f.code)],
      ['datasets.json', Object.keys(datasets.countries)],
      ['aliases.json', Object.keys(aliases || {})],
    ]) for (const k of keys) if (!entities[k]) orphans.push(`${file}:${k}`);
    add(orphans.length ? 'fail' : 'pass', 'Every key joins to the entity registry',
      orphans.length
        ? `${orphans.length} key(s) exist in a data file but not in entities.json.`
        : 'All five code-keyed files resolve entirely into entities.json, with no orphans either way.',
      orphans);
  }

  // 2. name and continent drift
  {
    const drift = [
      ...flags.filter((f) => entities[f.code] && entities[f.code].name !== f.name).map((f) => `flags:${f.code}`),
      ...Object.keys(datasets.countries)
        .filter((c) => entities[c] && datasets.countries[c].name !== entities[c].name).map((c) => `name:${c}`),
      ...Object.keys(datasets.countries)
        .filter((c) => entities[c] && datasets.countries[c].continent !== entities[c].continent).map((c) => `continent:${c}`),
    ];
    add(drift.length ? 'look' : 'pass', 'Display names and continents agree across files',
      drift.length
        ? `${drift.length} disagree between files. build-entities.mjs reconciles these, so this means it has not been re-run.`
        : 'Names and continents in flags.json and datasets.json match entities.json exactly.', drift);
  }

  // 3 & 4. religion breakdowns
  {
    const over = [], dup = [];
    for (const [c, v] of Object.entries(attributes)) {
      if (!v.religion?.length) continue;
      if (v.religion.some((r) => r.pct == null)) continue;   // named, unquantified: nothing to total
      if (v.religion.reduce((a, r) => a + r.pct, 0) > 105) over.push(c);
      if (new Set(v.religion.map((r) => r.name)).size !== v.religion.length) dup.push(c);
    }
    add(over.length ? 'look' : 'pass', 'Religion breakdowns total 105% or less',
      over.length
        ? `${over.length} total over 105% — the parser emitted a group and its own sub-groups as siblings, or merged two surveys.`
        : 'Every quantified breakdown totals within tolerance.', over.map((c) => `${c} ${name(c)}`));
    add(dup.length ? 'look' : 'pass', 'No religion appears twice in one breakdown',
      dup.length
        ? `${dup.length} list the same religion more than once — the signature of two Factbook surveys read as one.`
        : 'No duplicated religion names.', dup.map((c) => `${c} ${name(c)}`));
  }

  // 5. GDP per capita against GDP / population
  {
    const gdp = V('gdp-nominal'), pop = V('population'), pc = V('gdp-per-capita');
    const off = [];
    for (const c of Object.keys(pc)) {
      if (gdp[c] == null || pop[c] == null) continue;
      const dev = (pc[c] - gdp[c] / pop[c]) / (gdp[c] / pop[c]) * 100;
      if (Math.abs(dev) > 10) off.push(`${c} ${name(c)} ${dev > 0 ? '+' : ''}${dev.toFixed(0)}%`);
    }
    add(off.length ? 'look' : 'pass', 'GDP per capita matches GDP divided by population',
      off.length
        ? `${off.length} disagree by more than 10%. The three series resolve their own latest year independently, and the World Bank's coverage can differ between them — Cyprus's GDP covers the government-controlled area while its population covers the whole island.`
        : 'Every country is internally consistent within 10%.', off);
  }

  // 6. published export share against our own two columns
  {
    const gdp = V('gdp-nominal'), exp = V('exports'), esh = V('export-share-gdp');
    const off = [];
    for (const c of Object.keys(esh)) {
      if (exp[c] == null || gdp[c] == null) continue;
      const dev = esh[c] - exp[c] / gdp[c] * 100;
      if (Math.abs(dev) > 5) off.push(`${c} ${name(c)} ${dev > 0 ? '+' : ''}${dev.toFixed(1)}pp`);
    }
    add(off.length ? 'look' : 'pass', 'Export share matches exports divided by GDP',
      off.length
        ? `${off.length} disagree by more than 5 points. The share is taken straight from the World Bank rather than divided here, precisely so the columns cannot silently mix years — a gap this size is the source disagreeing with itself.`
        : 'The published share matches the one derived from our own two columns.', off);
  }

  // 7. physical ranges
  {
    const bad = [];
    const range = (id, lo, hi) => {
      for (const [c, v] of Object.entries(V(id))) if (v < lo || v > hi) bad.push(`${id}:${c}=${v}`);
    };
    range('urbanization', 0, 100);
    range('life-expectancy', 30, 95);
    range('independence-year', 1, new Date().getFullYear());
    range('land-area', 0.0001, 2e7);
    range('population', 1, 2e9);
    add(bad.length ? 'fail' : 'pass', 'Every value sits inside its physical range',
      bad.length ? `${bad.length} are impossible for their unit.`
        : 'Urbanisation, life expectancy, independence year, land area and population are all in range.', bad);
  }

  // 8. the electricity mix adds up
  {
    const bad = [], years = new Set();
    for (const [c, v] of Object.entries(electricity)) {
      years.add(v.year);
      const sum = v.sources.reduce((a, s) => a + s.pct, 0);
      if (Math.abs(sum - 100) > 5) bad.push(`${c} ${name(c)} ${sum.toFixed(1)}%`);
    }
    const span = [...years].sort();
    add(bad.length ? 'fail' : 'pass', 'Electricity shares total 100%',
      bad.length
        ? `${bad.length} do not add up — a column was missed or misparsed, which lands wrong numbers on a country.`
        : `All ${Object.keys(electricity).length} breakdowns total 100% ±5, spanning ${span[0]}–${span[span.length - 1]}, each carrying its own year.`,
      bad);
  }

  // 9 & 10. every fetched figure says when it is from
  {
    const noYear = [], stale = [];
    let withYears = 0, lo = 9999, hi = 0;
    for (const d of datasets.datasets) {
      if (!d.years) continue;
      withYears++;
      for (const c of Object.keys(d.values)) {
        const y = d.years[c];
        // No year marks a manual backfill, which carries a provenance string instead.
        if (y == null) { if (!datasets.provenance?.[c]) noYear.push(`${d.id}:${c}`); continue; }
        lo = Math.min(lo, y); hi = Math.max(hi, y);
        if (y < 2020) stale.push(`${c} ${name(c)} ${d.id} ${y}`);
      }
    }
    add(noYear.length ? 'look' : 'pass', 'Every fetched figure records its source year',
      noYear.length
        ? `${noYear.length} carry no year and no manual-backfill provenance.`
        : `All ${withYears} fetched datasets carry a per-country year, spanning ${lo}–${hi}. A missing year marks the manual backfill, which carries a provenance string instead.`,
      noYear);
    add(stale.length ? 'look' : 'pass', 'Nothing pre-2020 is shown as though it were current',
      stale.length
        ? `${stale.length} predate 2020 — real, but worth labelling rather than showing undated beside a 2023 figure.`
        : 'Every fetched figure is 2020 or later.', stale);
  }

  // 11. the curated flag colours are the flag's colours
  {
    const noColors = codes.filter((c) => entities[c].hasFlagImage && !entities[c].hasFlag);
    add(noColors.length ? 'look' : 'pass', 'Every entity with a flag has its colours curated',
      noColors.length
        ? `${noColors.length} have a flag image but no colours, so they are absent from both colour quizzes.`
        : 'Every entity with a flag image has colours. Whether they are the right colours is checked per row in the Colors column.',
      noColors.map((c) => `${c} ${name(c)}`));
  }

  return out;
}

// Shape detail needs the per-country files, so it is separate: the rest of the checks are
// instant and this one is twenty fetches.
export async function checkOutlineDetail({ entities, datasets }, fetchShape) {
  const land = datasets.datasets.find((d) => d.id === 'land-area')?.values || {};
  const small = Object.keys(entities)
    .filter((c) => entities[c].hasGeometry && land[c] != null)
    .sort((a, b) => land[a] - land[b]).slice(0, 20);
  const rows = [];
  for (const c of small) {
    const shape = await fetchShape(c).catch(() => null);
    rows.push({
      code: c,
      pts: shape ? shape.polygons.reduce((a, p) => a + p.length, 0) : null,
      src: shape?.src ?? 'unrecorded',
    });
  }
  const thin = rows.filter((r) => r.pts != null && r.pts < 100);
  const ne = thin.filter((r) => r.src === 'ne');
  return {
    state: thin.length > ne.length ? 'look' : 'pass',
    what: 'The smallest countries get a detailed outline',
    detail: thin.length === 0
      ? `All ${rows.length} of the smallest carry 100+ point outlines.`
      : thin.length === ne.length
        ? `${ne.length} of the ${rows.length} smallest are under 100 points, and every one is a Natural Earth fallback — geoBoundaries has no ADM0 release for those territories, so that is the ceiling rather than a bug.`
        : `${thin.length} of the ${rows.length} smallest are under 100 points, and ${thin.length - ne.length} came from geoBoundaries — those are the ones worth a look.`,
    codes: rows.sort((a, b) => (a.pts ?? 1e9) - (b.pts ?? 1e9))
      .map((r) => `${r.code} ${entities[r.code].name} ${r.pts ?? 'missing'}pts·${r.src}`),
  };
}

// Scoring health (TODOS #73). The defects this catches do not throw and do not look
// wrong in a round — they look like the player drew badly. A perfect drawing of the
// Netherlands scored 0 for months because one Caribbean islet blew up the comparison
// frame, and nothing anywhere said so. These run the real scoreShape over every country,
// so a future change to the scoring that breaks one shows up here as a number.
//
// `ceilings` comes from scoreCeilings() in js/score-health.js — kept there because it
// needs the geometry and the masks, which this file deliberately does not import.
export function runScoringChecks(ceilings) {
  const out = [];
  const add = (state, what, detail, codes = []) => out.push({ state, what, detail, codes });
  if (!ceilings || !ceilings.length) {
    add('look', 'Scoring checks could not run', 'The country masks or outlines did not load.');
    return out;
  }

  // 1. Is there anything on the comparison grid at all? This is the Maldives failure:
  // 518 atolls that each rasterised to nothing, leaving an empty mask that no drawing
  // could score against. Only zero is a failure — Mauritius covers 8 cells of 6400 and
  // still reaches 100, so flagging thin-but-workable outlines would be crying wolf.
  {
    const empty = ceilings.filter((c) => c.ink === 0);
    const thin = [...ceilings].sort((a, b) => a.ink - b.ink).slice(0, 3);
    add(empty.length ? 'fail' : 'pass', 'Every country has an outline you can score against',
      empty.length
        ? `${empty.length} outline(s) cover none of the 6400 comparison cells, so nothing drawn can score against them.`
        : `All ${ceilings.length} outlines put something on the comparison grid. Thinnest: `
          + `${thin.map((c) => `${c.name} ${c.ink}`).join(', ')} cells of 6400.`,
      empty.map((c) => c.code));
  }

  // 2. The verdict. Everything that can go wrong with scoring shows up here as a number
  // below 100, whichever term it came from — the hover on the Draw column says which.
  {
    const short = ceilings.filter((c) => c.total < 100).sort((a, b) => a.total - b.total);
    add(short.length ? 'fail' : 'pass', 'A perfect drawing scores 100',
      short.length
        ? `${short.length} of ${ceilings.length} cannot reach 100 even drawn, placed and sized exactly right: `
          + `${short.slice(0, 6).map((c) => `${c.name} ${c.total} (shape ${c.shape}, size ${c.size}, place ${c.placement})`).join('; ')}`
          + `${short.length > 6 ? ', …' : ''}.`
        : `All ${ceilings.length} countries reach 100 — drawn, placed and sized exactly right, `
          + 'the real scoreShape returns 100/100/100.',
      short.map((c) => c.code));
  }

  return out;
}
