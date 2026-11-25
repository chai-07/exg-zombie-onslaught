// 专项验证：本轮改造的 11 项需求
// 1) 吵闹音效已删除  2) 打击不卡顿  3) 删除盾刀  4) 训练模式隐藏解锁波次
// 5) 双枪左右手 + 同时开火  6) 战锤蓄力常驻显示 + 灵敏度
// 7) 生命值降 1/3 + 残血判定  8) 匕首/武士刀削弱
// 9) 鞭子前甩一次  10) 弓箭单臂扯线来回  11) 流星锤转一圈
const path = require('path');
const fs = require('fs');
function findPlaywright() {
  const bases = [
    path.join(process.env.LOCALAPPDATA || '', 'AppData', 'Local', 'npm-cache', '_npx'),
    path.join(process.env.USERPROFILE || 'C:/Users/Dell', 'AppData', 'Local', 'npm-cache', '_npx'),
  ];
  for (const base of bases) {
    if (!base || !fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      const p = path.join(base, d, 'node_modules', 'playwright');
      if (fs.existsSync(p)) return p;
    }
  }
  return null;
}
const NPX = findPlaywright();
let chromium;
try { ({ chromium } = require(NPX || 'playwright')); }
catch (e) { ({ chromium } = require('playwright')); }

const dir = path.join(__dirname, '..');

/* ---------- 生成带调试钩子的测试副本 ---------- */
let src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const hook = `
/* ---- TEST HOOK (仅测试副本) ---- */
window.__DBG = {
  S, BOSS, WEAPONS, WEAPON_INFO, ZOMBIE_INFO, MODE_LABEL, zombies, bullets, GW, GUN_CD,
  gotoMenu, startMode, renderHelp, renderWeaponGrid, renderWeaponDetail,
  enterSelectMode, exitSelectMode, confirmSelectMode, updateSelectMode,
  buildWheel, updateWheelVisual, wheelWeaponList, switchWeapon, resetGame,
  triggerBerserk, hitBoss, updateBoss, updateBossWaves, updateBossHUD,
  bossSummon, bossFireWave, spawnWave, bossVictory, bootCamera,
  killZombie, damageZombie, hitZombies, spawnZombie, damagePlayer,
  analyzeGestures, GT, LM, update,
  // 合成姿态：MediaPipe 坐标约定 —— 本人左手(11/13/15)出现在画面**右侧**(x 较大)，
  // 本人右手(12/14/16)出现在画面**左侧**(x 较小)。与 tools/e2e-test.js 保持一致。
  // 若把左右放反，handCross 会恒为负 → 误判「双臂交叉防御」→ triggerAttack 被拦截。
  pose(lx, ly, rx, ry) {
    const lm = new Array(33);
    for (let i = 0; i < 33; i++) lm[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
    lm[11] = { x: 0.62, y: 0.40, z: 0, visibility: 0.95 };   // 左肩（画面右）
    lm[12] = { x: 0.38, y: 0.40, z: 0, visibility: 0.95 };   // 右肩（画面左）
    lm[13] = { x: 0.70, y: 0.50, z: 0, visibility: 0.95 };   // 左肘
    lm[14] = { x: 0.30, y: 0.50, z: 0, visibility: 0.95 };   // 右肘
    lm[15] = { x: lx, y: ly, z: 0, visibility: 0.95 };       // 左腕
    lm[16] = { x: rx, y: ry, z: 0, visibility: 0.95 };       // 右腕
    lm[19] = { x: lx, y: ly, z: 0, visibility: 0.95 };
    lm[20] = { x: rx, y: ry, z: 0, visibility: 0.95 };
    lm[23] = { x: 0.56, y: 0.75, z: 0, visibility: 0.9 };    // 左髋
    lm[24] = { x: 0.44, y: 0.75, z: 0, visibility: 0.9 };    // 右髋
    return lm;
  },
  // 清掉「防御 / 抱胸」姿态状态（合成姿态不代表真实站姿，避免干扰被测手势）
  resetGuard() { S.defending = false; S.guardHold = 0; S.hugArmed = false; },
  timers: {
    get bow(){ return lastBowAt; }, set bow(v){ lastBowAt = v; },
    get flail(){ return lastFlailAt; }, set flail(v){ lastFlailAt = v; },
    get blade(){ return lastBladeAt; }, set blade(v){ lastBladeAt = v; },
  },
  get selectMode(){ return S.selectMode; }, get wheelScroll(){ return S.wheelScroll; },
  get current(){ return S.weapon; },
};
window.__ERR = [];
addEventListener('error', e => window.__ERR.push(String(e.message)));
`;
const marker = /loop\(\);\r?\n<\/script>/;
if (src.split(marker).length !== 2) throw new Error('marker not unique');
src = src.replace(marker, 'loop();\n' + hook + '\n</script>');
const testFile = path.join(dir, '__test2.html');
fs.writeFileSync(testFile, src);
const url = 'file:///' + testFile.replace(/\\/g, '/');

