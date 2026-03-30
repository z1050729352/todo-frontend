import assert from 'assert';
import { getDuelNames, getDuelScores, getDuelWinner, isDuelRecord } from '../src/modules/DuelLeaderboard.js';

console.log('开始执行对战排行榜模块单元测试...');

{
  const entry = {
    _id: '1',
    gameMode: 'duel',
    duel: { aName: 'A', bName: 'B', aScore: 2400, bScore: 2900, replay: { seed: 1 } }
  };
  assert.strictEqual(isDuelRecord(entry), true);
  assert.deepStrictEqual(getDuelNames(entry), { aName: 'A', bName: 'B' });
  assert.deepStrictEqual(getDuelScores(entry), { aScore: 2400, bScore: 2900 });
  assert.strictEqual(getDuelWinner(entry), 'B');
  console.log('✓ 测试用例1通过：对战记录识别与胜负判定正确');
}

{
  const entry = { _id: '2', gameMode: 'solo', score: 10 };
  assert.strictEqual(isDuelRecord(entry), false);
  assert.strictEqual(getDuelWinner(entry), null);
  console.log('✓ 测试用例2通过：非对战记录不会误判');
}

console.log('对战排行榜模块测试通过！');

