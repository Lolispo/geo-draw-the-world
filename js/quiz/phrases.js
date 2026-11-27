// How each dataset reads in a comparison question. A dataset missing here is never
// compared, so a new dataset joins the quiz by getting a line.
//   two:  "Which ___: A or B?"     most/least: "Which of these ___?"
//   together: "Do A and B together ___ than C?" (summable data only)

export const PHRASES = {
  population: { two: 'has more people', most: 'has the most people', least: 'has the fewest people', together: 'have more people' },
  'gdp-nominal': { two: 'has the bigger economy (GDP)', most: 'has the biggest economy (GDP)', least: 'has the smallest economy (GDP)', together: 'have a bigger economy (GDP)' },
  'gdp-per-capita': { two: 'is richer per person (GDP per capita)', most: 'is richest per person (GDP per capita)', least: 'is poorest per person (GDP per capita)' },
  'land-area': { two: 'is bigger by land area', most: 'is biggest by land area', least: 'is smallest by land area', together: 'have more land area' },
  'life-expectancy': { two: 'has the higher life expectancy', most: 'has the highest life expectancy', least: 'has the lowest life expectancy' },
  exports: { two: 'exports more (in dollars)', most: 'exports the most (in dollars)', least: 'exports the least (in dollars)', together: 'export more (in dollars)' },
  urbanization: { two: 'has more of its people living in cities', most: 'has the most people living in cities (as a share)', least: 'has the fewest people living in cities (as a share)' },
  'export-share-gdp': { two: 'leans more on exports (% of GDP)', most: 'leans most on exports (% of GDP)', least: 'leans least on exports (% of GDP)' },
  'elec-nuclear-pct': { two: 'gets more of its electricity from nuclear', most: 'gets the most of its electricity from nuclear', least: 'gets the least of its electricity from nuclear' },
  'elec-coal-pct': { two: 'gets more of its electricity from coal', most: 'gets the most of its electricity from coal', least: 'gets the least of its electricity from coal' },
  'elec-renewable-pct': { two: 'gets more of its electricity from renewables', most: 'gets the most of its electricity from renewables', least: 'gets the least of its electricity from renewables' },
};