let pass = 0, fail = 0;
function ok(name, cond, extra) {
  if (cond) { pass++; console.log('  ✅ ' + name + (extra ? '  → ' + extra : '')); }
  else { fail++; console.log('  ❌ ' + name + (extra ? '  → ' + extra : '')); }
}

/* 合成姿态骨架：肩/肘/腕/髋，肩宽 = 0.24 * 640 = 153.6px */
const BASE_POSE = () => {
  const lm = new Array(33);
  for (let i = 0; i < 33; i++) lm[i] = { x: 0.5, y: 0.5, z: 0, visibility: 0.9 };
  lm[11] = { x: 0.38, y: 0.40, z: 0, visibility: 0.95 };   // 左肩
  lm[12] = { x: 0.62, y: 0.40, z: 0, visibility: 0.95 };   // 右肩
  lm[13] = { x: 0.30, y: 0.50, z: 0, visibility: 0.95 };   // 左肘
  lm[14] = { x: 0.70, y: 0.50, z: 0, visibility: 0.95 };   // 右肘
  lm[23] = { x: 0.44, y: 0.75, z: 0, visibility: 0.9 };
  lm[24] = { x: 0.56, y: 0.75, z: 0, visibility: 0.9 };
  return lm;
};
const setL = (lm, x, y) => { lm[15] = { x, y, z: 0, visibility: 0.95 }; lm[19] = { x, y, z: 0, visibility: 0.95 }; };
const setR = (lm, x, y) => { lm[16] = { x, y, z: 0, visibility: 0.95 }; lm[20] = { x, y, z: 0, visibility: 0.95 }; };
// 只动右手 / 只动左手
const poseR = (x, y) => { const lm = BASE_POSE(); setL(lm, 0.30, 0.45); setR(lm, x, y); return lm; };
const poseL = (x, y) => { const lm = BASE_POSE(); setL(lm, x, y); setR(lm, 0.70, 0.45); return lm; };

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--autoplay-policy=no-user-gesture-required'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  const errs = [];
  page.on('pageerror', e => errs.push(String(e.message || e)));
  page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
  await page.goto(url);
  await page.waitForTimeout(1500);

  // ── 1) 吵闹音效文件已删除 ──────────────────────────────
  console.log('\n【1】音频素材清理');
  const audioDir = fs.readdirSync(path.join(dir, 'audio'));
  ok('zombie_*.mp3 已全部删除', !audioDir.some(f => f.startsWith('zombie_2')), audioDir.filter(f => f.startsWith('zombie_')).join(',') || '无');
  ok('环境音 cave/city-night 已删除', !audioDir.includes('cave.ogg') && !audioDir.includes('city-night.ogg'));
  const sfxRefs = await page.evaluate(() => {
    const s = document.querySelector('script[type="module"]');
    return /zombie_21\d\d\.mp3/.test(s.textContent);
  });
  ok('代码中不再引用 zombie_*.mp3', sfxRefs === false);

  // ── 2) 打击顿感（不再定格） ────────────────────────────
  console.log('\n【2】打击不再卡顿');
  const hitstop = await page.evaluate(() => {
    const s = document.querySelector('script[type="module"]').textContent;
    return {
      scale: (s.match(/return realDt \* ([\d.]+);\s*\/\/ 顿感/) || [])[1],
      longFreeze: /realDt \* 0\.0\d+/.test(s),
      maxDur: (s.match(/hitStop\(Math\.min\(([\d.]+)/) || [])[1],
    };
  });
  ok('顿帧不再是 0.035 倍定格', hitstop.scale === '0.62', '实际 ' + hitstop.scale);
  ok('代码中没有极低时间缩放', hitstop.longFreeze === false);
  ok('命中顿感时长上限已压到 0.05s', parseFloat(hitstop.maxDur) <= 0.05, hitstop.maxDur);

  // ── 3) 盾刀已删除 ──────────────────────────────────────
  console.log('\n【3】盾刀武器已删除');
  const noShield = await page.evaluate(() => {
    const D = window.__DBG;
    const src = document.querySelector('script[type="module"]').textContent;
    const body = (name) => {
      const i = src.indexOf('const ' + name + ' = {');
      if (i < 0) return '';
      return src.slice(i, src.indexOf('\n};', i) + 3);
    };
    return {
      inWeapons: 'shield' in D.WEAPONS,
      inInfo: 'shield' in D.WEAPON_INFO,
      inGW: Object.keys(D.GW).some(k => /shield/i.test(k)),
      inVerbs: /shield/i.test(body('WEAPON_VERBS')),
      inIntro: /shield/i.test(body('WEAPON_INTRO')),
      hasSlashFx: src.includes('SLASH_FX'),
      models: /setWeaponModel[\s\S]{0,1200}?shield/.test(src),
      shieldUpField: /shieldUp/.test(src),
      // 键位：Digit1~9 必须正好映射到 9 把武器，且没有一把映射到 shield
      keyMap: (src.match(/e\.code === 'Digit[1-9]'\) switchWeapon\('([a-z]+)'\)/g) || [])
        .map(s => s.match(/'([a-z]+)'\)$/)[1]),
    };
  });
  ok('WEAPONS 表无 shield', noShield.inWeapons === false);
  ok('WEAPON_INFO 无 shield', noShield.inInfo === false);
  ok('手势状态表 GW 无 shield', noShield.inGW === false);
  ok('WEAPON_VERBS / WEAPON_INTRO 无 shield', !noShield.inVerbs && !noShield.inIntro);
  ok('旧 SLASH_FX 表已删除', noShield.hasSlashFx === false);
  ok('武器模型切换无 shield 分支', noShield.models === false);
  ok('旧 shieldUp 格挡字段已清除', noShield.shieldUpField === false);
  const wkeys = Object.keys(await page.evaluate(() => window.__DBG.WEAPONS)).sort();
  ok('Digit1~9 键位正好覆盖 9 把武器',
    noShield.keyMap.length === 9 && noShield.keyMap.slice().sort().join() === wkeys.join(),
    noShield.keyMap.join('/'));
  const phoneTxt = fs.readFileSync(path.join(dir, 'phone.html'), 'utf8');
  ok('phone.html 无 shield', !phoneTxt.includes('shield'));
  const wcount = Object.keys(await page.evaluate(() => window.__DBG.WEAPONS)).length;
  ok('武器总数 = 9', wcount === 9, '实际 ' + wcount);

  // ── 4) 单项训练隐藏解锁波次 ────────────────────────────
  console.log('\n【4】单项训练不显示解锁波次');
  await page.click('#mTrain');
  await page.waitForTimeout(300);
  const trainTxt = await page.locator('#trainWpnGrid').innerText();
  ok('训练网格无「第 N 波」', !/第\s*\d+\s*波/.test(trainTxt));
  await page.click('#trainWpnGrid .wpick:nth-child(1)');
  await page.waitForTimeout(200);
  const trainDetail = await page.locator('#trainWpnDetail').innerText();
  ok('训练详情无「第 N 波」', !/第\s*\d+\s*波/.test(trainDetail));
  ok('训练详情仍含特性数值/动捕动作/锻炼肌肉',
    /特性数值/.test(trainDetail) && /动捕动作/.test(trainDetail) && /锻炼肌肉/.test(trainDetail));
  // BOSS 模式仍应显示解锁波次
  await page.click('#btnTrainBack');
  await page.waitForTimeout(200);
  await page.click('#mBoss');
  await page.waitForTimeout(300);
  const bossTxt = await page.locator('#bossWpnGrid').innerText();
  ok('BOSS 选武器页仍显示解锁波次', /第\s*\d+\s*波/.test(bossTxt));
  await page.click('#btnBossBack');
  await page.waitForTimeout(200);

  // ── 5) 双枪：左右手独立 + 同时开火 ─────────────────────
  console.log('\n【5】双枪 · 左右手独立 + 同时开火');
  const gunRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'gun');
    S.unlocked.add('gun');
    D.switchWeapon('gun');
    D.LM.w = 640; D.LM.h = 480;                 // 关键：合成姿态必须先给出画布尺寸
    // 静息姿势：左手在画面右侧 0.62，右手在画面左侧 0.38
    const REST_L = [0.62, 0.45], REST_R = [0.38, 0.45];
    const resetGun = () => {
      for (const st of [D.GW.gunR, D.GW.gunL]) { st.on = false; st.dir = 0; st.lastFired = -1e9; }
      D.GUN_CD.R = 0; D.GUN_CD.L = 0;      // 清掉开火冷却，避免跨用例互相阻塞
      D.resetGuard();
    };
    // 预热：第一次 analyzeGestures 只做基准标定
    resetGun(); D.analyzeGestures(D.pose(REST_L[0], REST_L[1], REST_R[0], REST_R[1]));
    // 右手单独摇动：y 上下翻转
    resetGun();
    const s0 = S.shots;
    for (let i = 0; i < 3; i++) {
      D.analyzeGestures(D.pose(REST_L[0], REST_L[1], REST_R[0], 0.30));   // 右手上
      D.analyzeGestures(D.pose(REST_L[0], REST_L[1], REST_R[0], 0.55));   // 右手下 → 翻转
    }
    const rightOnly = S.shots - s0;
    // 左手单独摇动
    resetGun();
    const s1 = S.shots;
    for (let i = 0; i < 3; i++) {
      D.analyzeGestures(D.pose(REST_L[0], 0.30, REST_R[0], REST_R[1]));
      D.analyzeGestures(D.pose(REST_L[0], 0.55, REST_R[0], REST_R[1]));
    }
    const leftOnly = S.shots - s1;
    // 双手同时摇动
    resetGun();
    const s2 = S.shots;
    for (let i = 0; i < 3; i++) {
      D.analyzeGestures(D.pose(REST_L[0], 0.30, REST_R[0], 0.30));
      D.analyzeGestures(D.pose(REST_L[0], 0.55, REST_R[0], 0.55));
    }
    const both = S.shots - s2;
    return { rightOnly, leftOnly, both };
  });
  ok('右手可单独开火', gunRes.rightOnly >= 1, '右 ' + gunRes.rightOnly + ' 发');
  ok('左手可单独开火', gunRes.leftOnly >= 1, '左 ' + gunRes.leftOnly + ' 发');
  ok('双手可同时开火（双发）', gunRes.both >= 2, '共 ' + gunRes.both + ' 发');

  // ── 6) 战锤：灵敏度 + 蓄力常驻显示 ─────────────────────
  console.log('\n【6】战锤 · 大臂抬高即蓄力 + 常驻显示');
  const hamRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'hammer');
    S.unlocked.add('hammer');
    D.switchWeapon('hammer');
    D.LM.w = 640; D.LM.h = 480;
    D.resetGuard();
    // 右手腕仅略高于肩线（0.34 < 0.40）→ 大臂抬高，应进入蓄力
    D.analyzeGestures(D.pose(0.62, 0.45, 0.40, 0.34));
    const charging = S.charging;
    // 蓄力 HUD 应可见
    D.update(0.016);
    const hudOn = document.getElementById('chargeHud').classList.contains('on');
    const label = document.getElementById('chargeLabel').textContent;
    return { charging, hudOn, label };
  });
  ok('大臂抬高即进入蓄力（无需握拳/过头顶）', hamRes.charging === true);
  ok('蓄力时 HUD 常驻显示', hamRes.hudOn === true);
  ok('蓄力文字含「蓄力中」', /蓄力中/.test(hamRes.label), hamRes.label);

  // ── 7) 生命值 + 残血 ───────────────────────────────────
  console.log('\n【7】生命值降 1/3 + 残血判定');
  const hpRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'fist');
    const max = S.maxHealth;
    const txt = () => document.getElementById('punchStreak').textContent;
    // 打到残血区间（checkLowHP 在 update 里每帧检查）
    S.health = max * 0.25;
    D.update(0.016);
    const shown = txt();
    const lowFlag = S._lowShown;
    // 回血到安全线以上 → 自动复位
    S.health = max * 0.9;
    D.update(0.016);
    const cleared = !S._lowShown;
    // 再次掉进残血 → 再次触发
    S.health = max * 0.2;
    D.update(0.016);
    const shown2 = txt();
    return { max, shown, lowFlag, cleared, shown2 };
  });
  ok('最大生命 = 66（原 100 降 1/3）', hpRes.max === 66, '实际 ' + hpRes.max);
  ok('血量低于 30% 触发残血提示', hpRes.lowFlag === true);
  ok('提示文案为「残血」', /残血/.test(hpRes.shown), hpRes.shown);
  ok('回血到安全线后可再次触发', hpRes.cleared === true);
  ok('二次触发仍显示残血', /残血/.test(hpRes.shown2), hpRes.shown2);
  const noCloseCall = await page.evaluate(() => {
    const src = document.querySelector('script[type="module"]').textContent;
    // 只检查「判定逻辑」是否还引用旧文案（说明性文案不算残留）
    const logic = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    return !/命悬一线/.test(logic);
  });
  ok('判定逻辑中已无「命悬一线」', noCloseCall === true);

  // ── 8) 匕首 / 武士刀削弱 ───────────────────────────────
  console.log('\n【8】匕首 / 武士刀削弱');
  const nerf = await page.evaluate(() => {
    const D = window.__DBG;
    const src = document.querySelector('script[type="module"]').textContent;
    const kat = (src.match(/const KATANA_FORMS = \[([\s\S]*?)\n\];/) || [])[1] || '';
    const dag = (src.match(/const DAGGER_FORMS = \[([\s\S]*?)\n\];/) || [])[1] || '';
    const kd = [...kat.matchAll(/dmg: (\d+)/g)].map(m => +m[1]);
    const dd = [...dag.matchAll(/dmg: (\d+)/g)].map(m => +m[1]);
    return {
      katanaBase: D.WEAPONS.katana.dmg, daggerBase: D.WEAPONS.daggers.dmg,
      kd, dd,
    };
  });
  ok('武士刀基础伤害 68 → 58', nerf.katanaBase === 58, '实际 ' + nerf.katanaBase);
  ok('双匕首基础伤害 38 → 30', nerf.daggerBase === 30, '实际 ' + nerf.daggerBase);
  ok('武士刀三式均下调', nerf.kd.join() === '80,125,102', nerf.kd.join('/'));
  ok('双匕首两式均下调', nerf.dd.join() === '15,30', nerf.dd.join('/'));

  // ── 9) 鞭子：手臂前甩一次 ─────────────────────────────
  console.log('\n【9】鞭子 · 手臂往前甩一次');
  const whipRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'whip');
    S.unlocked.add('whip');
    D.switchWeapon('whip');
    D.LM.w = 640; D.LM.h = 480;
    D.resetGuard();
    D.analyzeGestures(D.pose(0.62, 0.45, 0.36, 0.45));   // 预热 / 记录基准 reach
    const s0 = S.blades;
    // 手臂从收拢（离肩近）快速甩出（离肩远）
    D.analyzeGestures(D.pose(0.62, 0.45, 0.08, 0.45));   // reach 骤增 → 甩出
    const hits = S.blades - s0;
    const noCharge = !S.charging;
    return { hits, noCharge };
  });
  ok('手臂前甩一次即命中', whipRes.hits >= 1, '触发 ' + whipRes.hits + ' 次');
  ok('鞭子不再进入蓄力', whipRes.noCharge === true);

  // ── 10) 弓箭：单臂扯线来回 ────────────────────────────
  console.log('\n【10】弓箭 · 任一只手扯线来回射箭');
  const bowRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'bow');
    S.unlocked.add('bow');
    D.switchWeapon('bow');
    D.LM.w = 640; D.LM.h = 480;
    D.resetGuard();
    // 左手（画面右侧 0.62 附近）：伸出 → 收到脸旁（扯线）→ 送出去 = 完成一个来回，射一支箭
    const s0 = S.shots;
    D.analyzeGestures(D.pose(0.85, 0.45, 0.38, 0.45));   // 伸出
    D.analyzeGestures(D.pose(0.58, 0.36, 0.38, 0.45));   // 收到脸旁 = 扯线
    D.analyzeGestures(D.pose(0.85, 0.45, 0.38, 0.45));   // 送出去 → 射箭
    const leftShots = S.shots - s0;
    // 右手同样可以
    D.timers.bow = -1e9;                  // 清掉放箭节流
    D.resetGuard();
    const s1 = S.shots;
    D.analyzeGestures(D.pose(0.62, 0.45, 0.15, 0.45));
    D.analyzeGestures(D.pose(0.62, 0.45, 0.42, 0.36));
    D.analyzeGestures(D.pose(0.62, 0.45, 0.15, 0.45));
    const rightShots = S.shots - s1;
    // 伤害固定
    const src = document.querySelector('script[type="module"]').textContent;
    const fixed = /dmg: WEAPONS\.bow\.dmg/.test(src);
    return { leftShots, rightShots, fixed };
  });
  ok('左手完成一个来回 → 射出一支箭', bowRes.leftShots >= 1, '左 ' + bowRes.leftShots + ' 箭');
  ok('右手同样可以射箭', bowRes.rightShots >= 1, '右 ' + bowRes.rightShots + ' 箭');
  ok('弓箭伤害固定（无蓄力倍率）', bowRes.fixed === true);

  // ── 11) 流星锤：伸臂转一圈 ─────────────────────────────
  console.log('\n【11】流星锤 · 伸臂绕肩转一圈');
  const flailRes = await page.evaluate(() => {
    const D = window.__DBG, S = D.S;
    D.startMode('campaign', 'flail');
    S.unlocked.add('flail');
    D.switchWeapon('flail');
    D.LM.w = 640; D.LM.h = 480;
    const s0 = S.blades;
    // 手臂伸直绕肩转一圈（多转 1/4 圈，保证累计角度越过 2π）
    // 转圈经过中线时会短暂形成「双臂交叉」，每帧清一次防御状态避免干扰被测手势
    for (let i = 0; i <= 12; i++) {
      const a = (i / 8) * Math.PI * 2;
      D.resetGuard();
      D.analyzeGestures(D.pose(0.62, 0.45, 0.38 + Math.cos(a) * 0.35, 0.40 + Math.sin(a) * 0.35));
    }
    const hits = S.blades - s0;
    const noCharge = !S.charging;
    const fixed = /const dmg = WEAPONS\.flail\.dmg;/.test(document.querySelector('script[type="module"]').textContent);
    return { hits, noCharge, fixed };
  });
  ok('伸臂转一圈触发一次抽击', flailRes.hits >= 1, '触发 ' + flailRes.hits + ' 次');
  ok('流星锤不再进入蓄力', flailRes.noCharge === true);
  ok('流星锤伤害固定', flailRes.fixed === true);

  // ── 运行期错误 ────────────────────────────────────────
  console.log('\n【12】运行期错误');
  ok('无未捕获运行时错误', errs.length === 0, errs.slice(0, 3).join(' | ') || '无');

  console.log('\n========================================');
  console.log('结果：' + pass + '/' + (pass + fail) + ' 通过');
  console.log('========================================');
  await browser.close();
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('测试崩溃：', e); process.exit(1); });
