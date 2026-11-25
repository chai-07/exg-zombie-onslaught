// 运行时验证 v2：修正 arc（余弦阈值）、改进性能测法、验证血条
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8123/__test.html';
const log = (...a) => console.log(...a);
const ARC_FULL = -1;   // cos(180°)

(async () => {
  const browser = await chromium.launch({
    args: [
      '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream',
      '--autoplay-policy=no-user-gesture-required', '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows', '--disable-frame-rate-limit',
    ],
  });
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', m => { if (m.type() === 'error') errors.push('[console] ' + m.text()); });
  page.on('pageerror', e => errors.push('[pageerror] ' + String(e && e.stack ? e.stack.split('\n').slice(0, 3).join(' | ') : e)));

  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__DBG, null, { timeout: 30000 });
  await page.click('#btnStart').catch(() => {});
  await page.waitForTimeout(2000);

  // ---------- 1. 打击感：单次命中 ----------
  log('\n→ [1] 单次命中（拳头 42 伤害，arc=0.85）');
  const one = await page.evaluate(() => {
    const D = window.__DBG;
    D.S.phase = 'combat';
    D.S.playerX = 0; D.S.playerZ = 0;
    while (D.zombies.length) D.despawnZombie(D.zombies[0]);
    D.spawnZombie('walker', 0, -1.0); const z = D.zombies[D.zombies.length-1];
    const hp0 = Math.round(z.hp);
    const n = D.hitZombies(1.5, 0.85, 0, 42, '拳头', 0.6, null, 0.35, 1);
    return {
      hitCount: n, hp0, hp1: Math.round(z.hp),
      hitWhite: +z.hitWhite.toFixed(2), hitFlash: +z.hitFlash.toFixed(2),
      juice: { hitStop: +D.JUICE.hitStop.toFixed(4), flash: +D.JUICE.flash.toFixed(3), fovTarget: +D.JUICE.fovTarget.toFixed(2) },
      shake: +D.S.shake.toFixed(3), shakeX: +D.S.shakeX.toFixed(3), shakeY: +D.S.shakeY.toFixed(3),
      dnum: document.getElementById('dmgNums').children.length,
      bloodPoolAlive: (() => { let n = 0; return n; })(),
    };
  });
  log('  命中数=' + one.hitCount + '  hp ' + one.hp0 + '→' + one.hp1 + '  白闪=' + one.hitWhite + ' 闪红=' + one.hitFlash);
  log('  JUICE=' + JSON.stringify(one.juice) + ' shake=' + one.shake + ' shakeX=' + one.shakeX + ' shakeY=' + one.shakeY);

  // ---------- 2. 方向性（背后不打中） ----------
  log('\n→ [2] 命中方向判定');
  const dir = await page.evaluate(() => {
    const D = window.__DBG;
    const probe = (zx, zz) => {
      while (D.zombies.length) D.despawnZombie(D.zombies[0]);
      D.spawnZombie('walker', zx, zz);
      return D.hitZombies(1.5, 0.85, 0, 42, '拳头', 0.6, null, 0.35, 1);
    };
    return { front: probe(0, -1.0), back: probe(0, 1.0), side: probe(1.2, 0) };
  });
  log('  前方=' + dir.front + ' 后方=' + dir.back + ' 侧方=' + dir.side + ' （前方/侧方应>0，后方应=0）');

  // ---------- 3. 多杀 → 慢动作/冲击线/飘字 ----------
  log('\n→ [3] 多杀（5只全向横扫）');
  const multi = await page.evaluate(async () => {
    const D = window.__DBG;
    while (D.zombies.length) D.despawnZombie(D.zombies[0]);
    for (let i = 0; i < 5; i++) D.spawnZombie('walker', (i - 2) * 1.2, -1.0);
    D.hitZombies(3.0, -1, 0, 999, '测试横扫', 0.6, null, 0.35, 1);
    const snap = {
      kills: D.S.kills, zombiesLeft: D.zombies.length,
      slow: +D.JUICE.slow.toFixed(3), slowTarget: D.JUICE.slowTarget,
      rays: +D.JUICE.rays.toFixed(2), flash: +D.JUICE.flash.toFixed(3),
      hitStop: +D.JUICE.hitStop.toFixed(4), fovTarget: +D.JUICE.fovTarget.toFixed(2),
      shake: +D.S.shake.toFixed(3),
      dnumVisible: [...document.getElementById('dmgNums').children].filter(e => e.style.display === 'block').length,
    };
    await new Promise(r => setTimeout(r, 120));
    snap.raysAnimating = document.getElementById('impactRays').classList.contains('on');
    snap.raysOpacity = getComputedStyle(document.getElementById('impactRays')).opacity;
    snap.hitFlashOpacity = getComputedStyle(document.getElementById('hitFlash')).opacity;
    return snap;
  });
  log('  ' + JSON.stringify(multi));

  // ---------- 4. 顿帧：世界几乎冻结但 UI 继续 ----------
  log('\n→ [4] 顿帧/慢动作时间缩放');
  const tick = await page.evaluate(() => {
    const D = window.__DBG;
    const out = {};
    D.JUICE.hitStop = 0; D.JUICE.slow = 0; D.JUICE.slowTarget = 1; D.JUICE.scale = 1;
    out.normal = +D.timeTick(0.016).toFixed(5);
    D.JUICE.hitStop = 0.1;
    out.hitstop1 = +D.timeTick(0.016).toFixed(5);
    out.hitstop2 = +D.timeTick(0.016).toFixed(5);
    D.JUICE.hitStop = 0;
    D.JUICE.slow = 0.4; D.JUICE.slowTarget = 0.32;
    out.slowA = +D.timeTick(0.016).toFixed(5);
    out.slowB = +D.timeTick(0.016).toFixed(5);
    out.slowC = +D.timeTick(0.016).toFixed(5);
    return out;
  });
  log('  ' + JSON.stringify(tick) + '  (正常应≈0.016, 顿帧≈0.00056, 慢动作应≈0.005~0.01)');

  // ---------- 5. 血条：受伤才显示 ----------
  log('\n→ [5] 血条显示策略');
  const bars = await page.evaluate(async () => {
    const D = window.__DBG;
    while (D.zombies.length) D.despawnZombie(D.zombies[0]);
    D.spawnZombie('walker', 0, -1.2); const z = D.zombies[D.zombies.length-1];
    const before = z.bar.g.visible;
    D.damageZombie(z, 10, '测试', null, 0.2, 1);
    await new Promise(r => setTimeout(r, 120));
    const after = z.bar.g.visible;
    return { before, after, ratio: +(z.hp / z.maxHp).toFixed(3) };
  });
  log('  满血时可见=' + bars.before + ' 受伤后可见=' + bars.after + ' (期望 false → true)');

  // ---------- 6. 20 只尸潮：性能 ----------
  log('\n→ [6] 第20波尸潮性能');
  const perf = await page.evaluate(async () => {
    const D = window.__DBG;
    D.S.phase = 'combat'; D.S.encounterIndex = 19; D.S.health = 100;
    while (D.zombies.length) D.despawnZombie(D.zombies[0]);
    const wave = D.buildWave(19, D.waveSize(19));
    const kinds = {};
    wave.forEach((w, i) => { kinds[w] = (kinds[w] || 0) + 1; D.spawnZombie(w, (i % 7 - 3) * 1.8, -4 - Math.floor(i / 7) * 1.9); });
    // 直接测 render 成本（headless 的 rAF 会被节流，不能用来测帧率）
    D.renderer.info.autoReset = false;
    D.renderer.info.reset();
    const t0 = performance.now();
    const N = 60;
    for (let i = 0; i < N; i++) { D.renderer.render(D.scene, D.camera); }
    const perRender = (performance.now() - t0) / N;
    const info = { calls: D.renderer.info.render.calls / N, tris: D.renderer.info.render.triangles / N };
    // 模拟 30 帧 update（CPU 侧）
    const t1 = performance.now();
    for (let i = 0; i < 30; i++) D.timeTick(0.016);
    const perTick = (performance.now() - t1) / 30;
    return {
      count: D.zombies.length, kinds,
      perRenderMs: +perRender.toFixed(2),
      estFps: +(1000 / perRender).toFixed(0),
      drawCalls: Math.round(info.calls), tris: Math.round(info.tris),
      geometries: D.renderer.info.memory.geometries, textures: D.renderer.info.memory.textures,
      perTickMs: +perTick.toFixed(4),
    };
  });
  log('  同屏 ' + perf.count + ' 只 ' + JSON.stringify(perf.kinds));
  log('  单帧渲染 ' + perf.perRenderMs + 'ms (≈' + perf.estFps + ' fps 上限) drawCalls=' + perf.drawCalls + ' tris=' + perf.tris);
  log('  geometries=' + perf.geometries + ' textures=' + perf.textures);

  // ---------- 7. 围攻生存压力测试 ----------
  log('\n→ [7] 围攻生存（20只贴身）');
  const survive = await page.evaluate(async () => {
    const D = window.__DBG;
    const res = {};
    for (const label of ['10只', '20只']) {
      D.S.health = 100; D.S.hurtCd = 0;
      while (D.zombies.length) D.despawnZombie(D.zombies[0]);
      const n = label === '10只' ? 10 : 20;
      for (let i = 0; i < n; i++) D.spawnZombie('walker', (i % 5 - 2) * 0.55, -0.5 - (i % 3) * 0.3);
      const samples = [];
      for (let t = 0; t < 8; t++) { await new Promise(r => setTimeout(r, 500)); samples.push(Math.round(D.S.health)); }
      res[label] = samples.join('→');
      res[label + '_alive'] = D.zombies.length;
    }
    return res;
  });
  log('  10只: ' + survive['10只'] + '  (存活怪 ' + survive['10只_alive'] + ')');
  log('  20只: ' + survive['20只'] + '  (存活怪 ' + survive['20只_alive'] + ')');

  await page.screenshot({ path: 'shots/horde.png' });
  log('\n=== 错误 ===');
  log(errors.length ? errors.slice(0, 20).map(e => '  ✗ ' + e).join('\n') : '  ✓ 无 console/page 错误');
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
