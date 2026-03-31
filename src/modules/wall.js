export function applyWallPickup(maxCount = 4) {
  return Math.max(0, Math.min(4, maxCount));
}

export function consumeWallOnCross({ wallCount }) {
  const count = Math.max(0, Math.min(4, Number(wallCount) || 0));
  if (count > 0) return { consumed: true, wallCount: count - 1 };
  return { consumed: false, wallCount: 0 };
}

