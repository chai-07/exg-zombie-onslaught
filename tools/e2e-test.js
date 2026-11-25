// 端到端验证：主菜单 / 帮助分类 / 选武器页 / BOSS 战 / 单项训练 / 抱胸转盘
// 用法： node tools/e2e-test.js
const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const dir = path.join(__dirname, '..');
// playwright 可能装在全局 node_modules 或 npx 缓存里，逐个尝试
function findPlaywright() {
  const cands = [];
  const la = process.env.LOCALAPPDATA || '';
  const up = process.env.USERPROFILE || '';
  if (la) cands.push(path.join(la, 'npm-cache', '_npx'));
  if (up) cands.push(path.join(up, 'AppData', 'Local', 'npm-cache', '_npx'));
  for (const base of cands) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) {
      cands.push(path.join(base, d, 'node_modules', 'playwright'));
    }
  }
  cands.push('playwright');
  for (const c of cands) {
    try { return require(c); } catch (_) {}
  }
  throw new Error('playwright 未找到');
}
const { chromium } = findPlaywright();

/* ---------- 1. 生成带调试钩子的测试副本 ---------- */
let src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const hook = `
/* ---- TEST HOOK (仅测试副本) ---- */
window.__DBG = {
  S, BOSS, WEAPONS, WEAPON_INFO, ZOMBIE_INFO, MODE_LABEL, zombies, bullets,
  gotoMenu, startMode, renderHelp, renderWeaponGrid, renderWeaponDetail,
  enterSelectMode, exitSelectMode, confirmSelectMode, updateSelectMode,
  buildWheel, updateWheelVisual, wheelWeaponList, switchWeapon, resetGame,
  triggerBerserk, hitBoss, updateBoss, updateBossWaves, updateBossHUD,
  bossSummon, bossFireWave, spawnWave, bossVictory, bootCamera,
  killZombie, damageZombie, hitZombies, spawnZombie,
  analyzeGestures, GT, LM, update,
  get selectMode(){ return S.selectMode; }, get wheelScroll(){ return S.wheelScroll; },
  get current(){ return S.weapon; },
};
window.__ERR = [];
addEventListener('error', e => window.__ERR.push(String(e.message)));
`;
const marker = /loop\(\);\r?\n<\/script>/;
if (src.split(marker).length !== 2) throw new Error('marker not unique');
src = src.replace(marker, 'loop();\n' + hook + '\n</script>');
const testFile = path.join(dir, '__test.html');
fs.writeFileSync(testFile, src);

/* ---------- 2. 测试用例 ---------- */
const results = [];
function ok(name, cond, extra = '') {
  results.push({ name, pass: !!cond, extra });
  console.log((cond ? '  ✅' : '  ❌') + ' ' + name + (extra ? '  → ' + extra : ''));
}

