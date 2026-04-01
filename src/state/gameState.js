import { reactive } from 'vue';

export function createPlayerHUDData() {
  return {
    returnButton: false,
    gameTime: 0,
    score: 0,
    bulletType: 'normal',
    bulletLevel: 0,
    attackPower: 0,
    spreadLevel: 0,
    pierceLevel: 0,
    pierceReductionPct: 0,
    fireRate: 1,
    missilePodLevel: 0,
    damageBoost: 0,
    health: 100,
    pauseButton: true
  };
}

export const GameState = reactive({
  player1: createPlayerHUDData(),
  player2: createPlayerHUDData()
});

export function updatePlayerHUD(playerIndex, patch) {
  const key = playerIndex === 2 ? 'player2' : 'player1';
  const target = GameState[key];
  if (!target) return;
  Object.assign(target, patch && typeof patch === 'object' ? patch : {});
}
