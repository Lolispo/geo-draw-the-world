// Hash routes (TODOS #56), so any screen can be opened by URL — handed to someone for
// review, bookmarked, or reloaded without clicking back through the menu.
//
// Hash, not path. The site deploys as raw static files, so /explore/map would need a
// 404-to-index rewrite in the hosting config; "#/explore/map" needs nothing, works the
// same on `python3 -m http.server` as on the live site, and gives back/forward free.

// "#/explore/map?metric=population" -> { segments: ['explore','map'], params }
export function readRoute() {
  const raw = location.hash.replace(/^#\/?/, '');
  const [path, query] = raw.split('?');
  return {
    segments: path.split('/').filter(Boolean).map(decodeURIComponent),
    params: new URLSearchParams(query || ''),
  };
}

// Commas survive encoding: a comma is a legal sub-delimiter in a path segment, and
// "#/draw/country/mv,tv,sc" is a URL someone can type or edit by hand, which
// "%2Ctv%2Csc" is not (TODOS #77).
const encodeSegment = (s) => encodeURIComponent(s).replace(/%2C/g, ',');

export function formatRoute(segments, params = {}) {
  const q = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null && v !== ''),
  ).toString();
  return `#/${segments.filter(Boolean).map(encodeSegment).join('/')}${q ? `?${q}` : ''}`;
}

// Replaces rather than pushes by default: switching the Explorer's view is not a page
// you want to press Back through five times.
export function writeRoute(segments, params = {}, { replace = true } = {}) {
  const hash = formatRoute(segments, params);
  if (hash === location.hash) return false;
  const url = location.pathname + location.search + hash;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  return true;
}