(async () => {
  const browser = await chromium.launch({
    args: ['--allow-file-access-from-files', '--use-fake-ui-for-media-stream',
           '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'],
  });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrs = [];
  page.on('console', m => { if (m.type() === 'error') consoleErrs.push(m.text()); });
  page.on('pageerror', e => consoleErrs.push('PAGEERROR: ' + e.message));

  await page.goto('file:///' + testFile.replace(/\\/g, '/'));
  await page.waitForTimeout(4000);

  console.log('\n【1】主菜单');
  ok('页面加载无脚本错误', consoleErrs.length === 0, consoleErrs.slice(0, 3).join(' | '));
  ok('#menu 可见', await page.isVisible('#menu'));
  ok('四个入口存在', await page.locator('#mCampaign').count() === 1 &&
    await page.locator('#mBoss').count() === 1 &&
    await page.locator('#mTrain').count() === 1 &&
    await page.locator('#mHelp').count() === 1);
  ok('无失效的 btnStart 引用', await page.evaluate(() => !document.getElementById('btnStart')));

  console.log('\n【2】帮助页 · 分类展示');
  await page.click('#mHelp');
  await page.waitForTimeout(300);
  ok('#help 可见', await page.isVisible('#help'));
  const tabs = await page.locator('#helpTabs .htab').count();
  ok('7 个分类 tab', tabs === 7, '实际 ' + tabs);
  const weaponsTab = await page.locator('#helpBody').innerText();
  ok('武器分类含肌肉/数值', /肌肉/.test(weaponsTab) && /数值/.test(weaponsTab));
  for (const t of ['mech', 'moves', 'muscle', 'zombies', 'boss', 'modes']) {
    await page.click(`#helpTabs .htab[data-tab="${t}"]`);
    await page.waitForTimeout(150);
    const txt = await page.locator('#helpBody').innerText();
    ok(`tab=${t} 有内容`, txt.trim().length > 40, txt.trim().slice(0, 34).replace(/\n/g, ' '));
  }
  await page.click('#btnHelpBack');
  await page.waitForTimeout(250);
  ok('返回主菜单', await page.isVisible('#menu'));

  console.log('\n【3】BOSS 战选武器页');
  await page.click('#mBoss');
  await page.waitForTimeout(300);
  ok('#bossPick 可见', await page.isVisible('#bossPick'));
  const nW = await page.locator('#bossWpnGrid .wpick').count();
  ok('BOSS 战全部武器可选', nW === 9, '实际 ' + nW);
  await page.click('#bossWpnGrid .wpick[data-w="katana"]');
  await page.waitForTimeout(200);
  const detail = await page.locator('#bossWpnDetail').innerText();
  ok('详情含 特性数值/动捕动作/锻炼肌肉',
    /特性数值/.test(detail) && /动捕动作/.test(detail) && /锻炼肌肉/.test(detail));

  console.log('\n【4】BOSS 战本体');
  await page.click('#btnBossGo');
  await page.waitForTimeout(1500);
  const st = await page.evaluate(() => ({
    mode: window.__DBG.S.mode, weapon: window.__DBG.S.weapon,
    hp: window.__DBG.BOSS.hp, maxHp: window.__DBG.BOSS.maxHp,
    active: window.__DBG.BOSS.active, running: window.__DBG.S.running,
    bossHud: getComputedStyle(document.getElementById('bossHud')).display,
    segs: document.querySelectorAll('#bossSeg i').length,
    tag: document.getElementById('modeTag').textContent,
  }));
  ok('模式 = boss', st.mode === 'boss');
  ok('入场武器 = 武士刀', st.weapon === 'katana', st.weapon);
  ok('BOSS 已激活且满血', st.active && st.hp === st.maxHp, `hp=${st.hp}/${st.maxHp}`);
  ok('BOSS 血条 HUD 可见', st.bossHud === 'block');
  ok('血条分 10 段', st.segs === 9, '刻度 ' + st.segs + '（+1 段本体 = 10）');
  ok('模式标签正确', /BOSS/.test(st.tag), st.tag);

  // 召唤小兵 + 冲击波
  await page.evaluate(() => { window.__DBG.bossSummon(); window.__DBG.bossFireWave(); });
  await page.waitForTimeout(500);
  const zc = await page.evaluate(() => window.__DBG.zombies.filter(z => z.state !== 'die').length);
  ok('BOSS 召唤出小兵', zc > 0, '小兵 ' + zc + ' 只');

  // 击杀小兵攒狂怒
  await page.evaluate(() => {
    const zs = window.__DBG.zombies.filter(z => z.state !== 'die');
    for (const z of zs) window.__DBG.killZombie ? window.__DBG.killZombie(z, 'fist') : null;
  });
  await page.waitForTimeout(200);
  const rage = await page.evaluate(() => window.__DBG.BOSS.rage);
  ok('击杀小兵累积狂怒', rage > 0, 'rage=' + rage);

  // 平时打不动 BOSS
  const before = await page.evaluate(() => window.__DBG.BOSS.hp);
  await page.evaluate(() => window.__DBG.hitBoss(999));
  const after = await page.evaluate(() => window.__DBG.BOSS.hp);
  ok('非狂暴时打不动 BOSS', before === after, `${before} → ${after}`);

  // 强制满狂怒 → F 键狂暴
  await page.evaluate(() => { window.__DBG.BOSS.rage = window.__DBG.BOSS.rageMax; });
  await page.keyboard.press('KeyF');
  await page.waitForTimeout(600);
  const bz = await page.evaluate(() => ({
    berserk: window.__DBG.BOSS.berserk, count: window.__DBG.BOSS.berserkCount,
    zc: window.__DBG.zombies.filter(z => z.state !== 'die').length,
  }));
  ok('F 开启狂暴时刻', bz.berserk > 0, '剩余 ' + bz.berserk.toFixed(1) + 's');
  ok('狂暴时小兵全部消失', bz.zc === 0, '剩余 ' + bz.zc);

  // 狂暴中可打 BOSS
  const h1 = await page.evaluate(() => window.__DBG.BOSS.hp);
  await page.evaluate(() => window.__DBG.hitBoss(1000));
  const h2 = await page.evaluate(() => window.__DBG.BOSS.hp);
  ok('狂暴时可对 BOSS 造成伤害', h2 < h1, `${h1} → ${h2}`);

  console.log('\n【5】抱胸 → 武器转盘');
  await page.evaluate(() => { window.__DBG.exitSelectMode(); });
  await page.evaluate(() => window.__DBG.enterSelectMode(true));
  await page.waitForTimeout(300);
  ok('转盘弹窗显示', await page.isVisible('#wheel'));
  const slots = await page.locator('#wheelRow .wslot').count();
  ok('转盘列出全部武器', slots === 9, '实际 ' + slots);
  // 模拟手势横移
  await page.evaluate(() => {
    window.__DBG.S.wheelAccum = 1.0;
    window.__DBG.updateSelectMode(0.016);
  });
  const sc = await page.evaluate(() => window.__DBG.wheelScroll);
  ok('手势横移可滑动转盘', sc > 1, 'scroll=' + sc.toFixed(2));
  const beforeW = await page.evaluate(() => window.__DBG.S.weapon);
  await page.evaluate(() => window.__DBG.confirmSelectMode());
  await page.waitForTimeout(200);
  const afterW = await page.evaluate(() => window.__DBG.S.weapon);
  ok('确认后切换武器', beforeW !== afterW, `${beforeW} → ${afterW}`);
  ok('转盘关闭', !(await page.isVisible('#wheel')));

  console.log('\n【6】单项训练');
  await page.evaluate(() => window.__DBG.gotoMenu());
  await page.waitForTimeout(300);
  await page.click('#mTrain');
  await page.waitForTimeout(300);
  ok('#trainPick 可见', await page.isVisible('#trainPick'));
  await page.click('#trainWpnGrid .wpick[data-w="hammer"]');
  await page.waitForTimeout(200);
  const td = await page.locator('#trainWpnDetail').innerText();
  ok('训练详情含 特性数值/动捕动作/锻炼肌肉',
    /特性数值/.test(td) && /动捕动作/.test(td) && /锻炼肌肉/.test(td));
  await page.click('#btnTrainGo');
  await page.waitForTimeout(1200);
  const tr = await page.evaluate(() => ({
    mode: window.__DBG.S.mode, weapon: window.__DBG.S.weapon,
    trainWeapon: window.__DBG.S.trainWeapon,
    unlocked: [...window.__DBG.S.unlocked],
    tag: document.getElementById('modeTag').textContent,
  }));
  ok('模式 = train', tr.mode === 'train');
  ok('锁定武器 = 战锤', tr.weapon === 'hammer' && tr.trainWeapon === 'hammer');
  ok('只解锁这一把武器', tr.unlocked.length === 1 && tr.unlocked[0] === 'hammer', tr.unlocked.join(','));
  ok('模式标签含武器名', /战锤/.test(tr.tag), tr.tag);
  // 锁定：不能切换到别的武器
  await page.evaluate(() => window.__DBG.switchWeapon('katana'));
  await page.waitForTimeout(150);
  const still = await page.evaluate(() => window.__DBG.S.weapon);
  ok('训练中无法切换到其它武器', still === 'hammer', still);
  // 转盘只显示锁定武器
  const wlist = await page.evaluate(() => window.__DBG.wheelWeaponList());
  ok('训练转盘只有一把武器', wlist.length === 1 && wlist[0] === 'hammer', wlist.join(','));

  console.log('\n【7】结算 / 返回菜单');
  await page.evaluate(() => window.__DBG.gotoMenu());
  await page.waitForTimeout(300);
  ok('回到主菜单', await page.isVisible('#menu'));
  ok('HUD 隐藏', !(await page.isVisible('#hud')));

  console.log('\n【8】闯关模式未被破坏');
  await page.click('#mCampaign');
  await page.waitForTimeout(1200);
  const cp = await page.evaluate(() => ({
    mode: window.__DBG.S.mode, weapon: window.__DBG.S.weapon,
    unlocked: [...window.__DBG.S.unlocked], phase: window.__DBG.S.phase,
    running: window.__DBG.S.running,
  }));
  ok('闯关模式正常进入', cp.mode === 'campaign' && cp.running);
  ok('闯关初始武器 = 拳头', cp.weapon === 'fist');
  ok('闯关初始只解锁 拳/双枪', cp.unlocked.join(',') === 'fist,gun', cp.unlocked.join(','));
  await page.waitForTimeout(2500);
  const prog = await page.evaluate(() => ({ d: window.__DBG.S.distance, ph: window.__DBG.S.phase }));
  ok('闯关会继续推进距离', prog.d > 0, 'distance=' + prog.d.toFixed(1));

  console.log('\n【9】体感手势 · 抱胸识别');
  await page.evaluate(() => window.__DBG.gotoMenu());
  await page.waitForTimeout(200);
  await page.click('#mBoss');
  await page.waitForTimeout(200);
  await page.click('#btnBossGo');
  await page.waitForTimeout(800);
  // 伪造一个「已就绪的摄像头」：写入视频尺寸 + 允许抱胸逻辑生效
  await page.evaluate(() => {
    window.__DBG.LM.w = 640; window.__DBG.LM.h = 480;
    window.__DBG.S.poseOK = true;
    window.__DBG.S.guardHold = 0; window.__DBG.S.defending = false;
  });

  // 构造合成关键点：W=640 H=480
  const mkPose = (mode) => page.evaluate((m) => {
    const W = 640, H = 480;
    const lm = new Array(33).fill(0).map(() => ({ x: 0.5, y: 0.5, z: 0, visibility: 1 }));
    const shW = 180, midX = 320, shY = 200, hipY = 380, chestY = 200 + (hipY - 200) * 0.32;
    // 肩：11=左肩（右側 x 大），12=右肩
    lm[11] = { x: (midX + shW / 2) / W, y: shY / H, z: 0, visibility: 1 };
    lm[12] = { x: (midX - shW / 2) / W, y: shY / H, z: 0, visibility: 1 };
    lm[23] = { x: (midX + shW * 0.35) / W, y: hipY / H, z: 0, visibility: 1 };
    lm[24] = { x: (midX - shW * 0.35) / W, y: hipY / H, z: 0, visibility: 1 };
    lm[7] = { x: (midX + 40) / W, y: 120 / H, z: 0, visibility: 1 };
    lm[8] = { x: (midX - 40) / W, y: 120 / H, z: 0, visibility: 1 };
    let wx, wy;
    if (m === 'hug') { wx = 0.15; wy = 0.0; }        // 双手在胸前合拢
    else { wx = -0.50; wy = 0.0; }                   // 双手交叉分列两侧（左腕越过中线）
    lm[15] = { x: (midX + wx * shW) / W, y: (chestY + wy * shW) / H, z: 0, visibility: 1 };
    lm[16] = { x: (midX - wx * shW) / W, y: (chestY + wy * shW) / H, z: 0, visibility: 1 };
    lm[13] = { x: (midX + shW * 0.6) / W, y: (chestY + 30) / H, z: 0, visibility: 1 };
    lm[14] = { x: (midX - shW * 0.6) / W, y: (chestY + 30) / H, z: 0, visibility: 1 };
    return lm;
  }, mode);

  // 抱胸姿势：应被识别为 hugArmed
  const hugPose = await mkPose('hug');
  const hugRes = await page.evaluate((lm) => {
    for (let i = 0; i < 8; i++) window.__DBG.analyzeGestures(lm.map(p => ({ ...p })));
    return { hug: window.__DBG.S.hugArmed, defending: window.__DBG.S.defending, g: window.__DBG.S.gesture };
  }, hugPose);
  ok('抱胸姿势 → hugArmed = true', hugRes.hug === true, 'gesture=' + hugRes.g);
  ok('抱胸时不误判为防御', hugRes.defending === false);

  // 抱胸保持 0.3s → 自动进入选择状态
  // 无头渲染帧率很低，游戏时间推进慢，这里直接驱动选择态计时（等价于真实抱住 1 秒）
  await page.evaluate((lm) => {
    for (let i = 0; i < 40; i++) window.__DBG.analyzeGestures(lm.map(p => ({ ...p })));
    for (let i = 0; i < 12; i++) window.__DBG.updateSelectMode(0.1);
  }, hugPose);
  await page.waitForTimeout(200);
  const selState = await page.evaluate(() => ({
    sel: window.__DBG.S.selectMode,
    hold: window.__DBG.S.selectHold,
    hug: window.__DBG.S.hugArmed,
    pose: window.__DBG.S.poseOK,
    run: window.__DBG.S.running,
    over: window.__DBG.S.over,
    mode: window.__DBG.S.mode,
  }));
  ok('抱胸保持后进入武器选择状态', selState.sel === true,
    JSON.stringify(selState));
  ok('选择状态弹出转盘', await page.isVisible('#wheel'));

  // 松开抱胸 → 取消
  const guardPose = await mkPose('guard');
  await page.evaluate((lm) => {
    for (let i = 0; i < 6; i++) window.__DBG.analyzeGestures(lm.map(p => ({ ...p })));
  }, guardPose);
  await page.waitForTimeout(800);
  const selOff = await page.evaluate(() => window.__DBG.S.selectMode);
  ok('松开抱胸后退出选择状态', selOff === false);

  // 交叉姿势 → 防御而不是抱胸
  const gRes = await page.evaluate((lm) => {
    window.__DBG.exitSelectMode();
    for (let i = 0; i < 10; i++) window.__DBG.analyzeGestures(lm.map(p => ({ ...p })));
    return { hug: window.__DBG.S.hugArmed, defending: window.__DBG.S.defending };
  }, guardPose);
  ok('双臂交叉 → 防御而非抱胸', gRes.hug === false && gRes.defending === true,
    `hug=${gRes.hug} defending=${gRes.defending}`);

  console.log('\n【10】选择状态下怪物变慢');
  const slowRes = await page.evaluate(async () => {
    const D = window.__DBG, S = D.S;
    D.exitSelectMode();
    // 放一只丧尸在玩家近旁（1.2 米：既会逼近也在撕咬范围内）
    D.spawnZombie('walker', 1.0, -0.7);
    const zz = D.zombies.find(z => z.state !== 'die');
    if (!zz) return { skip: true };
    const step = (n) => { for (let i = 0; i < n; i++) D.update(0.016); };
    const snap = () => ({ x: zz.x, z: zz.z, cd: zz.atkCd });
    // 常态：走 0.5 秒（把冷却设长，避免攻击重置干扰测量）
    S.selectMode = false;
    zz.atkCd = 5;
    const s0 = snap();
    step(30);
    const s1 = snap();
    // 选择态：复位后走 0.5 秒
    zz.x = s0.x; zz.z = s0.z;
    zz.atkCd = 5;
    D.enterSelectMode(true);
    step(30);
    const s2 = snap();
    D.exitSelectMode();
    return {
      normalMove: Math.hypot(s1.x - s0.x, s1.z - s0.z),
      slowMove: Math.hypot(s2.x - s0.x, s2.z - s0.z),
      normalCd: s1.cd - s0.cd,
      slowCd: s2.cd - s0.cd,
      inRange: Math.hypot(s0.x - S.playerX, s0.z - S.playerZ),
    };
  });
  ok('选择状态可开启', !slowRes.skip);
  if (!slowRes.skip) {
    ok('选择状态下丧尸移动明显变慢', slowRes.slowMove < slowRes.normalMove * 0.6,
      `常态 ${slowRes.normalMove.toFixed(4)} → 选择 ${slowRes.slowMove.toFixed(4)}`);
    ok('选择状态下撕咬冷却变慢', slowRes.slowCd > slowRes.normalCd,
      `常态 ${slowRes.normalCd.toFixed(3)} → 选择 ${slowRes.slowCd.toFixed(3)}`);
  }

  console.log('\n【11】运行期错误');
  const errs = await page.evaluate(() => window.__ERR);
  ok('无未捕获运行时错误', errs.length === 0, errs.slice(0, 3).join(' | '));
  const realErrs = consoleErrs.filter(e => !/favicon|Failed to load resource.*net::ERR|Camera|mediaDevices|getUserMedia|WebGL/i.test(e));
  ok('控制台无关键错误', realErrs.length === 0, realErrs.slice(0, 3).join(' | '));

  const pass = results.filter(r => r.pass).length;
  console.log('\n========================================');
  console.log(`结果：${pass}/${results.length} 通过`);
  if (pass < results.length) {
    console.log('失败项：');
    for (const r of results.filter(x => !x.pass)) console.log('  ❌ ' + r.name + (r.extra ? '  → ' + r.extra : ''));
  }
  console.log('========================================');

  await browser.close();
  fs.unlinkSync(testFile);
  process.exit(pass === results.length ? 0 : 1);
})().catch(e => {
  console.error('TEST CRASH:', e);
  try { fs.unlinkSync(testFile); } catch (_) {}
  process.exit(2);
});
