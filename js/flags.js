// Flag image URLs.
//
// flagcdn covers every ISO-coded entity we carry. The de-facto states have no ISO
// code, so flagcdn has nothing for them (probed: 404 for all of them) — they ship
// as bundled public-domain SVGs under assets/flags/ instead (TODOS #20).

const CDN = 'https://flagcdn.com/';

// Served from assets/flags/<code>.svg rather than the CDN. Keep in sync with
// BUNDLED_FLAGS in scripts/build-entities.mjs, which sets `hasFlagImage` from it.
const BUNDLED = new Set(['xa', 'xc', 'xo', 'xs', 'xt']);

// `width` is a flagcdn size token (w40, w320, w640). Bundled SVGs ignore it — they
// scale to whatever the layout asks for.
export function flagUrl(code, width = 'w320') {
  return BUNDLED.has(code) ? `assets/flags/${code}.svg` : `${CDN}${width}/${code}.png`;
}
