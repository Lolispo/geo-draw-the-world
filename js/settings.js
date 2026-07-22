// Small persisted app settings (localStorage). Keep keys stable.

const KEY_TERRITORIES = 'gdtw.includeTerritories';

// Include optional/dependent territories (TODOS #20) in the playable pools.
// Default OFF: standard play is sovereign countries + the usual dependencies.
export function getIncludeTerritories() {
  return localStorage.getItem(KEY_TERRITORIES) === '1';
}
export function setIncludeTerritories(on) {
  localStorage.setItem(KEY_TERRITORIES, on ? '1' : '0');
}
