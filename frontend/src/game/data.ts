// 数据表 —— 境界 / 功法 / 宗门任务。扩内容只加数据，不改逻辑。

export interface RealmDef {
  id: string;
  name: string;
  stages: number; // 小境界数（练气=9层，其余=初/中/后/大圆满）
  speed: number; // 每息（1秒）基础灵力
  baseCost: number; // 本境界第一小境突破所需灵力
  lifespan: string;
  breakChance: number; // 冲入本境界基础成功率（1=无需突破）
  note: string;
}

export const REALMS: RealmDef[] = [
  {
    id: "lianqi",
    name: "练气",
    stages: 9,
    speed: 2,
    baseCost: 50,
    lifespan: "百年",
    breakChance: 1,
    note: "引天地灵气入体，洗毛伐髓。",
  },
  {
    id: "zhuji",
    name: "筑基",
    stages: 4,
    speed: 6,
    baseCost: 600,
    lifespan: "两百年",
    breakChance: 0.85,
    note: "筑就仙基，方为仙人之种。",
  },
  {
    id: "jiedan",
    name: "结丹",
    stages: 4,
    speed: 40,
    baseCost: 5000,
    lifespan: "五百年",
    breakChance: 0.6,
    note: "灵气化液凝丹，脱胎换骨。",
  },
  {
    id: "yuanying",
    name: "元婴",
    stages: 4,
    speed: 250,
    baseCost: 40000,
    lifespan: "千载",
    breakChance: 0.45,
    note: "元婴出窍，可御空遁地。",
  },
  {
    id: "huashen",
    name: "化神",
    stages: 1,
    speed: 1500,
    baseCost: 0,
    lifespan: "寿与天齐",
    breakChance: 0,
    note: "感悟天地法则，此界尽头，静待飞升。",
  },
];

export const CN_NUM = ["一", "二", "三", "四", "五", "六", "七", "八", "九"];
export const SUB4 = ["初阶", "中阶", "后阶", "大圆满"];

// 功法
export interface MethodDef {
  id: string;
  name: string;
  speedMul: number; // 修炼速度倍率
  breakBonus: number; // 大境界突破成功率加成
  unlock: string; // 获取途径（展示用）
  desc: string;
}

export const METHODS: MethodDef[] = [
  {
    id: "basic",
    name: "筑基心法",
    speedMul: 1,
    breakBonus: 0,
    unlock: "七玄门默认功法",
    desc: "平实无华，修炼之道起点。",
  },
  {
    id: "spirit",
    name: "聚灵诀",
    speedMul: 1.2,
    breakBonus: 0,
    unlock: "外门任务奖励",
    desc: "汇聚天地游离灵气，修炼速度 +20%。",
  },
  {
    id: "star",
    name: "星辰力",
    speedMul: 1.1,
    breakBonus: 0.08,
    unlock: "结丹任务奖励",
    desc: "借星辰之势淬炼灵基，突破成功率 +8%。",
  },
];

// 宗门任务链（按境界里程碑推进）
export interface MissionDef {
  id: string;
  name: string;
  desc: string;
  realm: number; // 要求境界下标
  stage: number; // 要求小境界（1 起）
  stones: number; // 灵石奖励
  spirit: number; // 灵力奖励
  method?: string; // 解锁功法
  rank?: string; // 身份晋升
}

export const MISSIONS: MissionDef[] = [
  { id: "m1", name: "修炼入门", desc: "修至练气二层", realm: 0, stage: 2, stones: 30, spirit: 100 },
  { id: "m2", name: "引气入体", desc: "修至练气四层", realm: 0, stage: 4, stones: 80, spirit: 300 },
  { id: "m3", name: "聚灵", desc: "修至练气七层", realm: 0, stage: 7, stones: 200, spirit: 800, method: "spirit" },
  { id: "m4", name: "筑基大典", desc: "突破至筑基", realm: 1, stage: 1, stones: 500, spirit: 2000, rank: "内门弟子" },
  { id: "m5", name: "内门试炼", desc: "修至筑基中期", realm: 1, stage: 2, stones: 800, spirit: 5000 },
  { id: "m6", name: "筑基圆满", desc: "修至筑基大圆满", realm: 1, stage: 4, stones: 1500, spirit: 12000 },
  { id: "m7", name: "结丹", desc: "突破至结丹", realm: 2, stage: 1, stones: 3000, spirit: 40000, method: "star", rank: "核心弟子" },
  { id: "m8", name: "金丹圆满", desc: "修至结丹大圆满", realm: 2, stage: 4, stones: 6000, spirit: 120000 },
  { id: "m9", name: "元婴出窍", desc: "突破至元婴", realm: 3, stage: 1, stones: 12000, spirit: 400000 },
  { id: "m10", name: "化神", desc: "登临此界巅峰：化神", realm: 4, stage: 1, stones: 30000, spirit: 0 },
];