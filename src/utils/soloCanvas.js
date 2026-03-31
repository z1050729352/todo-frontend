export function computeSoloWorldSize(deviceWidth, deviceHeight, options = {}) {
  const dw = Math.floor(Number(deviceWidth) || 0);
  const dh = Math.floor(Number(deviceHeight) || 0);
  if (!dw || !dh) return { worldWidth: 390, worldHeight: 844 };

  const baseWorldWidth = Math.floor(Number(options.baseWorldWidth) || 390);
  const minWorldHeight = Math.floor(Number(options.minWorldHeight) || 520);
  const maxWorldHeight = Math.floor(Number(options.maxWorldHeight) || 1400);

  const worldWidth = Math.max(260, baseWorldWidth);
  const ratio = dh / dw;
  const rawH = Math.round(worldWidth * ratio);
  const worldHeight = Math.max(minWorldHeight, Math.min(maxWorldHeight, rawH));
  return { worldWidth, worldHeight };
}

