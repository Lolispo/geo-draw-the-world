// The shape-match panel (TODOS #58, #72): the countries a drawing looks most like, each
// with your outline laid over theirs, and a search box for asking about any country in
// particular. One component, two hosts — the Draw results rail and Freestyle — because
// the question is the same in both and only the thing being pinned underneath differs.
//
// The scores here are not the round's Shape column, and the note in the header says so.
// A round scores against the world-scale geometry, where France is 17 rings spread from
// Guiana to Réunion; this panel scores against data/shapes, where it is the mainland and
// Corsica. Measured over 251 countries, the two agree exactly half the time and are
// within 1 point for three quarters — but for the ~37 countries with far-flung
// territories, and for microstates that are sub-pixel at world scale, they diverge by
// tens of points. The main landmass is the right outline for a drawing game; the honest
// fix for the mismatch is to name it, not to hide it.

import { matchShape, searchRanked, matchedVia } from './shape-match.js';
import { getCountryByCode } from './geo-data.js';
import { drawShapeOverlay } from './silhouette.js';
import { openCountryPanel } from './country-panel.js';
import { flagUrl } from './flags.js';

const TOP_N = 5;

const scoreClass = (v) => (v >= 70 ? 'match-good' : v >= 40 ? 'match-ok' : 'match-bad');

