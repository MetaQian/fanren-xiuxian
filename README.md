# 凡人修仙 · 七玄外传

《凡人修仙传》世界观同人玩法：**凡人流放置修仙** —— 从七玄门外门弟子起步，每一次大境界突破都是生死一线。

> 本作品为非商业同人游戏，仅取世界观与设定元素（境界体系、功法、世界观名词），不涉及原著剧情原文。

## 玩法规约（M0 已实现）

- **修炼循环**：每息（1 秒）自动积累灵力，攒够即可突破小境界
- **境界线**：练气 1~9 层 → 筑基 → 结丹 → 元婴 → 化神；大境界突破有成功率，失败则天劫反噬（重伤 / 灵力大损）
- **凡人特色**：因果值、低调值（突破成功后 +5）、离线闭关结算（按五成速度，上限 8 小时）
- **存档**：localStorage 本地存档（M4 上线 D1 云存档）

## 技术栈

| 层 | 选型 |
|---|---|
| 前端 | Vue 3 + Vite + TypeScript（游戏逻辑全在前端，断网可玩） |
| 后端 | Cloudflare Worker（静态托管 + `/api/*`） |
| 数据 | 境界/物品/法术均为 JSON 数据表（`frontend/src/game/data.ts`），扩内容只加数据 |
| 部署 | GitHub 仓库 → CF Workers Git 集成自动部署，域名 `xiuxian.jaricloud.eu.cc` |

## 目录结构

```
frontend/           # Vue 3 前端
  src/game/data.ts  # 境界数据表（后续扩内容的核心）
  src/game/state.ts # 状态机：存档、离线结算、突破事件
  src/App.vue       # 主界面
worker/entry.ts     # Worker 入口：静态资源 + API 路由
wrangler.json       # Workers 配置（assets 指向 frontend/dist）
```

## 里程碑

- [x] **M0** 可玩骨架：修炼/突破/天劫/本地存档，线上可访问
- [ ] **M1** 核心循环完善：功法选择、宗门任务链、境界数值调优
- [ ] **M2** 战斗 + 洞府探索：回合制战斗、法术/符箓数据表、Roguelike 秘境、首个 Boss
- [ ] **M3** 技艺 + 世界观：炼丹/制符/布阵、因果与低调玩法化、剧情章节（七玄门 → 天魔教 → 坠星界）
- [ ] **M4** 云存档：D1 存档接口、每日签到、成就系统

## 本地开发

```sh
npm install
npm run dev        # 本地 5173 预览
npm run build      # 构建到 frontend/dist
npm run deploy     # wrangler 部署（紧急直推用）
```

常规发布：推送到 `main` 分支，CF Git 集成自动构建部署。