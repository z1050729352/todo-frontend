export function isDuelRecord(entry) {
  return entry && entry.gameMode === 'duel' && entry.duel && typeof entry.duel === 'object';
}

export function getDuelWinner(entry) {
  if (!isDuelRecord(entry)) return null;
  const a = Number(entry.duel.aScore ?? 0);
  const b = Number(entry.duel.bScore ?? 0);
  if (a === b) return 'draw';
  return a > b ? 'A' : 'B';
}

export function getDuelNames(entry) {
  if (!isDuelRecord(entry)) return { aName: 'A', bName: 'B' };
  return {
    aName: entry.duel.aName || 'A',
    bName: entry.duel.bName || 'B'
  };
}

export function getDuelScores(entry) {
  if (!isDuelRecord(entry)) return { aScore: 0, bScore: 0 };
  return {
    aScore: Number(entry.duel.aScore ?? 0),
    bScore: Number(entry.duel.bScore ?? 0)
  };
}

