import assert from 'assert';
import { computeHardDropY } from '../src/modules/HardDropButton.js';

const COLS = 10;
const ROWS = 20;

function makeBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(0));
}

function collide(board, piece) {
  const m = piece.matrix;
  for (let y = 0; y < m.length; ++y) {
    for (let x = 0; x < m[y].length; ++x) {
      if (m[y][x] !== 0 && (board[y + piece.y] && board[y + piece.y][x + piece.x]) !== 0) {
        return true;
      }
    }
  }
  return false;
}

console.log('开始执行俄罗斯方块硬降单元测试...');

{
  const board = makeBoard();
  const piece = { matrix: [[1, 1], [1, 1]], x: 4, y: 0 };
  const y = computeHardDropY(board, piece, collide);
  assert.strictEqual(y, 18);
  console.log('✓ 测试用例1通过：空棋盘 O 方块硬降到底部');
}

{
  const board = makeBoard();
  board[19][4] = 9;
  const piece = { matrix: [[1, 1], [1, 1]], x: 4, y: 0 };
  const y = computeHardDropY(board, piece, collide);
  assert.strictEqual(y, 17);
  console.log('✓ 测试用例2通过：存在障碍时 O 方块硬降落点正确');
}

{
  const board = makeBoard();
  board[18][6] = 9;
  const piece = { matrix: [[1, 1, 1, 1]], x: 4, y: 0 };
  const y = computeHardDropY(board, piece, collide);
  assert.strictEqual(y, 17);
  console.log('✓ 测试用例3通过：I 方块硬降落点正确');
}

console.log('硬降测试通过！');

