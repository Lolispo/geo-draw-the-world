// Main game controller

import {
  loadContinentData, loadCountryData, loadAllCountries, getDailyCountry,
  getContinentOrder, getContinentByName,
  createReferenceShape, createAllReferenceShapes, createCountryReferenceShapes,
  getCountryRegions, shuffleArray, getLargestCountries
} from './geo-data.js';
import { DrawingCanvas } from './drawing-canvas.js';
import { TransformControls } from './transform-controls.js';
import { WorldCanvas } from './world-canvas.js';
import { Shape } from './shape.js';
import { scoreShape } from './scoring.js';
import { getHighScore, saveScore } from './high-scores.js';
import { playShapeClose, playPlace, playSkip, playScoreReveal, playClick, playUndo } from './sounds.js';
import { MenuGlobe } from './menu-globe.js';
import { FlagGame } from './flag-game.js';
import { RankLineGame } from './rank-line-game.js';
import { DataExplorer } from './data-explorer.js';

const STATES = {
  MENU: 'menu',
  PROMPT: 'prompt',
  PEEK: 'peek',
  DRAWING: 'drawing',
  TRANSFORM: 'transform',
  PLACING: 'placing',
  RESULTS: 'results',
  FLAG_QUIZ: 'flag-quiz',
  RANK_LINE: 'rank-line',
  EXPLORE: 'explore'
};

class Game {
  constructor() {
    this.state = STATES.MENU;
    this.gameMode = null;
    this.puzzleMode = false;
    this.tweakMode = false;
    this.blindMode = false;
    this.explorerMode = false;
    this.hardMode = false;
    this.itemOrder = [];
    this.itemData = [];
    this.currentIndex = 0;
    this.scores = [];
    this.playerShapes = [];
    this.referenceShapes = [];
    this.devMode = false;
    this._allRefShapes = [];
    this._currentRegion = null;
    this._regionBounds = null;
    this._liveScoreEl = null;
    this._tweakingIndex = -1;

    // Speed round state
    this._timerInterval = null;
    this._timerEnd = 0;
    this._speedActive = false;

    // Streak state
    this._streakCount = 0;
    this._streakActive = false;

    this.screens = {
      menu: document.getElementById('screen-menu'),
      prompt: document.getElementById('screen-prompt'),
      peek: document.getElementById('screen-peek'),
      drawing: document.getElementById('screen-drawing'),
      transform: document.getElementById('screen-transform'),
      placing: document.getElementById('screen-placing'),
      results: document.getElementById('screen-results'),
      'flag-quiz': document.getElementById('screen-flag-quiz'),
      'rank-line': document.getElementById('screen-rank-line'),
      'explore': document.getElementById('screen-explore')
    };

    this.drawingCanvas = new DrawingCanvas(document.getElementById('canvas-drawing'));
    this.transformControls = new TransformControls(document.getElementById('canvas-transform'));
    this.worldCanvas = new WorldCanvas(document.getElementById('canvas-world'));
    this.resultsWorldCanvas = new WorldCanvas(document.getElementById('canvas-results'));
    this.menuGlobe = new MenuGlobe(document.getElementById('menu-globe-canvas'));
    this.flagGame = new FlagGame(
      document.getElementById('flag-game-container'),
      () => this.showScreen(STATES.MENU)
    );
    this.rankLineGame = new RankLineGame(
      document.getElementById('rank-line-container'),
      () => this.showScreen(STATES.MENU)
    );
    this.dataExplorer = new DataExplorer(
      document.getElementById('explore-container'),
      () => this.showScreen(STATES.MENU),
      (datasetId) => this.startRankLine(datasetId)
    );

    this._bindEvents();
  }

  async init() {
    await loadContinentData();
    this.devMode = new URLSearchParams(window.location.search).has('dev');
    this._updateDevBadge();
    this._sizeCanvases();
    this._updateHighScoreDisplay();
    this.showScreen(STATES.MENU);
  }

  _sizeCanvases() {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const isMobile = vw < 768;
    const pad = isMobile ? 16 : 40;
    const headerH = isMobile ? 70 : 50;

    const drawW = Math.min(vw - pad, 1200);
    const drawH = Math.min(vh - headerH - pad, 700);
    for (const id of ['canvas-drawing', 'canvas-transform', 'canvas-peek']) {
      const c = document.getElementById(id);
      c.width = drawW;
      c.height = drawH;
    }

    const worldW = Math.min(vw - pad, 1400);
    const worldH = Math.min(vh - headerH - pad, 800);
    document.getElementById('canvas-world').width = worldW;
    document.getElementById('canvas-world').height = worldH;

    const resultsW = isMobile ? vw - pad : Math.min(vw - 400, 1100);
    const resultsH = isMobile ? Math.min(vh * 0.4, 400) : Math.min(vh - 40, 800);
    document.getElementById('canvas-results').width = resultsW;
    document.getElementById('canvas-results').height = resultsH;
  }

  _updateDevBadge() {
    document.getElementById('dev-badge').style.display = this.devMode ? 'inline-block' : 'none';
  }

