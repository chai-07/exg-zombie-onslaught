// 从 index.html 提取真实数值，生成文档用表��
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'index.html'), 'utf8');

const arch = {};
const re = /(\w+):\s*\{\s*hp:\s*(\d+),\s*elite:\s*(true|false)/g;
let m;
while ((m = re.exec(src))) arch[m[1]] = { hp: +m[2], elite: m[3] === 'true' };
const gTrash = +/HP_GROW_TRASH = ([\d.]+)/.exec(src)[1];
const gElite = +/HP_GROW_ELITE = ([\d.]+)/.exec(src)[1];

const forms = [];
const fre = /\{ id: '(\w+)',\s*name: '([^']+)',[^\n]*?dmg: (\d+),[^\n]*?range: ([\d.]+), arc: ([\d.]+), aoe: ([\d.]+)([^\n]*)\}/g;
while ((m = fre.exec(src))) {
  const ab = /armorBonus: ([\d.]+)/.exec(m[7]);
  forms.push({ id: m[1], name: m[2], dmg: +m[3], range: +m[4], arc: +m[5], aoe: +m[6], ab: ab ? +ab[1] : 1 });
}

const base = [];
const bre = /(fist|gun|bow|flail|whip):\s*\{\s*name: '([^']+)',\s*dmg: (\d+),\s*range: ([\d.]+),\s*arc: ([\d.]+)/g;
while ((m = bre.exec(src))) base.push({ id: m[1], name: m[2], dmg: +m[3], range: +m[4], arc: +m[5] });

console.log('ARCHETYPES:', JSON.stringify(arch));
console.log('growth:', gTrash, '/', gElite);
console.log('FORMS:', forms.map(f => `${f.name} dmg${f.dmg} ab${f.ab}`).join(' | '));
console.log('BASE:', base.map(b => `${b.name} ${b.dmg}`).join(' | '));

function hpOf(a, idx) { const g = arch[a].elite ? gElite : gTrash; return arch[a].hp * (1 + idx * g); }
function hits(dmg, hp, ab, elite) { return Math.ceil(hp / (ab > 1 && elite ? dmg * ab : dmg)); }

const waves = [0, 9, 19];
console.log('\n=== 击倒数表（普通/坦克/巨无霸）===');
console.log('| 武器 / 招式 | 第1波 | 第10波 | 第20波 |');
console.log('|---|---|---|---|');
for (const f of forms) {
  const cells = waves.map(w => {
    const v = ['walker', 'brute', 'titan'].map(a => hits(f.dmg, hpOf(a, w), f.ab, arch[a].elite));
    return v.join(' / ');
  });
  console.log(`| ${f.name}（${f.dmg}${f.ab > 1 ? ' 破甲×' + f.ab : ''}） | ${cells.join(' | ')} |`);
}
for (const b of base) {
  const cells = waves.map(w => {
    const v = ['walker', 'brute', 'titan'].map(a => hits(b.dmg, hpOf(a, w), 1, arch[a].elite));
    return v.join(' / ');
  });
  console.log(`| ${b.name}（${b.dmg}） | ${cells.join(' | ')} |`);
}

console.log('\n=== 波次表 ===');
function waveSize(i) { return i < 6 ? 2 + i : Math.min(8 + Math.floor((i - 6) * 1.7), 20); }
function eliteCount(i) { return i < 4 ? 0 : i < 8 ? 1 : Math.min(1 + Math.floor((i - 8) / 6), 2); }
for (const i of [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 11, 14, 17, 19, 23]) {
  console.log(`第${i + 1}波 | 数量 ${waveSize(i)} | 精英 ${eliteCount(i)} | walker ${Math.round(hpOf('walker', i))} · runner ${Math.round(hpOf('runner', i))} · crawler ${Math.round(hpOf('crawler', i))} · hunter ${Math.round(hpOf('hunter', i))} · brute ${Math.round(hpOf('brute', i))} · titan ${Math.round(hpOf('titan', i))}`);
}
