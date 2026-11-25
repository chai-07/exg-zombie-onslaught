// 从 index.html 重建带调试钩子的测试副本
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
let src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

// 统计 damagePlayer 调用
src = src.replace('function damagePlayer(d) {',
  'function damagePlayer(d) {\n  window.__DP = (window.__DP||0)+1; window.__DPB=(window.__DPB||0)+1;');
// 统计撕咬判定三态
src = src.replace(
  'if (dNow < atkR && zz.stagger <= 0) {',
  'window.__INR=(window.__INR||0)+1; if (dNow < atkR && zz.stagger <= 0) { window.__IN=(window.__IN||0)+1;');
src = src.replace(
  'if (zz.atkCd <= 0) {\n          const landed = damagePlayer(zz.dmg * 0.42);',
  'if (zz.atkCd <= 0) {\n          window.__ATK=(window.__ATK||0)+1; const landed = damagePlayer(zz.dmg * 0.42);');

const hook = `
/* ---- TEST HOOK (仅测试副本) ---- */
window.__DBG = { S, JUICE, FOV_BASE, zombies, scene, camera, renderer, THREE,
  waveSize, eliteCount, buildWave, startEncounter, spawnZombie, despawnZombie,
  hitZombies, damageZombie, killZombie, damagePlayer, triggerAttack, resetGame,
  popDamageNumber, burstGore, spawnBloodDecal, spawnHitRing, hitStop, slowmo,
  punchFov, flashHit, kickScreen, triggerMultiKill, timeTick, ARCHETYPES, WEAPONS, update, render, clock,
  get HP_GROW_TRASH(){return HP_GROW_TRASH}, get HP_GROW_ELITE(){return HP_GROW_ELITE} };
`;
const marker = /loop\(\);\r?\n<\/script>/;
const mm = src.match(marker);
if (!mm || src.split(marker).length !== 2) throw new Error('marker not unique');
src = src.replace(marker, 'loop();\n' + hook + '\n</script>');
fs.writeFileSync(path.join(dir, '__test.html'), src);
console.log('__test.html rebuilt (' + src.length + ' bytes)');