export function createShapeMatchPanel({ limit = TOP_N } = {}) {
  const el = document.createElement('div');
  el.className = 'match-panel';
  el.innerHTML = `
    <div class="match-head">
      <canvas class="match-yours" aria-label="your drawing"></canvas>
      <div class="match-head-text">
        <h3 class="match-title">Looks most like</h3>
        <p class="match-note">Shape only — your size and where you put it are ignored. Each
          country here is its main landmass, so these can differ from the round's Shape score.</p>
      </div>
    </div>
    <div class="match-status">Comparing…</div>
    <ol class="match-list"></ol>
    <div class="match-pinned"></div>
    <div class="match-search">
      <input class="match-search-input" type="search" autocomplete="off" spellcheck="false"
             placeholder="Score against any country…" aria-label="Score against any country">
      <ul class="match-search-results"></ul>
    </div>`;

  const yoursCanvas = el.querySelector('.match-yours');
  const titleEl = el.querySelector('.match-title');
  const statusEl = el.querySelector('.match-status');
  const listEl = el.querySelector('.match-list');
  const pinnedEl = el.querySelector('.match-pinned');
  const searchWrap = el.querySelector('.match-search');
  const input = el.querySelector('.match-search-input');
  const resultsEl = el.querySelector('.match-search-results');

  let polygons = null;
  let ranked = null;
  let byCode = null;
  let total = 0;
  let token = 0;          // guards against a slower earlier show() landing last

  // Outlines are fetched per country and cached by geo-data; a row renders its overlay
  // as soon as its own shape arrives rather than holding the whole list back.
  async function paintOverlay(canvas, code) {
    const country = await getCountryByCode(code);
    if (!country?.polygons?.length || !canvas.isConnected) return;
    drawShapeOverlay(canvas, polygons, country.polygons, { size: 52, color: country.color });
  }

  function row(entry, { showRank = true } = {}) {
    const li = document.createElement('li');
    li.className = 'match-row';
    li.dataset.code = entry.code;
    li.innerHTML = `
      <span class="match-rank">${showRank ? entry.rank : ''}</span>
      <canvas class="match-thumb" width="52" height="52"></canvas>
      <img class="match-flag" alt="" loading="lazy" src="${flagUrl(entry.code, 'w40')}">
      <span class="match-name">${entry.name}</span>
      <span class="match-score ${scoreClass(entry.score)}">${entry.score}</span>`;
    li.querySelector('.match-flag').addEventListener('error', (e) => { e.target.style.visibility = 'hidden'; });
    li.addEventListener('click', () => openCountryPanel(entry.code));
    paintOverlay(li.querySelector('.match-thumb'), entry.code);
    return li;
  }

  // The country the round was actually about, or one the player searched for. Carries
  // its rank, because "12th of 197" is the part that makes a low score make sense.
  function pin(entry, label) {
    pinnedEl.innerHTML = '';
    if (!entry) return;
    const wrap = document.createElement('div');
    wrap.className = 'match-pin';
    const cap = document.createElement('p');
    cap.className = 'match-pin-label';
    cap.textContent = label;
    const ul = document.createElement('ul');
    ul.className = 'match-list match-list-pinned';
    const li = row(entry);
    li.querySelector('.match-rank').textContent = `${entry.rank}${ordinal(entry.rank)}`;
    li.querySelector('.match-rank').classList.add('match-rank-long');
    ul.appendChild(li);
    wrap.append(cap, ul);
    pinnedEl.appendChild(wrap);
  }

  function renderSearch() {
    const q = input.value.trim();
    resultsEl.innerHTML = '';
    if (!q || !ranked) return;
    const hits = searchRanked(ranked, q);
    if (!hits.length) {
      const li = document.createElement('li');
      li.className = 'match-search-empty';
      li.textContent = 'No country by that name';
      resultsEl.appendChild(li);
      return;
    }
    for (const hit of hits) {
      const li = document.createElement('li');
      li.className = 'match-search-hit';
      const via = matchedVia(hit, q);
      li.innerHTML = `
        <span class="match-name">${hit.name}${via ? ` <em>(${via})</em>` : ''}</span>
        <span class="match-hit-rank">${hit.rank}${ordinal(hit.rank)} of ${total}</span>
        <span class="match-score ${scoreClass(hit.score)}">${hit.score}</span>`;
      li.addEventListener('click', () => {
        pin(hit, `You searched ${hit.name}`);
        input.value = '';
        resultsEl.innerHTML = '';
      });
      resultsEl.appendChild(li);
    }
  }

  input.addEventListener('input', renderSearch);
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { input.value = ''; resultsEl.innerHTML = ''; }
    if (e.key === 'Enter') { resultsEl.querySelector('.match-search-hit')?.click(); }
    e.stopPropagation();   // the results screen listens for keys of its own
  });

  // drawnPolygons: the player's outline. pinCode: the country they were meant to be
  // drawing, shown underneath whenever it did not make the top five.
  async function show(drawnPolygons, { pinCode = null, title = 'Looks most like' } = {}) {
    const mine = ++token;
    polygons = drawnPolygons;
    titleEl.textContent = title;
    listEl.innerHTML = '';
    pinnedEl.innerHTML = '';
    resultsEl.innerHTML = '';
    input.value = '';
    searchWrap.style.display = 'none';
    statusEl.style.display = '';
    statusEl.textContent = 'Comparing…';
    drawShapeOverlay(yoursCanvas, polygons, null, { size: 64 });

    let result;
    try {
      result = await matchShape(polygons);
    } catch (err) {
      if (mine !== token) return;
      statusEl.textContent = 'Could not load the country shapes to compare against.';
      console.error('shape match failed', err);
      return;
    }
    if (mine !== token) return;

    ({ ranked, byCode, total } = result);
    statusEl.style.display = 'none';
    searchWrap.style.display = '';

    for (const entry of ranked.slice(0, limit)) listEl.appendChild(row(entry));

    if (pinCode) {
      const target = byCode.get(pinCode);
      if (!target) {
        pin(null);
      } else if (target.rank > limit) {
        pin(target, `You were drawing ${target.name}`);
      } else {
        pinnedEl.innerHTML = `<p class="match-pin-label match-pin-hit">You were drawing ${target.name} — and it is in your top ${limit}.</p>`;
      }
    }
  }

  function clear() {
    token++;
    ranked = byCode = polygons = null;
    listEl.innerHTML = '';
    pinnedEl.innerHTML = '';
    resultsEl.innerHTML = '';
    input.value = '';
  }

  return { el, show, clear };
}

function ordinal(n) {
  const r100 = n % 100;
  if (r100 >= 11 && r100 <= 13) return 'th';
  return ['th', 'st', 'nd', 'rd'][n % 10] || 'th';
}
