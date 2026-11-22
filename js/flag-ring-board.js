// Flag Ring's memory: the top three of every round, per mode, and the teams for a draw.
// Everything lives in this browser's localStorage.

import { flagUrl } from './flags.js';

const RUNS = 'flagRing.runs';
const TEAMS = 'flagRing.teams';
const KEEP = 50;
export const ENTRIES = 100;

const MEDALS = ['🥇', '🥈', '🥉'];

function read(key, fallback) {
  try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; }
}
function write(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode */ }
}
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// A mode is everything that changes how a round plays, so boards only compare like with like.
export function modeKey({ region, territories, collide }) {
  if (region === 'teams') return `teams|${collide ? 'c' : ''}`;
  return `${region}|${territories ? 't' : ''}|${collide ? 'c' : ''}`;
}

export function modeLabel({ region, territories, collide }, regionName) {
  const parts = [region === 'teams' ? 'Team draw' : regionName];
  if (territories && region !== 'teams') parts.push('territories');
  parts.push(collide ? 'collisions on' : 'collisions off');
  return parts.join(' · ');
}

// A session is this browser tab: it survives a reload and ends when the tab is closed.
export const SESSION = (() => {
  try {
    let id = sessionStorage.getItem('flagRing.session');
    if (!id) {
      id = Math.random().toString(36).slice(2, 10);
      sessionStorage.setItem('flagRing.session', id);
    }
    return id;
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
})();

export function runsFor(key, sessionOnly = false) {
  const runs = read(RUNS, {})[key] || [];
  return sessionOnly ? runs.filter((r) => r.s === SESSION) : runs;
}

export function saveRun(key, run) {
  const all = read(RUNS, {});
  all[key] = [{ ...run, s: SESSION }, ...(all[key] || [])].slice(0, KEEP);
  write(RUNS, all);
}

// Clears what the board is showing: this session's rounds, or all of them.
export function clearRuns(key, sessionOnly = false) {
  const all = read(RUNS, {});
  if (sessionOnly) all[key] = (all[key] || []).filter((r) => r.s !== SESSION);
  else delete all[key];
  write(RUNS, all);
}

const brief = (f) => ({ code: f.code, name: f.name });

// What a finished round is remembered by. In a team draw the "flag" of a body is its team,
// and a team places by its best entry, so the top three are always three different teams.
export function roundResult(sim, { watch = [], teams = null } = {}) {
  const ranked = [...sim.bodies].sort((a, b) => a.place - b.place);
  const seen = new Set();
  const order = [];
  for (const b of ranked) {
    if (seen.has(b.flag.code)) continue;
    seen.add(b.flag.code);
    order.push(b);
  }
  const kills = new Map();
  for (const b of sim.bodies) {
    if (!b.kills) continue;
    const k = kills.get(b.flag.code) || { ...brief(b.flag), n: 0 };
    k.n += b.kills;
    kills.set(b.flag.code, k);
  }
  const run = {
    t: Date.now(),
    total: sim.total,
    top: order.slice(0, 3).map((b) => brief(b.flag)),
    kills: [...kills.values()].sort((a, b) => b.n - a.n).slice(0, 5),
  };
  if (teams) {
    run.teams = order.map((b, i) => ({
      ...brief(b.flag), place: i + 1,
      entries: sim.bodies.filter((x) => x.flag.code === b.flag.code).length,
    }));
  } else {
    run.watched = watch.map((code) => {
      const b = sim.bodies.find((x) => x.flag.code === code);
      return b ? { ...brief(b.flag), place: b.place } : null;
    }).filter(Boolean);
  }
  return run;
}

function ordinal(n) {
  const s = ['th', 'st', 'nd', 'rd'], v = n % 100;
  return n + (s[(v - 20) % 10] || s[v] || s[0]);
}

function ago(t) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 1) return 'just now';
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  return new Date(t).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
}

const img = (code, cls = '') => `<img class="${cls}" src="${flagUrl(code, 'w40')}" alt="">`;

export function renderScores(el, { key, label, openRun, sessionOnly }) {
  const runs = runsFor(key, sessionOnly);
  const medals = new Map();
  const kills = new Map();
  for (const r of runs) {
    r.top.forEach((f, i) => {
      const m = medals.get(f.code) || { ...f, c: [0, 0, 0] };
      m.c[i]++;
      medals.set(f.code, m);
    });
    for (const k of r.kills || []) {
      const t = kills.get(k.code) || { ...k, n: 0 };
      t.n += k.n;
      kills.set(k.code, t);
    }
  }
  const table = [...medals.values()]
    .sort((a, b) => b.c[0] - a.c[0] || b.c[1] - a.c[1] || b.c[2] - a.c[2]).slice(0, 5);
  const killers = [...kills.values()].sort((a, b) => b.n - a.n).slice(0, 5);

  el.innerHTML = `
    <div class="frp-head"><h3>Scores</h3><button type="button" class="frp-close" aria-label="Close">×</button></div>
    <div class="frp-scope" role="group" aria-label="Which rounds">
      <button type="button" data-scope="session" aria-pressed="${!!sessionOnly}">This session</button>
      <button type="button" data-scope="all" aria-pressed="${!sessionOnly}">All time</button>
    </div>
    <div class="frp-mode">${esc(label)} · ${runs.length} round${runs.length === 1 ? '' : 's'}</div>
    ${runs.length ? `
      <h4>Most medals</h4>
      <ol class="frp-table">${table.map((m) => `<li>${img(m.code)}<span>${esc(m.name)}</span>
        <em>${m.c.map((n, i) => (n ? `${MEDALS[i]}${n}` : '')).join(' ')}</em></li>`).join('')}</ol>
      ${killers.length ? `<h4>Most kills</h4>
        <ol class="frp-table">${killers.map((k) => `<li>${img(k.code)}<span>${esc(k.name)}</span><em>☠ ${k.n}</em></li>`).join('')}</ol>` : ''}
      <h4>Rounds</h4>
      <ul class="frp-runs">${runs.map((r, i) => `
        <li><button type="button" class="frp-run${openRun === i ? ' open' : ''}" data-run="${i}">
          <span class="frp-when">${ago(r.t)}</span>
          <span class="frp-podium">${r.top.map((f) => img(f.code)).join('')}</span>
        </button>${openRun === i ? runDetail(r) : ''}</li>`).join('')}</ul>
      <button type="button" class="btn frp-clear">${sessionOnly ? "Clear this session's rounds" : 'Clear this board'}</button>`
    : `<p class="frp-empty">${sessionOnly ? 'No finished rounds in this mode since this tab was opened.' : 'No finished rounds in this mode yet.'} Results land here when a round ends.</p>`}`;
}

