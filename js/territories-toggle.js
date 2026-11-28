// The one Territories button. Every game that follows the shared setting uses this,
// so it reads and behaves the same wherever it appears.

import { getIncludeTerritories, setIncludeTerritories } from './settings.js';
import { playClick } from './sounds.js';

// `onChange(on)` runs after the setting is saved: the caller rebuilds whatever the
// pool decides. `el.sync()` repaints from the stored setting when something else
// changed it.
export function territoriesToggle({ onChange } = {}) {
  const b = document.createElement('button');
  b.type = 'button';
  b.className = 'btn territories-toggle';
  b.title = 'Include small dependent and autonomous territories in the pool';
  const sync = () => {
    const on = getIncludeTerritories();
    b.setAttribute('aria-pressed', String(on));
    b.textContent = `🏝️ Territories: ${on ? 'On' : 'Off'}`;
  };
  b.addEventListener('click', () => {
    playClick();
    setIncludeTerritories(!getIncludeTerritories());
    sync();
    onChange?.(getIncludeTerritories());
  });
  b.sync = sync;
  sync();
  return b;
}
