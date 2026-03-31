export const LOGICAL_WIDTH = 844;
export const LOGICAL_HEIGHT = 390;

export function computeViewport(deviceWidth, deviceHeight) {
  const dw = Number(deviceWidth);
  const dh = Number(deviceHeight);
  const scaleX = dw / LOGICAL_WIDTH;
  const scaleY = dh / LOGICAL_HEIGHT;
  const scale = Math.min(scaleX, scaleY);
  const viewWidth = LOGICAL_WIDTH * scale;
  const viewHeight = LOGICAL_HEIGHT * scale;
  const offsetX = (dw - viewWidth) / 2;
  const offsetY = (dh - viewHeight) / 2;
  return { scale, viewWidth, viewHeight, offsetX, offsetY };
}

export function clampInWorld(x, y, marginX = 0, marginY = 0) {
  const nx = Math.max(marginX, Math.min(LOGICAL_WIDTH - marginX, Number(x)));
  const ny = Math.max(marginY, Math.min(LOGICAL_HEIGHT - marginY, Number(y)));
  return { x: nx, y: ny };
}