  _updateHighScoreDisplay() {
    for (const region of getCountryRegions()) {
      const btn = document.getElementById(`btn-${region.id}`);
      if (!btn) continue;
      const hs = getHighScore(`countries-${region.file}`);
      const badge = btn.querySelector('.hs-badge');
      if (hs) {
        if (badge) {
          badge.textContent = `Best: ${hs.score}`;
        } else {
          const span = document.createElement('span');
          span.className = 'hs-badge';
          span.textContent = `Best: ${hs.score}`;
          btn.appendChild(span);
        }
      }
    }
    // Show high scores for special buttons
    const specialModes = [
      { id: 'btn-continents', key: 'continents' },
      { id: 'btn-world', key: 'world' },
      { id: 'btn-quick10', key: 'quick10' },
      { id: 'btn-famous5', key: 'famous5' },
      { id: 'btn-speed', key: 'speed', label: 'Best' },
      { id: 'btn-streak', key: 'streak', label: 'Best' },
      { id: 'btn-flag-quiz', key: 'flag-quiz-10' },
    ];
    for (const { id, key, label } of specialModes) {
      const btn = document.getElementById(id);
      const hs = getHighScore(key);
      if (hs && btn) {
        let badge = btn.querySelector('.hs-badge');
        if (!badge) {
          badge = document.createElement('span');
          badge.className = 'hs-badge';
          btn.appendChild(badge);
        }
        badge.textContent = key === 'streak'
          ? `Best: ${hs.score} streak`
          : `Best: ${hs.score}`;
      }
    }
  }

  _bindEvents() {
    // Menu
    document.getElementById('btn-continents').addEventListener('click', () => this.startContinents());
    document.getElementById('btn-world').addEventListener('click', () => this.startWorld());
    document.getElementById('btn-daily').addEventListener('click', () => this.startDaily());
    document.getElementById('btn-quick10').addEventListener('click', () => this.startQuick10());
    document.getElementById('btn-speed').addEventListener('click', () => this.startSpeedRound());
    document.getElementById('btn-streak').addEventListener('click', () => this.startStreak());
    document.getElementById('btn-famous5').addEventListener('click', () => this.startFamous5());
    document.getElementById('btn-flag-quiz').addEventListener('click', () => this.startFlagQuiz());
    document.getElementById('btn-rank-line').addEventListener('click', () => this.startRankLine());
    document.getElementById('btn-explore').addEventListener('click', () => this.startExplore());

    // Country region buttons
    for (const region of getCountryRegions()) {
      const btn = document.getElementById(`btn-${region.id}`);
      if (btn) btn.addEventListener('click', () => this.startCountries(region.file));
    }

    // Puzzle mode toggle
    document.getElementById('btn-puzzle-toggle').addEventListener('click', () => {
      this.puzzleMode = !this.puzzleMode;
      this._updatePuzzleBadge();
      playClick();
    });

    // Tweak mode toggle
    document.getElementById('btn-tweak-toggle').addEventListener('click', () => {
      this.tweakMode = !this.tweakMode;
      this._updateTweakBadge();
      playClick();
    });

    // Blind mode toggle
    document.getElementById('btn-blind-toggle').addEventListener('click', () => {
      this.blindMode = !this.blindMode;
      this._updateBlindBadge();
      playClick();
    });

    // Explorer mode toggle
    document.getElementById('btn-explorer-toggle').addEventListener('click', () => {
      this.explorerMode = !this.explorerMode;
      this._updateExplorerBadge();
      playClick();
    });

    // Hard mode toggle
    document.getElementById('btn-hard-toggle').addEventListener('click', () => {
      this.hardMode = !this.hardMode;
      this._updateHardBadge();
      playClick();
    });

    // Drawing
    document.getElementById('btn-undo').addEventListener('click', () => {
      this.drawingCanvas.undo();
      playUndo();
    });
    document.getElementById('btn-clear').addEventListener('click', () => this.drawingCanvas.clear());
    document.getElementById('btn-done-drawing').addEventListener('click', () => this.onDrawingDone());
    document.getElementById('btn-skip').addEventListener('click', () => this.onSkip());

    this.drawingCanvas.onShapeComplete = () => {
      document.getElementById('btn-done-drawing').disabled = false;
      playShapeClose();
    };
    this.drawingCanvas.onAllClear = () => {
      document.getElementById('btn-done-drawing').disabled = true;
    };

    // Transform
    document.getElementById('btn-done-transform').addEventListener('click', () => this.onTransformDone());

    // Placing
    document.getElementById('btn-place').addEventListener('click', () => this.onPlace());

    // Tweak buttons
    document.getElementById('btn-tweak-prev').addEventListener('click', () => this._tweakSelect(-1));
    document.getElementById('btn-tweak-next').addEventListener('click', () => this._tweakSelect(1));
    document.getElementById('btn-tweak-done').addEventListener('click', () => this._tweakFinish());

    // Results
    document.getElementById('btn-play-again').addEventListener('click', () => this._replay());
    document.getElementById('btn-menu').addEventListener('click', () => {
      this.resultsWorldCanvas.deactivate();
      this.showScreen(STATES.MENU);
    });
    document.getElementById('btn-share').addEventListener('click', () => this._shareImage());
    document.getElementById('btn-share-text').addEventListener('click', () => this._shareText());

    // Dev toggle
    document.getElementById('btn-dev-toggle').addEventListener('click', () => {
      this.devMode = !this.devMode;
      this._updateDevBadge();
      const url = new URL(window.location);
      if (this.devMode) url.searchParams.set('dev', '1');
      else url.searchParams.delete('dev');
      window.history.replaceState({}, '', url);
      this.worldCanvas.showGhosts = this.devMode;
      this.worldCanvas.render();
      this.resultsWorldCanvas.render();
    });

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => this._onKeyDown(e));

    // Resize canvases on window resize / orientation change
    window.addEventListener('resize', () => this._sizeCanvases());

