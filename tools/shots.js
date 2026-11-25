// 截图：主菜单 / 帮助各分类 / 选武器页 / BOSS 战 HUD / 武器转盘
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const OUT = path.join(dir, 'tools', 'shots');
fs.mkdirSync(OUT, { recursive: true });

function findPlaywright() {
  const cands = [];
  const la = process.env.LOCALAPPDATA || '';
  if (la) cands.push(path.join(la, 'npm-cache', '_npx'));
  for (const base of cands) {
    if (!fs.existsSync(base)) continue;
    for (const d of fs.readdirSync(base)) cands.push(path.join(base, d, 'node_modules', 'playwright'));
  }
  cands.push('playwright');
  for (const c of cands) { try { return require(c); } catch (_) {} }
  throw new Error('playwright 未找到');
}
const { chromium } = findPlaywright();

let src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');
const hook = `\nwindow.__DBG={S,BOSS,zombies,WEAPONS,enterSelectMode,exitSelectMode,bossSummon,bossFireWave,gotoMenu,startMode,renderHelp,renderWeaponGrid,renderWeaponDetail,confirmSelectMode,updateSelectMode,triggerBerserk,switchWeapon};\n`;
const marker = /loop\(\);\r?\n<\/script>/;
src = src.replace(marker, 'loop();\n' + hook + '\n</script>');
const testFile = path.join(dir, '__shot.html');
fs.writeFileSync(testFile, src);

(async () => {
  const browser = await chromium.launch({ args: ['--allow-file-access-from-files', '--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream'] });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  await page.goto('file:///' + testFile.replace(/\\/g, '/'));
  await page.waitForTimeout(3500);

  const shot = async (name) => { await page.screenshot({ path: path.join(OUT, name + '.png') }); console.log('📷 ' + name); };

  await shot('01-menu');

  await page.click('#mHelp'); await page.waitForTimeout(400);
  await shot('02-help-weapons');
  for (const t of ['mech', 'moves', 'muscle', 'zombies', 'boss']) {
    await page.click(`#helpTabs .htab[data-tab="${t}"]`); await page.waitForTimeout(250);
    await shot('03-help-' + t);
  }
  await page.click('#btnHelpBack'); await page.waitForTimeout(300);

  await page.click('#mBoss'); await page.waitForTimeout(400);
  await page.click('#bossWpnGrid .wpick[data-w="katana"]'); await page.waitForTimeout(250);
  await shot('04-bosspick');

  await page.click('#btnBossGo'); await page.waitForTimeout(1200);
  await page.evaluate(() => { window.__DBG.bossSummon(); window.__DBG.bossFireWave(); });
  await page.waitForTimeout(1400);
  await shot('05-boss-fight');

  await page.evaluate(() => { window.__DBG.BOSS.rage = window.__DBG.BOSS.rageMax; window.__DBG.triggerBerserk(); });
  await page.waitForTimeout(900);
  await shot('06-boss-berserk');

  await page.evaluate(() => window.__DBG.enterSelectMode(true));
  await page.waitForTimeout(400);
  await shot('07-weapon-wheel');
  await page.evaluate(() => window.__DBG.exitSelectMode());

  await page.evaluate(() => window.__DBG.gotoMenu()); await page.waitForTimeout(400);
  await page.click('#mTrain'); await page.waitForTimeout(400);
  await page.click('#trainWpnGrid .wpick[data-w="hammer"]'); await page.waitForTimeout(250);
  await shot('08-trainpick');

  // 训练选武器页：应看不到「第 N 波解锁」
  const trainTxt = await page.locator('#trainWpnGrid').innerText();
  console.log(trainTxt.includes('波') ? '⚠️ 训练页仍出现「波」字' : '✅ 训练页无解锁波次');
  const trainDetail = await page.locator('#trainWpnDetail').innerText();
  console.log(/第\s*\d+\s*波/.test(trainDetail) ? '⚠️ 训练详情仍出现解锁波次' : '✅ 训练详情无解锁波次');

  // 战锤蓄力 HUD（常驻「蓄力中 xx%」）
  await page.click('#btnTrainBack'); await page.waitForTimeout(300);
  await page.evaluate(() => {
    const D = window.__DBG;
    D.startMode('campaign', 'hammer');
    D.S.unlocked.add('hammer');
    D.switchWeapon('hammer');
  });
  await page.waitForTimeout(600);
  await page.evaluate(() => { window.__DBG.S.charging = true; window.__DBG.S.chargeStart = window.__DBG.S.time - 1.4; });
  await page.waitForTimeout(500);
  await shot('09-charge-hud');
  const chargeTxt = await page.locator('#chargeHud').innerText();
  console.log('蓄力 HUD：' + chargeTxt.replace(/\n/g, ' '));

  // BOSS 选武器页：应保留「第 N 波解锁」
  await page.evaluate(() => window.__DBG.gotoMenu()); await page.waitForTimeout(400);
  await page.click('#mBoss'); await page.waitForTimeout(400);
  const bossTxt = await page.locator('#bossWpnGrid').innerText();
  console.log(/第\s*\d+\s*波/.test(bossTxt) ? '✅ BOSS 页保留解锁波次' : '⚠️ BOSS 页丢失解锁波次');

  await browser.close();
  fs.unlinkSync(testFile);
  console.log('完成');
})().catch(e => { console.error(e); try { fs.unlinkSync(testFile); } catch (_) {} process.exit(1); });
