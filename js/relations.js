// Trade partners (TODOS #30) — who a country sells to, who it buys from, and who names
// it back.
//
// The first country→country data the app carries, so this module owns one thing the
// other data modules do not need: a reverse index. It is built on load from the forward
// lists rather than stored in the file, which is what guarantees "a top export
// destination for 72 countries" can never disagree with the 72 lists that say so.

import { getEntity } from './datasets.js';
import { flagUrl } from './flags.js';

let _data = null;
let _reverse = null;   // { exports: { code: [owner codes] }, imports: {...} }

export async function loadRelations() {
  if (_data) return _data;
  try {
    const resp = await fetch('data/relations.json');
    _data = await resp.json();
  } catch {
    _data = { relations: {} };
  }
  buildReverse();
  return _data;
}

function buildReverse() {
  const rev = { exports: {}, imports: {} };
  for (const [owner, e] of Object.entries(_data.relations || {})) {
    for (const [dir, key] of [['exports', 'exportPartners'], ['imports', 'importPartners']]) {
      for (const p of e[key] || []) {
        if (!p.code) continue;
        (rev[dir][p.code] = rev[dir][p.code] || []).push(owner);
      }
    }
  }
  for (const dir of Object.values(rev)) {
    for (const list of Object.values(dir)) {
      list.sort((a, b) => name(a).localeCompare(name(b)));
    }
  }
  _reverse = rev;
}

const name = (code) => getEntity(code)?.name || code;

export function tradeFor(code) {
  return _data?.relations?.[code] || null;
}

export function hasTrade(code) {
  return !!_data?.relations?.[code];
}

// Who names `code` in their own top five. 'exports' = they sell to it (it is a market);
// 'imports' = they buy from it (it is a supplier).
export function namedBy(code, dir) {
  return _reverse?.[dir]?.[code] || [];
}

// ---- rendering -----------------------------------------------------------

const DIRS = {
  exports: { key: 'exportPartners', yearKey: 'exportYear', label: 'Sends exports to' },
  imports: { key: 'importPartners', yearKey: 'importYear', label: 'Buys imports from' },
};

// The widest share in either direction. Both sections scale to it, so the bars compare
// across the pair — Sweden buys 17% of its imports from Germany and sends it 10% of its
// exports, and that has to be visible as two different lengths. Per-section scaling drew
// both at full width, which said the opposite of the numbers beside them.
function scaleFor(entry) {
  const all = [...(entry.exportPartners || []), ...(entry.importPartners || [])];
  return Math.max(...all.map((r) => r.pct || 0), 1);
}

