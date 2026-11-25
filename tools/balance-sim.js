// 最终平衡验证 v2：站桩 + 小幅后撤两种真实打法，多次运行取平均
const { chromium } = require('playwright');
const URL = 'http://127.0.0.1:8123/__test.html';
const log = (...a) => console.log(...a);

(async () => {
  const browser = await chromium.launch({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--enable-unsafe-swiftshader'] });
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, permissions: ['camera'] });
  const page = await ctx.newPage();
  const errs = [];
  page.on('pageerror', e => errs.push(e.message));
  await page.goto(URL, { waitUntil: 'domcontentloaded', timeout: 60000 });
  await page.waitForFunction(() => !!window.__DBG, null, { timeout: 30000 });
  await page.click('#btnStart').catch(() => {});
  await page.waitForTimeout(1200);

  const sim = (cfg) => page.evaluate(async (cfg) => {
    const D = window.__DBG;
    const STEP = 1 / 60;
    D.S.phase = 'combat';
    D.S.encounterIndex = cfg.idx;
    D.S.playerX = 0; D.S.playerZ = 0; D.S.faceTargetZ = 0; D.S.keyVZ = 0; D.S.keyVX = 0;
    D.S.health = 100; D.S.hurtCd = 0; D.S.kills = 0;
    D.S.defending = false; D.S.shieldUp = false;
    D.JUICE.hitStop = 0; D.JUICE.slow = 0; D.JUICE.slowTarget = 1; D.JUICE.scale = 1;
    while (D.zombies.length) D.despawnZombie(D.zombies[0]);
    const n = D.waveSize(cfg.idx);
    D.buildWave(cfg.idx, n).forEach((arch, i) => D.spawnZombie(arch, (i % 7 - 3) * 1.8, -6 - Math.floor(i / 7) * 1.9));
    let attacks = 0, t = 0, atkTimer = 0, dead = false, hits = 0, retTimer = 0;
    const MAXT = cfg.maxT || 40;
    while (t < MAXT && !dead) {
      D.S.nextEncounterAt = 1e9; D.S.encounterIndex = cfg.idx;
      if (cfg.retreatStep > 0) {
        retTimer -= STEP;
        if (retTimer <= 0) {
          retTimer = 2.0;
          D.S.playerZ = Math.min(cfg.maxZ, D.S.playerZ + cfg.retreatStep);
          D.S.faceTargetZ = D.S.playerZ;
        }
      }
      D.update(STEP); t += STEP; atkTimer -= STEP;
      const alive = D.zombies.filter(z => z.state !== 'die');
      if (atkTimer <= 0 && alive.length) {
        atkTimer = cfg.every; attacks++;
        hits += D.hitZombies(cfg.range, cfg.arc, cfg.aoe, cfg.dmg, cfg.name, cfg.splash || 0.6, cfg.knock || null, cfg.stagger || 0.35, cfg.armorBonus || 1);
      }
      if (D.S.health <= 0) dead = true;
    }
    const aliveLeft = D.zombies.filter(z => z.state !== 'die').length;
    const r = { kills: D.S.kills, hp: Math.round(D.S.health), time: +t.toFixed(1), aliveLeft, dead, attacks, hits, n };
    D.S.health = 100; D.S.over = false; D.S.kills = 0;
    return r;
  }, cfg);

  const RUNS = 5;
  const WEAPONS = {
    '拳头': { range: 1.5, arc: 0.85, aoe: 0, dmg: 42, name: '拳头', every: 0.34 },
    '斜劈': { range: 2.5, arc: 0.52, aoe: 1.7, dmg: 95, name: '斜劈', splash: 0.65, knock: 'side', every: 0.44, armorBonus: 1.25 },
    '下砸': { range: 2.2, arc: 0.75, aoe: 1.3, dmg: 78, name: '下砸', splash: 0.5, knock: 'back', every: 0.72, armorBonus: 1.5 },
    '侧抡': { range: 2.4, arc: 0.66, aoe: 1.4, dmg: 76, name: '侧抡', splash: 0.55, knock: 'side', every: 0.60, armorBonus: 1.4 },
    '横扫': { range: 2.8, arc: 0.60, aoe: 1.9, dmg: 56, name: '横扫', splash: 0.70, knock: 'side', every: 0.50, armorBonus: 1.4 },
  };

  const SCEN = [
    { label: '第1波', idx: 0, wep: '拳头' },
    { label: '第3波', idx: 2, wep: '拳头' },
    { label: '第6波', idx: 5, wep: '拳头' },
    { label: '第10波', idx: 9, wep: '斜劈' },
    { label: '第15波', idx: 14, wep: '斜劈' },
    { label: '第20波', idx: 19, wep: '斜劈' },
    { label: '第20波', idx: 19, wep: '下砸' },
    { label: '第20波', idx: 19, wep: '横扫' },
    { label: '第20波', idx: 19, wep: '侧抡' },
    { label: '第20波', idx: 19, wep: '拳头' },
  ];

  for (const mode of [
    { title: '站桩不动（体感玩家原地挥拳）', rs: 0, rz: 0 },
    { title: '小幅后撤（每 2s 退 0.4m，最多退到 z=+2）', rs: 0.4, rz: 2 },
  ]) {
    log(`\n=== ${mode.title} ===`);
    log('  场景      武器    怪数  平均击杀  平均用时  平均剩余HP  阵亡率  全清率');
    for (const sc of SCEN) {
      const wep = WEAPONS[sc.wep];
      const rs = [];
      for (let i = 0; i < RUNS; i++) {
        rs.push(await sim({ ...wep, idx: sc.idx, maxT: 40, retreatStep: mode.rs, maxZ: mode.rz }));
      }
      const avg = f => rs.reduce((a, r) => a + f(r), 0) / rs.length;
      const deaths = rs.filter(r => r.dead).length;
      const clears = rs.filter(r => r.aliveLeft === 0 && !r.dead).length;
      log(`  ${sc.label.padEnd(8)} ${sc.wep.padEnd(5)} ${String(rs[0].n).padStart(4)}  ${avg(r => r.kills).toFixed(1).padStart(7)}  ${avg(r => r.time).toFixed(1).padStart(7)}s  ${avg(r => r.hp).toFixed(0).padStart(9)}  ${(deaths / RUNS * 100).toFixed(0).padStart(6)}%  ${(clears / RUNS * 100).toFixed(0).padStart(5)}%`);
    }
  }

  log('\n=== 前期击倒数（拳头 42 伤害 · 用户要求「两三拳一个」）===');
  for (const idx of [0, 2, 5]) {
    const rs = [];
    for (let i = 0; i < RUNS; i++) rs.push(await sim({ ...WEAPONS['拳头'], idx, maxT: 40 }));
    const avg = f => rs.reduce((a, r) => a + f(r), 0) / rs.length;
    log(`  第${idx + 1}波 → 平均命中 ${avg(r => r.hits).toFixed(1)} 次 / 击杀 ${avg(r => r.kills).toFixed(1)} 只 = 每只 ${(avg(r => r.hits) / Math.max(avg(r => r.kills), 1)).toFixed(1)} 拳`);
  }

  log('\n错误: ' + (errs.length ? errs.slice(0, 5).join(' | ') : '无'));
  await browser.close();
})().catch(e => { console.error('FATAL', e); process.exit(1); });
