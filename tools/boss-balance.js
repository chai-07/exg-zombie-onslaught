// BOSS 战平衡模拟：估算每把武器需要多少次狂暴时刻才能打倒 BOSS
// 用法： node tools/boss-balance.js
const fs = require('fs');
const path = require('path');
const dir = path.join(__dirname, '..');
const src = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

/* ---------- 从 index.html 提取关键数值 ---------- */
function grab(re, label) {
  const m = src.match(re);
  if (!m) throw new Error('未找到：' + label);
  return m;
}
const BOSS_HP = parseInt(grab(/const BOSS_HP = (\d+)/, 'BOSS_HP')[1], 10);
const BERSERK_WINDOW = 10;
const MULT_STEP = 0.04;          // 每多用一次狂暴，伤害倍率 +4%
const PER_BERSERK_ATK = 1.6;     // 每秒有效攻击次数（含挥空/被格挡的折损）

// 每把武器：单次平均伤害 + 期望出手间隔（秒）
const WEAPON = {
  fist:    { dmg: 122, rate: 1.5, note: '含 2/3/4 拳连招（42/85/140/220）' },
  gun:     { dmg: 38,  rate: 3.6, note: '双枪 0.18s 冷却（左右手独立）' },
  katana:  { dmg: 102, rate: 1.1, note: '斜劈80/竖砍125/捅刺102' },
  staff:   { dmg: 49,  rate: 1.1, note: '劈56/扫52/点40' },
  hammer:  { dmg: 110, rate: 0.75,note: '蓄力砸落 78×1.6' },
  daggers: { dmg: 22,  rate: 1.7, note: '连割15 / 双刺30' },
  whip:    { dmg: 30,  rate: 1.3, note: '抽打（不蓄力）' },
  bow:     { dmg: 62,  rate: 0.85,note: '扯线放箭 62（固定伤害）' },
  flail:   { dmg: 55,  rate: 0.75,note: '转圈抽击 55（固定伤害）' },
};

function berserksNeeded(dps) {
  let hp = BOSS_HP, n = 0;
  while (hp > 0 && n < 200) {
    n++;
    const mult = 1 + MULT_STEP * n;
    hp -= dps * BERSERK_WINDOW * mult;
  }
  return n;
}

console.log('BOSS_HP = ' + BOSS_HP + ' · 血条 ' + 10 + ' 段 · 每次狂暴 ' + BERSERK_WINDOW + 's · 倍率 +' + (MULT_STEP*100) + '%/次\n');
console.log('武器'.padEnd(10) + '平均伤害'.padStart(9) + '出手/s'.padStart(9) + 'DPS'.padStart(9) + '需要狂暴次数'.padStart(14));
console.log('-'.repeat(56));

const rows = [];
for (const [k, v] of Object.entries(WEAPON)) {
  const dps = v.dmg * v.rate;
  rows.push({ k, dps, n: berserksNeeded(dps) });
  console.log(k.padEnd(10) + String(v.dmg).padStart(9) + v.rate.toFixed(2).padStart(9)
    + dps.toFixed(0).padStart(9) + ('  ' + rows[rows.length-1].n + ' 次').padStart(14));
}
const ns = rows.map(r => r.n).sort((a, b) => a - b);
const median = ns[Math.floor(ns.length / 2)];
const avg = ns.reduce((a, b) => a + b, 0) / ns.length;
console.log('-'.repeat(56));
console.log('中位数 ' + median + ' 次 · 平均 ' + avg.toFixed(1) + ' 次 · 区间 ' + ns[0] + '~' + ns[ns.length-1] + ' 次');
console.log('\n目标：「大概十次左右狂暴时刻」→ 中位数应落在 9~12 次。');
console.log('提示：BOSS_HP 调大 → 狂暴次数变多；调小 → 变少。');
console.log('每次狂暴之间的准备时间（攒狂怒：杀 10 只杂兵）不计入本表。');
