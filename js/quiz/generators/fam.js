import { bandForFam } from '../bands.js';

// Countries whose familiarity puts them in this band — how slider, shape and religion
// questions get their difficulty.
export const inFamBand = (qd, codes, band) => codes.filter((c) => bandForFam(qd.famRank(c)) === band);
