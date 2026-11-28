// One fetch per data file per page load. The promise is cached, not the result, so
// callers that ask at the same time share a request. A failure is not cached: the
// next caller tries again, and each caller keeps its own fallback.

const _cache = new Map();

export function loadJson(url) {
  if (!_cache.has(url)) {
    const p = fetch(url).then((r) => r.json());
    p.catch(() => _cache.delete(url));
    _cache.set(url, p);
  }
  return _cache.get(url);
}
