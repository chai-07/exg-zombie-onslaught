# tools/ — 数值与功能验证脚本

这些脚本用 Playwright 驱动真实浏览器，在 `index.html` 的副本上挂调试钩子，
用**手动步进游戏时间**（`update(1/60)`）而不是 `requestAnimationFrame`——
因为 headless Chromium 会把 rAF 节流到 ~3~5fps，直接测量会把所有时间相关数据压缩十几倍。

## 前置

```bash
# playwright 可装在任意目录；脚本会自动在 npx 缓存 / 全局 node_modules 里找
npm i playwright          # 或 npx playwright install chromium

# 直接用 file:// 打开即可（脚本会生成 __test.html 临时副本，用完自动删除）
# 如需手机端联动再起本地服务：node server.js 8123
```

## 脚本

| 脚本 | 作用 | 用法 |
|---|---|---|
| `e2e-test.js` | **端到端功能回归（59 项）**：主菜单 → 帮助 7 分类 → BOSS 选武器 → BOSS 战（召唤/狂怒/狂暴/打不动本体）→ 抱胸手势 → 武器转盘 → 单项训练锁定 → 闯关模式未被破坏 | `node tools/e2e-test.js` |
| `e2e-newfeatures.js` | **本轮 11 项需求专项（45 项）**：音频素材清理 · 打击不卡顿 · 删除盾刀 · 训练隐藏解锁波次 · 双枪左右手齐射 · 战锤抬手蓄力 + HUD · 生命值 66 + 残血判定 · 匕首/武士刀削弱 · 鞭子前甩 · 弓箭扯线来回 · 流星锤转圈 | `node tools/e2e-newfeatures.js` |
| `boss-balance.js` | **BOSS 平衡模拟**：从 `index.html` 读 `BOSS_HP`，按各武器 DPS 估算需要多少次狂暴时刻打倒 BOSS | `node tools/boss-balance.js` |
| `shots.js` | 批量截图（菜单/帮助/选武器页/BOSS 战/狂暴/武器转盘）到 `tools/shots/` | `node tools/shots.js` |
| `gen-doc-table.js` | 从 `index.html` 直接提取数值生成文档表格（§2.3 击倒数表） | `node tools/gen-doc-table.js` |
| `build-test.js` | 旧版：生成带计数器插桩的 `__test.html` | `node tools/build-test.js` |
| `regression-juice.js` | 旧版：打击感系统回归（顿感/慢动作/白闪/飘字/尸潮渲染耗时） | `node tools/regression-juice.js` |
| `balance-sim.js` | 旧版：站桩/后撤打法 × 波次武器组合的阵亡率与全清率 | `node tools/balance-sim.js` |

## 注意

- `arc` 参数是**余弦阈值**不是弧度：全向要传 `-1`，拳头 0.85 ≈ 97° 扇形。
- 模拟脚本必须每帧锁 `S.nextEncounterAt = 1e9`，否则清完一波会触发 `startEncounter()` 自动进入下一波，数据全乱。
- 玩家往 **+Z** 才是远离尸潮（尸潮从 -Z 方向来）；退到地图边缘（z ≥ 5.5）会让怪追过玩家头顶而被世界滚动回收。
- 合成姿态测试需要先写 `window.__DBG.LM.w / LM.h`（视频尺寸）并把 `S.poseOK = true`，
  否则 `analyzeGestures()` 里所有归一化距离都会退化成 0。
- **⚠️ 合成姿态的左右必须符合 MediaPipe 约定**：本人左手（`lm[11]/[13]/[15]`）出现在画面**右侧**（x 较大），
  本人右手（`lm[12]/[14]/[16]`）出现在画面**左侧**（x 较小）。
  若把左右放反，`handCross = (L.x − R.x) / shW` 会恒为负 → 误判成「双臂交叉防御」→
  `S.defending = true` → `triggerAttack()` 被拦截 → **表现就是「手势永远打不出」**。
  参考 `tools/e2e-test.js` 的 `makePose()`（`lm[11] = midX + shW/2`）。
- `file://` 打开时 `location.host` 为空，手机 WebSocket 联动会自动跳过（不会刷错误）。

### 跨用例的全局状态（e2e-newfeatures.js 里要手动清）

这些是 module 级全局量，**不会**被 `resetGame()` 重置，测试里连续跑多个手势用例时会互相阻塞：

| 全局量 | 作用 | 清理方式 |
|---|---|---|
| `GUN_CD.R` / `GUN_CD.L` | 双枪每只手独立的开火冷却（0.18s） | `__DBG.GUN_CD.R = 0; __DBG.GUN_CD.L = 0;`（`resetGame()` 会清） |
| `GW.gunR` / `GW.gunL` 的 `on` / `dir` / `lastFired` | 双枪摇臂状态机 | 手动置 `on=false; dir=0; lastFired=-1e9` |
| `lastBowAt` | 放箭节流 260ms | `__DBG.timers.bow = -1e9` |
| `lastFlailAt` | 流星锤抽击节流 320ms | `__DBG.timers.flail = -1e9` |
| `lastBladeAt` | 刀/鞭/匕首共用节流 380~240ms | `__DBG.timers.blade = -1e9` |
| `GT.init` | 第一次 `analyzeGestures()` 只做基准标定会直接 return | 每个手势用例先热身调一次 |
| `S.defending` / `S.guardHold` | 「双臂交叉防御」防抖状态，会拦截 `triggerAttack()` | `__DBG.resetGuard()`（清 `defending` / `guardHold` / `hugArmed`） |

