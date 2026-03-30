import assert from 'assert';
import { computePopoverPosition, getThemeStorageKey } from '../src/modules/ThemeSwitcher.js';

console.log('开始执行主题切换模块单元测试...');

global.window = { innerWidth: 320, innerHeight: 568 };

{
  const pos = computePopoverPosition({ left: 300, top: 200, bottom: 230 }, { width: 240, height: 200 }, 10);
  assert.ok(pos.left >= 10);
  assert.ok(pos.top >= 10);
  assert.ok(pos.left + 240 <= 320);
  assert.ok(pos.top + 200 <= 568);
  console.log('✓ 测试用例1通过：弹窗定位不会溢出视窗');
}

{
  assert.strictEqual(getThemeStorageKey('A'), 'tetris_theme_playerA');
  assert.strictEqual(getThemeStorageKey('B'), 'tetris_theme_playerB');
  console.log('✓ 测试用例2通过：主题存储 key 符合规范');
}

console.log('主题切换模块测试通过！');

