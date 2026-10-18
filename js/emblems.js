// Coat of arms / state emblem images (TODOS #31).
//
// Hotlinked from Wikimedia Commons, the same arrangement flags have with flagcdn:
// data/emblems.json carries only the filename, so nothing is downloaded into the repo
// and the licensing question that makes state emblems awkward does not arise here.
//
// Special:FilePath redirects to the real thumbnail and rasterises SVG on the way, so one
// URL shape works for every file whatever it is stored as.

const COMMONS = 'https://commons.wikimedia.org/wiki/Special:FilePath/';

let _emblems = null;

export async function loadEmblems() {
  if (_emblems) return _emblems;
  try {
    const resp = await fetch('data/emblems.json');
    _emblems = (await resp.json()).emblems;
  } catch {
    // A country without an emblem renders nothing, so a failed fetch costs the feature
    // and not the panel it sits in.
    _emblems = {};
  }
  return _emblems;
}

export function hasEmblem(code) {
  return !!(_emblems && _emblems[code]);
}

// `width` is a pixel width Commons will render the thumbnail at.
export function emblemUrl(code, width = 240) {
  const file = _emblems && _emblems[code];
  if (!file) return null;
  return `${COMMONS}${encodeURIComponent(file)}?width=${width}`;
}

export function emblemFile(code) {
  return (_emblems && _emblems[code]) || null;
}
