// 简单的模拟测试脚本，验证双人血量共享机制
import assert from 'assert';

// 模拟 Vue refs
const ref = (val) => ({ value: val });

function createGameInstance(isMultiplayer = true) {
  const health = ref(100);
  const teammateHealth = ref(100);
  let isGameOver = false;

  function endGame() {
    isGameOver = true;
  }

  function takeDamage(amount) {
    if (health.value > 0) {
      if (health.value >= amount) {
        health.value -= amount;
      } else {
        const remaining = amount - health.value;
        health.value = 0;
        if (isMultiplayer) {
          teammateHealth.value = Math.max(0, teammateHealth.value - remaining);
        }
      }
    } else if (isMultiplayer) {
      teammateHealth.value = Math.max(0, teammateHealth.value - amount);
    } else {
      health.value = Math.max(0, health.value - amount);
    }
    
    if (health.value <= 0 && (!isMultiplayer || teammateHealth.value <= 0)) {
      endGame();
    }
  }

  function healPlayer(amount) {
    if (health.value < 100) {
      if (health.value + amount <= 100) {
        health.value += amount;
      } else {
        const remaining = amount - (100 - health.value);
        health.value = 100;
        if (isMultiplayer) {
          teammateHealth.value = Math.min(100, teammateHealth.value + remaining);
        }
      }
    } else if (isMultiplayer) {
      teammateHealth.value = Math.min(100, teammateHealth.value + amount);
    }
  }

  return { health, teammateHealth, takeDamage, healPlayer, get isGameOver() { return isGameOver; } };
}

console.log("开始执行血量共享机制单元测试...");

// 测试用例1：单人模式扣血
let game = createGameInstance(false);
game.takeDamage(30);
assert.strictEqual(game.health.value, 70);
game.takeDamage(80);
assert.strictEqual(game.health.value, 0);
assert.strictEqual(game.isGameOver, true);
console.log("✓ 测试用例1通过：单人模式扣血正常");

// 测试用例2：双人模式扣血优先扣自己
game = createGameInstance(true);
game.takeDamage(30);
assert.strictEqual(game.health.value, 70);
assert.strictEqual(game.teammateHealth.value, 100);
console.log("✓ 测试用例2通过：双人模式优先扣除自己血量");

// 测试用例3：双人模式自己血量不足时扣除队友血量
game = createGameInstance(true);
game.takeDamage(120);
assert.strictEqual(game.health.value, 0);
assert.strictEqual(game.teammateHealth.value, 80);
assert.strictEqual(game.isGameOver, false);
console.log("✓ 测试用例3通过：自己血量不足时正确扣除队友血量");

// 测试用例4：双人模式两人血量全部扣空触发结束
game = createGameInstance(true);
game.takeDamage(200);
assert.strictEqual(game.health.value, 0);
assert.strictEqual(game.teammateHealth.value, 0);
assert.strictEqual(game.isGameOver, true);
console.log("✓ 测试用例4通过：两人血量均归零时触发游戏结束");

// 测试用例5：双人模式加血优先加自己
game = createGameInstance(true);
game.health.value = 50;
game.teammateHealth.value = 50;
game.healPlayer(30);
assert.strictEqual(game.health.value, 80);
assert.strictEqual(game.teammateHealth.value, 50);
console.log("✓ 测试用例5通过：双人模式加血优先恢复自己血量");

// 测试用例6：双人模式自己血量满时加给队友
game = createGameInstance(true);
game.health.value = 90;
game.teammateHealth.value = 50;
game.healPlayer(30);
assert.strictEqual(game.health.value, 100);
assert.strictEqual(game.teammateHealth.value, 70);
console.log("✓ 测试用例6通过：自己血满时溢出治疗量正确分配给队友");

console.log("所有血量测试通过！");
