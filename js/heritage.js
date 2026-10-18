// UNESCO World Heritage sites (TODOS #46) — the data, and the one card both surfaces
// draw with.
//
// Two places show sites: a section in the country panel ("what is in the UK") and the
// Explorer's heritage wall ("show me everything"). They share `siteCard` so a change to
// how a site looks lands in both, which is the mistake TODOS #75 is still open about in
// the Top 10 input styles.
//
// Photos are Commons filenames hotlinked through Special:FilePath, the same arrangement
// flags and emblems use — UNESCO's own images are on a host that answers 403 to
// everything, so they are not an option.

const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

let _data = null;

export async function loadHeritage() {
  if (_data) return _data;
  try {
    const resp = await fetch('data/heritage.json');
    _data = await resp.json();
  } catch {
    _data = { heritage: {} };
  }
  return _data;
}

// A country's sites, already ordered famous-first by the build.
export function sitesFor(code) {
  return _data?.heritage?.[code]?.sites || [];
}

export function heritageCount(code) {
  return _data?.heritage?.[code]?.total ?? 0;
}

export function allSites() {
  const out = [];
  for (const [code, h] of Object.entries(_data?.heritage || {})) {
    for (const s of h.sites) out.push({ ...s, code });
  }
  // Transboundary sites appear under each state party, which is right in a country's
  // own list but would show the same photo several times on one wall.
  const seen = new Set();
  return out
    .filter((s) => !seen.has(s.id) && seen.add(s.id))
    .sort((a, b) => (b.fame || 0) - (a.fame || 0) || a.name.localeCompare(b.name));
}

export function sitePhoto(site, width = 320) {
  return site.img ? `${COMMONS}${encodeURIComponent(site.img)}?width=${width}` : null;
}

const CAT_LABEL = { cultural: 'Cultural', natural: 'Natural', mixed: 'Mixed' };

// One site, as a row (panel) or a tile (wall). `flag` adds the country, which the wall
// needs and a country's own panel does not.
//
// The inscription year is deliberately NOT shown. It is the year UNESCO added the site,
// which says nothing about the site — "Stonehenge · 1986" invites you to read 1986 as a
// date about Stonehenge (owner, 2026-10-18). A construction date would be the
// interesting number, and Wikidata's inception property was tried: 41% coverage, no
// natural sites by definition, and wrong where it does exist — it dates Machu Picchu to
// 1981. A blank is better than a confident wrong year, so the field is carried in the
// data and left out of the card.
export function siteCard(site, { tile = false, flag = null } = {}) {
  const el = document.createElement(tile ? 'div' : 'li');
  el.className = tile ? 'whs-tile' : 'whs-row';
  el.title = site.name;

  const photo = sitePhoto(site, tile ? 400 : 160);
  const shot = document.createElement('div');
  shot.className = 'whs-shot';
  if (photo) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    img.loading = 'lazy';
    // A site with no usable photo keeps its slot rather than collapsing the row.
    img.addEventListener('error', () => { img.remove(); shot.classList.add('whs-shot--empty'); });
    shot.appendChild(img);
  } else {
    shot.classList.add('whs-shot--empty');
  }

  const body = document.createElement('div');
  body.className = 'whs-body';
  const name = document.createElement('div');
  name.className = 'whs-name';
  name.textContent = site.name;
  const meta = document.createElement('div');
  meta.className = 'whs-meta';
  meta.textContent = [tile ? null : rankLabel(site), flag || null, CAT_LABEL[site.cat] || site.cat]
    .filter(Boolean).join(' · ');
  body.append(name, meta);

  if (site.danger) {
    const d = document.createElement('span');
    d.className = 'whs-danger';
    d.textContent = 'In danger';
    body.appendChild(d);
  }

  // On a tile the position goes on the photograph, where it survives the name wrapping
  // to two lines.
  if (tile && site.rank) {
    const badge = document.createElement('span');
    badge.className = 'whs-rank';
    badge.textContent = `#${site.rank}`;
    badge.title = RANK_TITLE;
    shot.appendChild(badge);
  }

  el.append(shot, body);
  return el;
}

// UNESCO does not rank its sites, so this must never read as though it does.
const RANK_TITLE = 'Position in this app\u2019s most-written-about order '
  + '(how many Wikipedia languages cover the site). UNESCO does not rank its sites.';

function rankLabel(site) {
  return site.rank ? `#${site.rank}` : null;
}