    // Live scoring: update on shape move
    this.worldCanvas.onShapeMove = () => this._updateLiveScore();
  }

  _onKeyDown(e) {
    if ((e.metaKey || e.ctrlKey) && e.key === 'z') {
      if (this.state === STATES.DRAWING) {
        e.preventDefault();
        this.drawingCanvas.undo();
        playUndo();
      }
      return;
    }

    switch (e.key) {
      case 'Enter':
        if (this.state === STATES.DRAWING) {
          const btn = document.getElementById('btn-done-drawing');
          if (!btn.disabled) this.onDrawingDone();
        } else if (this.state === STATES.TRANSFORM) {
          this.onTransformDone();
        } else if (this.state === STATES.PLACING) {
          this.onPlace();
        } else if (this.state === STATES.RESULTS) {
          this._replay();
        }
        break;
      case 'Escape':
        if (this.state === STATES.PEEK || this.state === STATES.DRAWING || this.state === STATES.TRANSFORM || this.state === STATES.PLACING) {
          this.onSkip();
        }
        break;
      case ' ':
        if (this.state === STATES.PLACING) {
          e.preventDefault();
          this.onPlace();
        } else if (this.state === STATES.RESULTS) {
          e.preventDefault();
          this._replay();
        }
        break;
    }
  }

  _updatePuzzleBadge() {
    const badge = document.getElementById('puzzle-badge');
    badge.style.display = this.puzzleMode ? 'inline-block' : 'none';
    const btn = document.getElementById('btn-puzzle-toggle');
    btn.classList.toggle('active', this.puzzleMode);
  }

  _updateTweakBadge() {
    const badge = document.getElementById('tweak-badge');
    badge.style.display = this.tweakMode ? 'inline-block' : 'none';
    const btn = document.getElementById('btn-tweak-toggle');
    btn.classList.toggle('active', this.tweakMode);
  }

  _updateBlindBadge() {
    const badge = document.getElementById('blind-badge');
    badge.style.display = this.blindMode ? 'inline-block' : 'none';
    const btn = document.getElementById('btn-blind-toggle');
    btn.classList.toggle('active', this.blindMode);
  }

  _updateExplorerBadge() {
    const badge = document.getElementById('explorer-badge');
    badge.style.display = this.explorerMode ? 'inline-block' : 'none';
    const btn = document.getElementById('btn-explorer-toggle');
    btn.classList.toggle('active', this.explorerMode);
  }

  _updateHardBadge() {
    const badge = document.getElementById('hard-badge');
    badge.style.display = this.hardMode ? 'inline-block' : 'none';
    const btn = document.getElementById('btn-hard-toggle');
    btn.classList.toggle('active', this.hardMode);
  }

  showScreen(state) {
    this.state = state;
    for (const [name, el] of Object.entries(this.screens)) {
      el.classList.toggle('active', name === state);
    }
    // Manage globe animation
    if (state === STATES.MENU) {
      this.menuGlobe.start();
      this._stopTimer();
      this._hideStreakCounter();
      this._speedActive = false;
      this._streakActive = false;
    } else {
      this.menuGlobe.stop();
    }
  }

  async startContinents() {
    this.gameMode = 'continents';
    this._currentRegion = null;
    this._regionBounds = null;
    this.itemOrder = getContinentOrder();
    this.itemData = shuffleArray(this.itemOrder.map(name => getContinentByName(name)));
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = createAllReferenceShapes();
    this._startGame();
  }

  async startCountries(regionFile) {
    this.gameMode = `countries-${regionFile}`;
    this._currentRegion = regionFile;

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadCountryData(regionFile);
    this._regionBounds = data.regionBounds || null;
    this.itemData = shuffleArray(data.countries);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = createCountryReferenceShapes(data);
    this._startGame();
  }

  async startWorld() {
    this.gameMode = 'world';
    this._currentRegion = 'world';

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadAllCountries();
    this._regionBounds = null;
    this.itemData = shuffleArray(data.countries);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = data.countries.map(c => createReferenceShape(c));
    this._startGame();
  }

  async startDaily() {
    this.gameMode = 'daily';
    this._currentRegion = 'daily';

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const { country, allCountries } = await getDailyCountry();
    this._regionBounds = null;
    this.itemData = [country];
    this.itemOrder = [country.name];
    this._allRefShapes = allCountries.map(c => createReferenceShape(c));
    this._startGame();
  }

  async startQuick10() {
    this.gameMode = 'quick10';
    this._currentRegion = 'quick10';

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadAllCountries();
    this._regionBounds = null;
    const shuffled = shuffleArray(data.countries);
    this.itemData = shuffled.slice(0, 10);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = data.countries.map(c => createReferenceShape(c));
    this._startGame();
  }

  async startSpeedRound() {
    this.gameMode = 'speed';
    this._currentRegion = 'speed';
    this._speedActive = true;

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadAllCountries();
    this._regionBounds = null;
    // Lots of countries — player does as many as they can in 3 minutes
    this.itemData = shuffleArray(data.countries);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = data.countries.map(c => createReferenceShape(c));
    this._startGame();
    this._startTimer(180); // 3 minutes
  }

  async startStreak() {
    this.gameMode = 'streak';
    this._currentRegion = 'streak';
    this._streakActive = true;
    this._streakCount = 0;

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadAllCountries();
    this._regionBounds = null;
    this.itemData = shuffleArray(data.countries);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = data.countries.map(c => createReferenceShape(c));
    this._showStreakCounter();
    this._startGame();
  }

  async startFamous5() {
    this.gameMode = 'famous5';
    this._currentRegion = 'famous5';

    document.getElementById('prompt-name').textContent = 'Loading...';
    this.showScreen(STATES.PROMPT);

    const data = await loadAllCountries();
    this._regionBounds = null;
    const biggest = getLargestCountries(data.countries, 5);
    this.itemData = shuffleArray(biggest);
    this.itemOrder = this.itemData.map(c => c.name);
    this._allRefShapes = data.countries.map(c => createReferenceShape(c));
    this._startGame();
  }

  async startFlagQuiz() {
    this.gameMode = 'flag-quiz';
    this._currentRegion = 'flag-quiz';
    await this.flagGame.loadData();
    this.showScreen(STATES.FLAG_QUIZ);
    this.flagGame.start(10);
  }

  async startRankLine(datasetId = null) {
    this.gameMode = 'rank-line';
    this._currentRegion = 'rank-line';
    await this.rankLineGame.loadData();
    this.showScreen(STATES.RANK_LINE);
    if (datasetId) this.rankLineGame.start(datasetId);
    else this.rankLineGame.showPicker();
  }

  async startExplore(datasetId = 'gdp-nominal') {
    this.gameMode = 'explore';
    this._currentRegion = 'explore';
    await this.dataExplorer.loadData();
    this.showScreen(STATES.EXPLORE);
    this.dataExplorer.start(datasetId);
  }

  _replay() {
    this.resultsWorldCanvas.deactivate();
    if (this.gameMode === 'continents') this.startContinents();
    else if (this.gameMode === 'world') this.startWorld();
    else if (this.gameMode === 'daily') this.startDaily();
    else if (this.gameMode === 'quick10') this.startQuick10();
    else if (this.gameMode === 'famous5') this.startFamous5();
    else if (this.gameMode === 'speed') this.startSpeedRound();
    else if (this.gameMode === 'streak') this.startStreak();
    else if (this.gameMode === 'flag-quiz') this.startFlagQuiz();
    else if (this.gameMode === 'rank-line') this.startRankLine();
    else this.startCountries(this._currentRegion);
  }

  _startGame() {
    this.currentIndex = 0;
    this.scores = [];
    this.playerShapes = [];
    this.referenceShapes = [];
    this.worldCanvas.placedShapes = [];
    this.worldCanvas.referenceShapes = this._allRefShapes;
    this.worldCanvas.showGhosts = this.devMode;
    this.worldCanvas.setRegionBounds(this._regionBounds);
    this.worldCanvas.tweakMode = false;

    // Reset special mode state if not active
    if (this.gameMode !== 'speed') {
      this._speedActive = false;
      this._stopTimer();
    }
    if (this.gameMode !== 'streak') {
      this._streakActive = false;
      this._hideStreakCounter();
    }

    // In classic modes with >15 items, auto-place the first one as a freebie
    // (skip for speed/streak — those are endless-ish)
    if (this.itemData.length > 15 && !this._speedActive && !this._streakActive) {
      this._autoPlaceFirst();
    }

    this.promptNext();
  }

  // Place the first item automatically using the reference shape (freebie)
  _autoPlaceFirst() {
    const entry = this.itemData[0];
    const refShape = createReferenceShape(entry);
    this.referenceShapes.push(refShape);

    // Create a clone of the reference as the "player" shape
    const playerShape = new Shape(entry.polygons, entry.name, entry.color);
    playerShape.position = refShape.position.slice();
    playerShape.scale = refShape.scale;
    playerShape.rotation = refShape.rotation;
    this.playerShapes.push(playerShape);
    this.worldCanvas.placedShapes.push(playerShape);

    this.scores.push({ name: entry.name, shape: 100, size: 100, placement: 100, total: 100, freebie: true });
    this.currentIndex = 1;
  }

  promptNext() {
    // Speed round: check if time is up
    if (this._speedActive && Date.now() >= this._timerEnd) {
      this._onSpeedTimeUp();
      return;
    }

    if (this.currentIndex >= this.itemOrder.length) {
      if (this.tweakMode && this.playerShapes.length > 0) {
        this._enterTweakPhase();
        return;
      }
      this.showResults();
      return;
    }

    const entry = this.itemData[this.currentIndex];

    // Blind mode: hide name, show "???" on prompt
    if (this.blindMode) {
      document.getElementById('prompt-name').textContent = '???';
    } else {
      document.getElementById('prompt-name').textContent = entry.name;
    }

    // Streak/speed show count differently
    if (this._streakActive) {
      document.getElementById('prompt-number').textContent = `Streak: ${this._streakCount}`;
    } else if (this._speedActive) {
      document.getElementById('prompt-number').textContent = `#${this.currentIndex + 1}`;
    } else {
      document.getElementById('prompt-number').textContent =
        `${this.currentIndex + 1} of ${this.itemOrder.length}`;
    }
    document.getElementById('prompt-color').style.backgroundColor = entry.color;

    // Show skip for non-continent modes (but not streak — skipping = losing)
    const showSkip = this.gameMode !== 'continents' && !this._streakActive;
    document.getElementById('btn-skip').style.display = showSkip ? 'inline-block' : 'none';

    this.showScreen(STATES.PROMPT);

    // Shorter prompt time in speed mode
    const promptDelay = this._speedActive ? 600 : 1200;

    if (this.puzzleMode) {
      setTimeout(() => this._startPuzzlePlacing(), promptDelay);
    } else if (this.explorerMode) {
      setTimeout(() => this._startPeek(), promptDelay);
    } else {
      setTimeout(() => this.startDrawing(), promptDelay);
    }
  }

  _startPeek() {
    const entry = this.itemData[this.currentIndex];
    const peekLabel = this.blindMode ? '???' : entry.name;
    document.getElementById('peek-label').textContent = `Memorize: ${peekLabel}`;

    this.showScreen(STATES.PEEK);

    // Draw the reference shape on the peek canvas
    const canvas = document.getElementById('canvas-peek');
    const ctx = canvas.getContext('2d');
    const w = canvas.width;
    const h = canvas.height;

    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = '#161b22';
    ctx.fillRect(0, 0, w, h);

    // Create a temporary reference shape to render
    const refShape = createReferenceShape(entry);
    const bb = refShape.getBoundingBox();
    const shapeW = bb.maxX - bb.minX;
    const shapeH = bb.maxY - bb.minY;
    const pad = 60;
    const scale = Math.min((w - pad * 2) / shapeW, (h - pad * 2) / shapeH);
    const offsetX = w / 2 - (bb.minX + shapeW / 2) * scale;
    const offsetY = h / 2 - (bb.minY + shapeH / 2) * scale;

    ctx.save();
    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);
    refShape.draw(ctx, { fillAlpha: 0.5 });
    ctx.restore();

    // Label
    ctx.fillStyle = '#8b949e';
    ctx.font = "13px 'Space Grotesk', system-ui, sans-serif";
    ctx.textAlign = 'center';
    ctx.fillText('Study this shape — you\'ll draw it from memory', w / 2, h - 16);

    // Countdown
    let remaining = 4;
    const timerEl = document.getElementById('peek-timer');
    timerEl.textContent = remaining;

    const countdownInterval = setInterval(() => {
      remaining--;
      timerEl.textContent = remaining;
      if (remaining <= 0) {
        clearInterval(countdownInterval);
        this.startDrawing();
      }
    }, 1000);

    // Store so we can clean up on skip
    this._peekCountdown = countdownInterval;
  }

  startDrawing() {
    const entry = this.itemData[this.currentIndex];
    if (this.blindMode) {
      document.getElementById('drawing-label').innerHTML = `Draw: <span class="blind-label">???</span>`;
    } else {
      document.getElementById('drawing-label').textContent = `Draw: ${entry.name}`;
    }
    document.getElementById('btn-done-drawing').disabled = true;

    this.showScreen(STATES.DRAWING);
    this.drawingCanvas.activate();
  }

  onSkip() {
    // In streak mode, skipping ends the streak
    if (this._streakActive) {
      this.scores.push({ name: this.itemData[this.currentIndex]?.name || '?', shape: 0, size: 0, placement: 0, total: 0, skipped: true });
      if (this.state === STATES.PEEK && this._peekCountdown) {
        clearInterval(this._peekCountdown);
        this._peekCountdown = null;
      }
      if (this.state === STATES.DRAWING) this.drawingCanvas.deactivate();
      if (this.state === STATES.TRANSFORM) this.transformControls.deactivate();
      if (this.state === STATES.PLACING) this.worldCanvas.deactivate();
      this._onStreakEnd();
      return;
    }

    const entry = this.itemData[this.currentIndex];
    const refShape = createReferenceShape(entry);
    this.referenceShapes.push(refShape);
    this.scores.push({ name: entry.name, shape: 0, size: 0, placement: 0, total: 0, skipped: true });

    if (this.state === STATES.PEEK && this._peekCountdown) {
      clearInterval(this._peekCountdown);
      this._peekCountdown = null;
    }
    if (this.state === STATES.DRAWING) this.drawingCanvas.deactivate();
    if (this.state === STATES.TRANSFORM) this.transformControls.deactivate();
    if (this.state === STATES.PLACING) this.worldCanvas.deactivate();

    playSkip();
    this.currentIndex++;
    this.promptNext();
  }

  onDrawingDone() {
    const polygons = this.drawingCanvas.getAllPolygons();
    if (polygons.length === 0) return;

    this.drawingCanvas.deactivate();

    const entry = this.itemData[this.currentIndex];
    this.currentShape = new Shape(polygons, entry.name, entry.color);

    // Reveal name in transform/place stages even in blind mode
    document.getElementById('transform-label').textContent = `Resize & Rotate: ${entry.name}`;
    this.showScreen(STATES.TRANSFORM);
    this.transformControls.setWorldParams(this._regionBounds, 1600, 900);
    // Hard mode: no hint shape for scale reference
    if (this.hardMode) {
      this.transformControls.setReferenceShapes([], entry.name);
    } else {
      this.transformControls.setReferenceShapes(this._allRefShapes, entry.name);
    }
    this.transformControls.activate(this.currentShape);
  }

  onTransformDone() {
    this.transformControls.deactivate();

    const entry = this.itemData[this.currentIndex];
    document.getElementById('placing-label').textContent = `Place: ${entry.name}`;
    this.showScreen(STATES.PLACING);
    if (!this.hardMode) {
      this._showLiveScore();
    }
    this.worldCanvas.activate();
    this.worldCanvas.setActiveShape(this.currentShape);
  }

  _startPuzzlePlacing() {
    const entry = this.itemData[this.currentIndex];
    const refShape = createReferenceShape(entry);
    this.currentShape = new Shape(entry.polygons, entry.name, entry.color);
    this.currentShape.position = refShape.position.slice();
    this.currentShape.scale = refShape.scale;
    this.currentShape.rotation = (Math.random() - 0.5) * Math.PI * 0.8;
    const offsetRange = this._regionBounds
      ? Math.max(this._regionBounds.maxX - this._regionBounds.minX, this._regionBounds.maxY - this._regionBounds.minY) * 0.2
      : 200;
    this.currentShape.position[0] += (Math.random() - 0.5) * offsetRange;
    this.currentShape.position[1] += (Math.random() - 0.5) * offsetRange;

    document.getElementById('placing-label').textContent = `Place & Rotate: ${entry.name}`;
    this.showScreen(STATES.PLACING);
    // No live score in placement-only mode
    this.worldCanvas.activate();
    this.worldCanvas.enableRotation = true;
    this.worldCanvas.setActiveShape(this.currentShape);
  }

  onPlace() {
    this.worldCanvas.placeActiveShape();
    this.worldCanvas.enableRotation = false;
    this.playerShapes.push(this.currentShape);

    const entry = this.itemData[this.currentIndex];
    const refShape = createReferenceShape(entry);
    this.referenceShapes.push(refShape);

    const score = this.puzzleMode
      ? this._scorePuzzle(this.currentShape, refShape)
      : scoreShape(this.currentShape, refShape);
    this.scores.push({ name: entry.name, ...score });

    this._hideLiveScore();
    this._flashScore(score.total);
    this.worldCanvas.deactivate();
    playPlace();

    // Streak mode: check if score is high enough to continue
    if (this._streakActive) {
      if (score.total >= 25) {
        this._streakCount++;
        this._updateStreakDisplay();
        this.currentIndex++;
        this.promptNext();
      } else {
        // Streak over
        this._onStreakEnd();
      }
      return;
    }

    // Speed round: check timer
    if (this._speedActive && Date.now() >= this._timerEnd) {
      this._onSpeedTimeUp();
      return;
    }

    this.currentIndex++;
    this.promptNext();
  }

  _scorePuzzle(playerShape, refShape) {
    const score = scoreShape(playerShape, refShape);
    score.shape = 100;
    score.size = 100;
    score.total = Math.round(100 * 0.4 + 100 * 0.3 + score.placement * 0.3);
    return score;
  }

  // --- Live scoring ---
  _showLiveScore() {
    let el = document.getElementById('live-score');
    if (!el) return;
    el.style.display = 'block';
    el.textContent = '';
  }

  _hideLiveScore() {
    const el = document.getElementById('live-score');
    if (el) el.style.display = 'none';
  }

  _updateLiveScore() {
    if (this.state !== STATES.PLACING || !this.currentShape || this.puzzleMode || this.hardMode) return;
    const el = document.getElementById('live-score');
    if (!el) return;

    const entry = this.itemData[this.currentIndex];
    const refShape = createReferenceShape(entry);
    const score = scoreShape(this.currentShape, refShape);

    el.textContent = `Score: ${score.total}`;
    el.style.color = score.total >= 60 ? '#3fb950' : score.total >= 30 ? '#d29922' : '#f85149';
  }

  // --- Timer (speed round) ---
  _startTimer(seconds) {
    this._timerEnd = Date.now() + seconds * 1000;
    const timerEl = document.getElementById('game-timer');
    timerEl.style.display = 'block';
    timerEl.classList.remove('urgent');

    this._updateTimerDisplay();
    this._timerInterval = setInterval(() => {
      const remaining = Math.max(0, this._timerEnd - Date.now());
      if (remaining <= 0) {
        this._onSpeedTimeUp();
        return;
      }
      if (remaining < 30000) {
        timerEl.classList.add('urgent');
      }
      this._updateTimerDisplay();
    }, 250);
  }

  _updateTimerDisplay() {
    const remaining = Math.max(0, this._timerEnd - Date.now());
    const secs = Math.ceil(remaining / 1000);
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    document.getElementById('timer-display').textContent =
      `${m}:${s.toString().padStart(2, '0')}`;
  }

  _stopTimer() {
    if (this._timerInterval) {
      clearInterval(this._timerInterval);
      this._timerInterval = null;
    }
    const timerEl = document.getElementById('game-timer');
    if (timerEl) {
      timerEl.style.display = 'none';
      timerEl.classList.remove('urgent');
    }
  }

  _onSpeedTimeUp() {
    this._speedActive = false;
    this._stopTimer();

    // Clean up active screens
    if (this.state === STATES.PEEK && this._peekCountdown) {
      clearInterval(this._peekCountdown);
      this._peekCountdown = null;
    }
    if (this.state === STATES.DRAWING) this.drawingCanvas.deactivate();
    if (this.state === STATES.TRANSFORM) this.transformControls.deactivate();
    if (this.state === STATES.PLACING) {
      this.worldCanvas.enableRotation = false;
      this.worldCanvas.deactivate();
    }
    this._hideLiveScore();

    this._showToast("Time's up!");
    this.showResults();
  }

  // --- Streak ---
  _showStreakCounter() {
    const el = document.getElementById('streak-counter');
    if (el) {
      el.style.display = 'flex';
      this._updateStreakDisplay();
    }
  }

  _hideStreakCounter() {
    const el = document.getElementById('streak-counter');
    if (el) el.style.display = 'none';
  }

  _updateStreakDisplay() {
    const el = document.getElementById('streak-display');
    if (el) el.textContent = this._streakCount;
  }

  _onStreakEnd() {
    this._streakActive = false;
    this._hideStreakCounter();

    // Clean up active screens
    if (this.state === STATES.PEEK && this._peekCountdown) {
      clearInterval(this._peekCountdown);
      this._peekCountdown = null;
    }
    if (this.state === STATES.DRAWING) this.drawingCanvas.deactivate();
    if (this.state === STATES.TRANSFORM) this.transformControls.deactivate();
    if (this.state === STATES.PLACING) {
      this.worldCanvas.enableRotation = false;
      this.worldCanvas.deactivate();
    }
    this._hideLiveScore();

    const lastScore = this.scores[this.scores.length - 1];
    this._showToast(`Streak over! Scored ${lastScore?.total || 0} (need 25+)`);
    this.showResults();
  }

  // --- Tweak phase ---
  _enterTweakPhase() {
    document.getElementById('placing-label').textContent = 'Tweak Mode: Adjust Placements';
    document.getElementById('btn-place').style.display = 'none';
    document.getElementById('tweak-controls').style.display = 'flex';

    this.showScreen(STATES.PLACING);
    this.worldCanvas.showGhosts = true;
    this.worldCanvas.tweakMode = true;
    this.worldCanvas.activate();

    this._tweakingIndex = 0;
    this._tweakHighlight();
  }

  _tweakSelect(dir) {
    if (this.playerShapes.length === 0) return;
    this._tweakingIndex = (this._tweakingIndex + dir + this.playerShapes.length) % this.playerShapes.length;
    this._tweakHighlight();
    playClick();
  }

  _tweakHighlight() {
    const shape = this.playerShapes[this._tweakingIndex];
    if (!shape) return;
    this.worldCanvas.setActiveShape(shape);
    this.worldCanvas.placedShapes = this.playerShapes.filter((_, i) => i !== this._tweakingIndex);
    document.getElementById('tweak-label').textContent =
      `${shape.name} (${this._tweakingIndex + 1}/${this.playerShapes.length})`;
    this.worldCanvas.render();
  }

  _tweakFinish() {
    if (this._tweakingIndex >= 0 && this._tweakingIndex < this.playerShapes.length) {
      this.worldCanvas.placeActiveShape();
    }
    this.worldCanvas.placedShapes = [...this.playerShapes];
    this.worldCanvas.activeShape = null;
    this.worldCanvas.tweakMode = false;
    this.worldCanvas.deactivate();

    document.getElementById('btn-place').style.display = '';
    document.getElementById('tweak-controls').style.display = 'none';

    this.scores = this.playerShapes.map((shape, i) => {
      const entry = this.itemData[i];
      if (!entry) return this.scores[i];
      const refShape = this.referenceShapes[i];
      if (!refShape) return this.scores[i];
      if (this.scores[i]?.skipped) return this.scores[i];
      const score = this.puzzleMode
        ? this._scorePuzzle(shape, refShape)
        : scoreShape(shape, refShape);
      return { name: entry.name, ...score };
    });

    this.showResults();
  }

  // --- Score flash ---
  _flashScore(total) {
    const el = document.getElementById('score-flash');
    if (!el) return;
    el.classList.remove('show');
    el.textContent = total;
    el.style.color = total >= 70 ? '#3fb950' : total >= 40 ? '#d29922' : '#f85149';
    // Force reflow to restart animation
    void el.offsetWidth;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 1300);
  }

  // --- Share ---
  _shareImage() {
    const canvas = document.getElementById('canvas-results');
    try {
      canvas.toBlob((blob) => {
        if (!blob) return;
        if (navigator.clipboard && window.ClipboardItem) {
          navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })]);
          this._showToast('Screenshot copied to clipboard!');
        } else {
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `geo-draw-${this.gameMode}.png`;
          a.click();
          URL.revokeObjectURL(url);
          this._showToast('Screenshot downloaded!');
        }
      }, 'image/png');
    } catch {
      this._showToast('Could not capture screenshot');
    }
  }

  _shareText() {
    const scored = this.scores.filter(s => !s.skipped && !s.freebie);
    const avg = scored.length > 0
      ? Math.round(scored.reduce((s, x) => s + x.total, 0) / scored.length)
      : 0;

    // Build emoji grid: each score maps to a colored square
    const scoreToEmoji = (t) => {
      if (t >= 80) return '🟩';
      if (t >= 60) return '🟨';
      if (t >= 40) return '🟧';
      return '🟥';
    };

    const modeName = {
      'continents': 'Continents',
      'world': 'World',
      'daily': 'Daily',
      'quick10': 'Quick 10',
      'famous5': 'Famous 5',
      'speed': 'Speed Round',
      'streak': 'Streak',
    }[this.gameMode] || this.gameMode.replace('countries-', '').replace(/-/g, ' ');

    let lines = [`Geo Draw the World — ${modeName}`];

    if (this.gameMode === 'streak') {
      lines.push(`Streak: ${this._streakCount}`);
    } else if (this.gameMode === 'speed') {
      lines.push(`${scored.length} countries — ${avg}/100`);
    } else {
      lines.push(`${avg}/100`);
    }

    // Emoji row(s) — max 10 per row
    const emojis = this.scores.map(s => {
      if (s.skipped) return '⬛';
      if (s.freebie) return '⬜';
      return scoreToEmoji(s.total);
    });

    for (let i = 0; i < emojis.length; i += 10) {
      lines.push(emojis.slice(i, i + 10).join(''));
    }

    // Modifiers
    const mods = [];
    if (this.puzzleMode) mods.push('Placement Only');
    if (this.blindMode) mods.push('Blind');
    if (this.hardMode) mods.push('Hard');
    if (this.explorerMode) mods.push('Explorer');
    if (mods.length) lines.push(mods.join(' + '));

    const text = lines.join('\n');

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text);
      this._showToast('Scorecard copied to clipboard!');
    } else {
      // Fallback: select in a textarea
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      this._showToast('Scorecard copied!');
    }
  }

  _showToast(msg) {
    let toast = document.getElementById('toast');
    if (!toast) return;
    toast.textContent = msg;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), 2500);
  }

  showResults() {
    // Make sure special mode overlays are hidden
    this._stopTimer();
    this._hideStreakCounter();

    this.showScreen(STATES.RESULTS);

    this.resultsWorldCanvas.placedShapes = [...this.playerShapes];
    this.resultsWorldCanvas.referenceShapes = this._allRefShapes;
    this.resultsWorldCanvas.showGhosts = true;
    this.resultsWorldCanvas.setRegionBounds(this._regionBounds);
    this.resultsWorldCanvas.activate();

    playScoreReveal();

    const tbody = document.getElementById('score-body');
    tbody.innerHTML = '';
    let totalScore = 0;
    let counted = 0;

    const scoreClass = (v) => v >= 70 ? 'score-good' : v >= 40 ? 'score-ok' : 'score-bad';

    for (let si = 0; si < this.scores.length; si++) {
      const s = this.scores[si];
      const tr = document.createElement('tr');
      if (s.skipped) tr.classList.add('skipped');
      if (s.freebie) tr.classList.add('freebie');
      tr.style.animationDelay = `${si * 0.06}s`;
      const label = s.skipped ? 'skip' : s.freebie ? 'free' : s.total;
      const totalClass = !s.skipped && !s.freebie ? scoreClass(s.total) : '';
      tr.innerHTML = `
        <td><span class="score-color" style="background:${this.itemData[si]?.color || '#ccc'}"></span>${s.name}</td>
        <td>${s.skipped ? '—' : s.shape}</td>
        <td>${s.skipped ? '—' : s.size}</td>
        <td>${s.skipped ? '—' : s.placement}</td>
        <td class="${totalClass}"><strong>${label}</strong></td>
      `;
      tbody.appendChild(tr);
      if (!s.skipped && !s.freebie) {
        totalScore += s.total;
        counted++;
      }
    }

    const avg = counted > 0 ? Math.round(totalScore / counted) : 0;
    document.getElementById('total-score').textContent = `${avg}/100`;
    document.getElementById('score-counted').textContent =
      `${counted}/${this.scores.length} completed`;

    let grade = 'Keep practicing!';
    if (avg >= 80) grade = 'Geography master!';
    else if (avg >= 60) grade = 'Great job!';
    else if (avg >= 40) grade = 'Not bad!';
    document.getElementById('score-grade').textContent = grade;

    // Extra stats for special modes
    const extraEl = document.getElementById('results-extra');
    if (extraEl) {
      if (this.gameMode === 'speed') {
        extraEl.textContent = `Completed ${counted} countries in 3 minutes`;
        extraEl.style.display = 'block';
      } else if (this.gameMode === 'streak') {
        extraEl.textContent = `Streak: ${this._streakCount} countries`;
        extraEl.style.display = 'block';
      } else if (this.blindMode) {
        extraEl.textContent = 'Blind Mode';
        extraEl.style.display = 'block';
      } else {
        extraEl.style.display = 'none';
      }
    }

    // For streak, save streak count as the "score" for high score tracking
    const scoreToSave = this.gameMode === 'streak' ? this._streakCount : avg;
    const isNew = saveScore(this.gameMode, scoreToSave, counted, this.scores.length);
    const hsEl = document.getElementById('high-score-note');
    if (hsEl) {
      if (isNew) {
        hsEl.textContent = this.gameMode === 'streak'
          ? `New best streak: ${this._streakCount}!`
          : 'New high score!';
        hsEl.style.display = 'block';
      } else {
        const prev = getHighScore(this.gameMode);
        if (prev) {
          hsEl.textContent = this.gameMode === 'streak'
            ? `Best streak: ${prev.score}`
            : `High score: ${prev.score}/100`;
          hsEl.style.display = 'block';
        } else {
          hsEl.style.display = 'none';
        }
      }
    }

    // For streak mode, override the big score display
    if (this.gameMode === 'streak') {
      document.getElementById('total-score').textContent = `${this._streakCount}`;
      document.getElementById('score-grade').textContent =
        this._streakCount >= 15 ? 'Unstoppable!' :
        this._streakCount >= 10 ? 'On fire!' :
        this._streakCount >= 5 ? 'Solid streak!' : 'Try again!';
    }

    // For speed mode, override grade based on count
    if (this.gameMode === 'speed') {
      document.getElementById('score-grade').textContent =
        counted >= 15 ? 'Speed demon!' :
        counted >= 10 ? 'Quick hands!' :
        counted >= 5 ? 'Getting there!' : 'Take your time... wait';
    }

    const modeLabel = document.getElementById('results-mode');
    if (modeLabel) {
      const suffix = this.puzzleMode ? ' (Placement Only)' : '';
      const blindSuffix = this.blindMode ? ' (Blind)' : '';
      const hardSuffix = this.hardMode ? ' (Hard)' : '';
      const explorerSuffix = this.explorerMode ? ' (Explorer)' : '';
      const modeName = {
        'continents': 'Continents',
        'world': 'World',
        'daily': 'Daily',
        'quick10': 'Quick 10',
        'famous5': 'Famous 5',
        'speed': 'Speed Round',
        'streak': 'Streak',
      }[this.gameMode] || this.gameMode.replace('countries-', '').replace(/-/g, ' ');
      modeLabel.textContent = modeName + suffix + blindSuffix + hardSuffix + explorerSuffix;
    }
  }
}

try {
  const game = new Game();
  game.init().catch(err => {
    console.error('Failed to initialize:', err);
    document.body.innerHTML = `<pre style="color:red;padding:20px">Init error: ${err.message}\n${err.stack}</pre>`;
  });
} catch (err) {
  console.error('Constructor error:', err);
  document.body.innerHTML = `<pre style="color:red;padding:20px">Constructor error: ${err.message}\n${err.stack}</pre>`;
}
