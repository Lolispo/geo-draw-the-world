// The factbook's "independence" year is sometimes a re-founding (Russia 1991, China
// 1949, Iran 1979) or a legend (France 486), which would make "which became
// independent first?" plainly wrong. Only a year described as independence *from*
// someone answers that question.
// Russia and Serbia are the continuing states of the unions they are recorded as
// leaving, so their "from" years are re-foundings too.
const FROM = /\(from |independence from |declared from /i;
const CONTINUING_STATES = new Set(['ru', 'rs']);

export const independentFrom = (code, attrs) => !CONTINUING_STATES.has(code)
  && FROM.test(attrs?.independenceRaw || '');
