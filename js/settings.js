// Small persisted app settings (localStorage). Keep keys stable.

const KEY_TERRITORIES = 'gdtw.includeTerritories';
const KEY_EXPLORE_TERRITORIES = 'gdtw.exploreTerritories';
const KEY_HIDE_ANSWERS = 'gdtw.hideAnswers';

// Include optional/dependent territories (TODOS #20) in the playable pools.
// Default OFF: standard play is sovereign countries + the usual dependencies.
export function getIncludeTerritories() {
  return localStorage.getItem(KEY_TERRITORIES) === '1';
}
export function setIncludeTerritories(on) {
  localStorage.setItem(KEY_TERRITORIES, on ? '1' : '0');
}

// The Data Explorer keeps its own (TODOS #65). Reading the data and playing with it
// are different jobs — wanting Greenland in a table says nothing about wanting it in
// a round — and sharing one flag meant answering that question in one place changed
// the other behind your back.
export function getExploreTerritories() {
  return localStorage.getItem(KEY_EXPLORE_TERRITORIES) === '1';
}
export function setExploreTerritories(on) {
  localStorage.setItem(KEY_EXPLORE_TERRITORIES, on ? '1' : '0');
}

// Keep the answers you never found off the results screen (TODOS #43), so Play
// Again is still a question. Default OFF: showing them is what the mode did first.
export function getHideAnswers() {
  return localStorage.getItem(KEY_HIDE_ANSWERS) === '1';
}
export function setHideAnswers(on) {
  localStorage.setItem(KEY_HIDE_ANSWERS, on ? '1' : '0');
}