function runDetail(r) {
  const row = (f, tail) => `<li>${img(f.code)}<span>${esc(f.name)}</span><em>${tail}</em></li>`;
  let html = `<div class="frp-detail"><ol class="frp-table">${r.top.map((f, i) => row(f, MEDALS[i])).join('')}</ol>`;
  if (r.teams?.length > 3) {
    html += `<h5>Everyone</h5><ol class="frp-table">${r.teams.slice(3)
      .map((t) => row(t, ordinal(t.place))).join('')}</ol>`;
  }
  if (r.watched?.length) {
    html += `<h5>Watched</h5><ol class="frp-table">${r.watched
      .map((w) => row(w, `${ordinal(w.place)} of ${r.total}`)).join('')}</ol>`;
  }
  if (r.kills?.length) {
    html += `<h5>Kills</h5><ol class="frp-table">${r.kills.map((k) => row(k, `☠ ${k.n}`)).join('')}</ol>`;
  }
  return html + `<div class="frp-meta">${new Date(r.t).toLocaleString()} · ${r.total} ${r.teams ? 'entries' : 'flags'}</div></div>`;
}

// ---- Team draw -------------------------------------------------------------------------

const DEFAULT_TEAMS = [
  { name: 'Team 1', code: 'se', points: 10 },
  { name: 'Team 2', code: 'no', points: 10 },
  { name: 'Team 3', code: 'dk', points: 10 },
  { name: 'Team 4', code: 'fi', points: 10 },
];

export function loadTeams() {
  const t = read(TEAMS, null);
  return Array.isArray(t) && t.length ? t : DEFAULT_TEAMS.map((x) => ({ ...x }));
}

export function saveTeams(teams) {
  write(TEAMS, teams);
}

// Points become a share of a fixed number of entries. Rounding down and then handing the
// leftovers to the largest remainders keeps the total exact.
export function splitEntries(teams, total = ENTRIES) {
  const pts = teams.map((t) => Math.max(0, Number(t.points) || 0));
  const sum = pts.reduce((a, b) => a + b, 0);
  if (!sum) return teams.map(() => 0);
  const raw = pts.map((p) => (p / sum) * total);
  const out = raw.map(Math.floor);
  let left = total - out.reduce((a, b) => a + b, 0);
  raw.map((r, i) => [r - out[i], i]).sort((a, b) => b[0] - a[0])
    .forEach(([, i]) => { if (left > 0 && pts[i] > 0) { out[i]++; left--; } });
  return out;
}

export function renderTeams(el, teams, byCode) {
  const counts = splitEntries(teams);
  const codes = teams.map((t) => t.code);
  const shared = codes.some((c, i) => codes.indexOf(c) !== i);
  el.innerHTML = `
    <div class="frp-head"><h3>Team draw</h3><button type="button" class="frp-close" aria-label="Close">×</button></div>
    <p class="frp-help">Points become a share of ${ENTRIES} entries, each one a copy of the team's flag.
      The team whose flag is last inside wins.</p>
    <div class="frp-teams">${teams.map((t, i) => `
      <div class="frp-team" data-i="${i}">
        ${img(t.code, 'frp-team-flag')}
        <input class="frp-name" value="${esc(t.name)}" aria-label="Team name" maxlength="30">
        <input class="frp-flag" value="${esc(byCode.get(t.code)?.name || t.code)}" list="flag-ring-names" aria-label="Flag" autocomplete="off">
        <input class="frp-points" type="number" min="0" step="1" inputmode="numeric" value="${t.points}" aria-label="Points">
        <span class="frp-share">${counts[i]}<small>%</small></span>
        <button type="button" class="frp-remove" aria-label="Remove team"${teams.length <= 2 ? ' disabled' : ''}>×</button>
      </div>`).join('')}
    </div>
    <p class="frp-warn"${shared ? '' : ' hidden'}>Two teams share a flag, so their entries look the same in the ring.</p>
    <div class="frp-actions">
      <button type="button" class="btn frp-add">+ Add team</button>
      <button type="button" class="btn btn-accent frp-go">Start draw</button>
    </div>`;
}
