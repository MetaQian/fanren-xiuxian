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

// ===== M2：战斗 / 秘境数据表 =====

export interface SpellDef {
  id: string;
  name: string;
  cost: number; // 灵力消耗
  mul: number; // 伤害倍率（0 = 非攻击法术）
  crit?: number; // 会心概率
  critMul?: number; // 会心倍率
  healPct?: number; // 治疗自身比例
  block?: number; // 本回合减伤比例
  realm: number; // 所需境界（下标）
  desc: string;
}

export const SPELLS: SpellDef[] = [
  { id: "sword", name: "灵剑术", cost: 50, mul: 1, realm: 0, desc: "御灵剑斩敌，平实可靠。" },
  { id: "flash", name: "雷闪诀", cost: 120, mul: 1.5, crit: 0.15, critMul: 2, realm: 0, desc: "雷光一闪，15% 会心（×2）。" },
  { id: "recover", name: "续命诀", cost: 200, mul: 0, healPct: 0.4, realm: 1, desc: "灵力归元，回复 40% 气血（消耗一回合）。" },
  { id: "shield", name: "金钟罩", cost: 100, mul: 0, block: 0.6, realm: 1, desc: "金钟护体，本回合所受伤害 -60%。" },
  { id: "thunder", name: "九天雷法", cost: 400, mul: 2.4, crit: 0.1, critMul: 2.5, realm: 2, desc: "九天雷落，毁天灭地之威。" },
];

export interface ItemDef {
  id: string;
  name: string;
  price: number; // 灵石售价
  healPct?: number;
  spirit?: number; // 灵力收益 = maxHp × 该值
  blockPct?: number;
  blockTurns?: number;
  combatOnly?: boolean;
  desc: string;
}

export const ITEMS: ItemDef[] = [
  { id: "heal", name: "回灵丹", price: 60, healPct: 0.5, desc: "回复 50% 气血。" },
  { id: "gather", name: "聚灵丹", price: 40, spirit: 1, desc: "炼化得灵力（随境界增长）。" },
  { id: "armor", name: "灵甲符", price: 100, blockPct: 0.5, blockTurns: 3, combatOnly: true, desc: "接下来 3 次受击 -50%（仅战斗中）。" },
];

// ===== M3：炼丹（仿一念逍遥 random_drug：药材→丹方→成功率→功效）=====
export interface HerbDef {
  id: string;
  name: string;
  tier: number; // 推荐境界（展示）
  price: number; // 商行售价（灵石）
  drop: number; // 战后掉率（基础）
  desc: string;
}
export const HERBS: HerbDef[] = [
  { id: "herb_yuteng", name: "玉藤草", tier: 0, price: 15, drop: 0.3, desc: "七玄后山常见灵草，炼药引子。" },
  { id: "herb_linglu", name: "灵露草", tier: 1, price: 45, drop: 0.14, desc: "晨露中孕育，灵气充沛。" },
  { id: "herb_riyan", name: "日炎花", tier: 2, price: 120, drop: 0.07, desc: "向阳而生的烈焰之蕊，性烈。" },
  { id: "herb_leisui", name: "雷髓果", tier: 3, price: 300, drop: 0.035, desc: "雷泽深处结的果实，蕴含雷威。" },
];

export interface PillDef {
  id: string;
  name: string;
  recipe: Record<string, number>; // 药材 → 数量
  brewSec: number; // 炼制耗时（息，可离线）
  chance: number; // 成功率（失败炸炉，材料有折损）
  effect: "heal" | "spirit" | "break" | "gather";
  breakBonus?: number; // effect=break：下次大突破成功率加成
  spiritMul?: number; // effect=spirit：灵力收益 = maxHp × 该值
  healPct?: number; // effect=heal
  gatherMul?: number; // effect=gather：修炼加速
  gatherSec?: number; // effect=gather：加速时长
  desc: string;
}
export const PILLS: PillDef[] = [
  { id: "pill_huichun", name: "回春丹", recipe: { herb_yuteng: 2 }, brewSec: 3, chance: 0.95, effect: "heal", healPct: 0.6, desc: "回复 60% 气血。" },
  { id: "pill_juqi", name: "聚气丹", recipe: { herb_yuteng: 1, herb_linglu: 1 }, brewSec: 8, chance: 0.8, effect: "spirit", spiritMul: 0.8, desc: "炼化得灵力（随境界增长）。" },
  { id: "pill_pojing", name: "破境丹", recipe: { herb_linglu: 2, herb_riyan: 1 }, brewSec: 20, chance: 0.6, effect: "break", breakBonus: 0.15, desc: "服后下次大境界突破成功率 +15%（可叠 3 层）。" },
  { id: "pill_ningqi", name: "凝气丹", recipe: { herb_riyan: 1, herb_leisui: 1 }, brewSec: 30, chance: 0.45, effect: "gather", gatherMul: 0.3, gatherSec: 60, desc: "60 息内修炼速度 +30%。" },
];
export const ALCH_ICONS: Record<string, string> = {
  herb_yuteng: "🌿",
  herb_linglu: "💧",
  herb_riyan: "🌺",
  herb_leisui: "⚡",
  pill_huichun: "💊",
  pill_juqi: "💠",
  pill_pojing: "🔥",
  pill_ningqi: "🌀",
};

export interface EnemyDef {
  id: string;
  name: string;
  hpMul: number; // 相对玩家最大气血
  atkMul: number; // 每回合伤害占玩家最大气血的比例（独立于玩家攻击，可单独调难度）
  stones: [number, number]; // 灵石掉落区间（×(1+境界)）
  itemChance: number; // 掉落物品概率
  realms: number[]; // 可出现的境界
  boss?: boolean;
  flavor: string;
}