// One direction's top five, as flag + name + bar + share. `onPick` makes the rows
// navigable; without it they are plain.
export function partnerSection(code, dir, onPick) {
  const entry = tradeFor(code);
  const spec = DIRS[dir];
  const rows = entry?.[spec.key] || [];
  if (!rows.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'cp-trade-section';
  const head = document.createElement('div');
  head.className = 'cp-section-label';
  head.textContent = spec.label;
  const year = entry[spec.yearKey];
  if (year) {
    const y = document.createElement('span');
    y.className = 'cp-trade-year';
    y.textContent = year;
    head.appendChild(y);
  }
  wrap.appendChild(head);

  // Monaco and the Crown dependencies are published as a bare list of names. There is
  // no denominator to draw a bar against, so say so rather than invent one — the same
  // call religion makes for San Marino (TODOS #52).
  const quantified = rows.some((r) => r.pct != null);
  if (!quantified) {
    const note = document.createElement('div');
    note.className = 'cp-section-note';
    note.textContent = 'no shares published — partners in the source’s order';
    wrap.appendChild(note);
  }

  const max = scaleFor(entry);
  for (const r of rows) {
    wrap.appendChild(partnerRow(r, max, quantified, onPick));
  }
  return wrap;
}

function partnerRow(r, max, quantified, onPick) {
  const row = document.createElement(r.code && onPick ? 'button' : 'div');
  row.className = 'cp-trade-row'
    + (quantified ? '' : ' cp-trade-row--nameonly')
    + (r.code && onPick ? ' is-clickable' : '');

  const flag = document.createElement('img');
  flag.className = 'cp-trade-flag';
  flag.src = flagUrl(r.code || '', 'w40');
  flag.alt = '';
  flag.loading = 'lazy';
  flag.addEventListener('error', () => { flag.style.visibility = 'hidden'; });
  row.appendChild(flag);

  // The registry name, not the source's shorthand: the Factbook writes "USA" and
  // "S. Korea", and a row that opens a panel titled something else reads as a bug.
  const label = document.createElement('span');
  label.className = 'cp-trade-name';
  label.textContent = r.code ? name(r.code) : r.name;
  row.appendChild(label);

  if (quantified) {
    const barWrap = document.createElement('div');
    barWrap.className = 'cp-rel-bar';
    const bar = document.createElement('div');
    bar.className = 'cp-rel-fill';
    bar.style.width = `${((r.pct || 0) / max) * 100}%`;
    barWrap.appendChild(bar);
    row.appendChild(barWrap);

    const pct = document.createElement('span');
    pct.className = 'cp-rel-pct';
    pct.textContent = r.pct != null ? `${r.pct}%` : '—';
    row.appendChild(pct);
  }

  if (r.code && onPick) {
    row.title = `Open ${name(r.code)}`;
    row.addEventListener('click', () => onPick(r.code));
  }
  return row;
}

const RECIPROCAL = {
  exports: (n) => `A top export destination for ${n} ${n === 1 ? 'country' : 'countries'}`,
  imports: (n) => `A top import source for ${n} ${n === 1 ? 'country' : 'countries'}`,
};
const RECIPROCAL_TITLE = {
  exports: 'Countries that name this one among the five they sell the most to',
  imports: 'Countries that name this one among the five they buy the most from',
};
const GRID_CAP = 24;

// The reciprocal pair, as two expandable lines. Omitted entirely when nobody names the
// country — which is the common case: the median country is named three times, but 129
// of them are never named at all.
export function reciprocalSection(code, onPick) {
  const lines = [];
  for (const dir of ['exports', 'imports']) {
    const who = namedBy(code, dir);
    if (who.length) lines.push([dir, who]);
  }
  if (!lines.length) return null;

  const wrap = document.createElement('div');
  wrap.className = 'cp-trade-section cp-trade-reciprocal';
  const head = document.createElement('div');
  head.className = 'cp-section-label';
  head.textContent = 'In the world’s top five';
  wrap.appendChild(head);

  for (const [dir, who] of lines) {
    const line = document.createElement('button');
    line.className = 'cp-trade-recip-line';
    line.title = RECIPROCAL_TITLE[dir];
    const caret = document.createElement('span');
    caret.className = 'cp-trade-caret';
    caret.textContent = '▸';
    const text = document.createElement('span');
    text.textContent = RECIPROCAL[dir](who.length);
    line.append(caret, text);

    const grid = document.createElement('div');
    grid.className = 'cp-trade-grid';
    grid.hidden = true;

    let drawn = 0;
    const draw = (n) => {
      grid.innerHTML = '';
      for (const c of who.slice(0, n)) grid.appendChild(flagChip(c, onPick));
      drawn = n;
      if (who.length > n) {
        const more = document.createElement('button');
        more.className = 'cp-trade-more';
        more.textContent = `+${who.length - n} more`;
        more.addEventListener('click', () => draw(who.length));
        grid.appendChild(more);
      }
    };

    line.addEventListener('click', () => {
      grid.hidden = !grid.hidden;
      caret.textContent = grid.hidden ? '▸' : '▾';
      if (!grid.hidden && !drawn) draw(Math.min(GRID_CAP, who.length));
    });

    wrap.append(line, grid);
  }
  return wrap;
}

function flagChip(code, onPick) {
  const chip = document.createElement(onPick ? 'button' : 'span');
  chip.className = 'cp-trade-chip' + (onPick ? ' is-clickable' : '');
  const img = document.createElement('img');
  img.src = flagUrl(code, 'w40');
  img.alt = '';
  img.loading = 'lazy';
  img.addEventListener('error', () => { img.style.visibility = 'hidden'; });
  const label = document.createElement('span');
  label.textContent = name(code);
  chip.append(img, label);
  if (onPick) {
    chip.title = `Open ${name(code)}`;
    chip.addEventListener('click', () => onPick(code));
  }
  return chip;
}
