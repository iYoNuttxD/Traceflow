function nextCivilDay(dateText) {
  const date = new Date(`${dateText}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function localDateKey(formatter, instant) {
  const parts = Object.fromEntries(
    formatter.formatToParts(new Date(instant)).map(({ type, value }) => [type, value])
  );
  return `${parts.year.padStart(4, '0')}-${parts.month}-${parts.day}`;
}

// Primeiro instante UTC pertencente ao dia civil no fuso solicitado. A busca
// lida com dias de 23/25 horas e com transições que ocorrem à meia-noite.
function startOfCivilDay(dateText, formatter) {
  const anchor = Date.parse(`${dateText}T00:00:00.000Z`);
  let low = anchor - 36 * 60 * 60 * 1000;
  let high = anchor + 48 * 60 * 60 * 1000;
  while (low < high) {
    const middle = Math.floor((low + high) / 2);
    if (localDateKey(formatter, middle) < dateText) low = middle + 1;
    else high = middle;
  }
  return new Date(low);
}

export function normalizeIndicatorPeriod({ startDate, endDate, timeZone }) {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    calendar: 'gregory',
    numberingSystem: 'latn'
  });
  const startInclusive = startOfCivilDay(startDate, formatter);
  const endExclusive = startOfCivilDay(nextCivilDay(endDate), formatter);
  return { startDate, endDate, timeZone, startInclusive, endExclusive };
}