export const ENEMIES: EnemyDef[] = [
  { id: "wolf", name: "凶狼", hpMul: 0.7, atkMul: 0.055, stones: [10, 20], itemChance: 0.25, realms: [0], flavor: "草丛中凶气骤起，一头凶狼扑出。" },
  { id: "beast", name: "洞窟灵兽", hpMul: 0.85, atkMul: 0.06, stones: [15, 30], itemChance: 0.3, realms: [0, 1, 2], flavor: "石缝中滑出一头生有灵纹的灵兽。" },
  { id: "raider", name: "采药散修", hpMul: 0.8, atkMul: 0.062, stones: [20, 40], itemChance: 0.4, realms: [0, 1], flavor: "对方冷笑：「留下财货，滚吧。」" },
  { id: "mobei", name: "游荡魔修", hpMul: 0.9, atkMul: 0.066, stones: [30, 60], itemChance: 0.4, realms: [1, 2, 3], flavor: "黑气盘绕，一名魔修在荒界游荡至此。" },
  { id: "ghost", name: "游荡鬼魂", hpMul: 0.8, atkMul: 0.07, stones: [25, 50], itemChance: 0.35, realms: [1, 2, 3], flavor: "寒气凝雾，鬼魂哀嚎着围拢过来。" },
  { id: "beastking", name: "兽王", hpMul: 1.15, atkMul: 0.072, stones: [80, 150], itemChance: 0.6, realms: [0, 1], boss: true, flavor: "兽王仰天长啸，地面震颤。" },
  { id: "demonlord", name: "天魔教徒", hpMul: 1.25, atkMul: 0.082, stones: [150, 300], itemChance: 0.8, realms: [1, 2], boss: true, flavor: "黑石座上端坐一道红袍，目光如刀。" },
  { id: "yuanshui", name: "陨落元婴", hpMul: 1.35, atkMul: 0.09, stones: [300, 600], itemChance: 0.9, realms: [2, 3, 4], boss: true, flavor: "枯骨而立，眼中神光依旧森然。" },
];

export const DUNGEON = {
  name: "启元洞府",
  rooms: 5, // 共 5 房，末房必为领主
  fee: 20, // 进入费用（灵石）
};

// ===== M2.5：场景地图（开放世界基础：节点 + 邻接 + 境界解锁 + 地点效果） =====

export interface MapNodeDef {
  id: string;
  name: string;
  icon: string;
  kind: "home" | "wild" | "spot" | "dungeon"; // 家 / 野外(有遭遇) / 修炼宝地 / 秘境入口
  minRealm: number; // 解锁所需境界（下标）
  desc: string; // 地点描述（踏入时展示）
  // wild：可遭遇的敌人 id 池 + 每秒遭遇概率 + 掉落倍数
  enemies?: string[];
  encounter?: number;
  dropMul?: number;
  // spot：停留时的修炼速度加成
  speedBonus?: number;
  // dungeon：此处为秘境入口（进入逻辑复用 DUNGEON）
  dungeon?: boolean;
  // 地图网格坐标（3 列 × 2 行）
  x: number;
  y: number;
  links: string[]; // 可直达的相邻地点
}

export const MAP_NODES: MapNodeDef[] = [
  {
    id: "qixuan",
    name: "七玄门",
    icon: "🏯",
    kind: "home",
    minRealm: 0,
    desc: "立誓拜入的宗门。山门巍峨，楼阁层叠，灵气温厚，是安身修行的起点。",
    x: 0,
    y: 0,
    links: ["blackwind", "cave"],
  },
  {
    id: "blackwind",
    name: "黑风谷",
    icon: "🐺",
    kind: "wild",
    minRealm: 0,
    desc: "风啸日夜不休的狭谷，凶兽出没。猎杀者可得其财——凡人流，富贵险中求。",
    enemies: ["wolf", "beast"],
    encounter: 0.015,
    dropMul: 1.6,
    x: 1,
    y: 0,
    links: ["qixuan", "mist", "spiritfield"],
  },
  {
    id: "mist",
    name: "迷雾沼泽",
    icon: "🌫️",
    kind: "wild",
    minRealm: 1,
    desc: "浓雾如汤，鬼火夜浮。寒气侵体，迷途者十去二三——但沼泽深处，往往埋着旧人的遗宝。",
    enemies: ["ghost", "beast"],
    encounter: 0.02,
    dropMul: 2.0,
    x: 2,
    y: 0,
    links: ["blackwind", "demonvalley"],
  },
  {
    id: "cave",
    name: "启元洞府·入口",
    icon: "🕳️",
    kind: "dungeon",
    minRealm: 0,
    desc: "上古洞府遗刻于此，门扉只对有缘人开。府内重重杀机，末重有领主镇守。",
    dungeon: true,
    x: 0,
    y: 1,
    links: ["qixuan", "spiritfield"],
  },
  {
    id: "spiritfield",
    name: "灵脉田",
    icon: "🌿",
    kind: "spot",
    minRealm: 1,
    desc: "宗门辟出的灵脉上田，灵气浓得几乎凝出白雾。在此修炼，灵力汇聚快上一截。",
    speedBonus: 0.3,
    x: 1,
    y: 1,
    links: ["blackwind", "cave", "demonvalley"],
  },
  {
    id: "demonvalley",
    name: "魔教谷",
    icon: "😈",
    kind: "wild",
    minRealm: 2,
    desc: "天魔教盘踞之地，谷中黑气氤氲。高手如云，赏金满谷——活下来的人，都成了大修士。",
    enemies: ["mobei", "demonlord", "ghost"],
    encounter: 0.025,
    dropMul: 2.8,
    x: 2,
    y: 1,
    links: ["mist", "spiritfield"],
  },
];

export const MAP_HOME = "qixuan"; // 出生 / 默认地点