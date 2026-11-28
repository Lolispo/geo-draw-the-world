import * as bigger from './bigger.js';
import * as combo from './combo.js';
import * as oddOne from './odd-one.js';
import * as bestInGroup from './best-in-group.js';
import * as slider from './slider.js';
import * as shape from './shape.js';
import * as trade from './trade.js';
import * as religion from './religion.js';
import * as first from './first.js';
import * as outline from './outline.js';
import * as north from './north.js';
import * as flag from './flag.js';
import * as where from './where.js';
import * as emblem from './emblem.js';
import * as continent from './continent.js';
import * as order from './order.js';
import * as mix from './mix.js';
import * as flagMissing from './flag-missing.js';
import * as insert from './insert.js';
import * as topPick from './top-pick.js';
import * as flagPie from './flag-pie.js';

export const GENERATORS = {
  bigger: bigger.generate,
  combo: combo.generate,
  'odd-one': oddOne.generate,
  'best-in-group': bestInGroup.generate,
  slider: slider.generate,
  shape: shape.generate,
  trade: trade.generate,
  religion: religion.generate,
  first: first.generate,
  outline: outline.generate,
  north: north.generate,
  flag: flag.generate,
  where: where.generate,
  emblem: emblem.generate,
  continent: continent.generate,
  mix: mix.generate,
  'flag-missing': flagMissing.generate,
  order: order.generate,
  insert: insert.generate,
  'top-pick': topPick.generate,
  'flag-pie': flagPie.generate,
};
