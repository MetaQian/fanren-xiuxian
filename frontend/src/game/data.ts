// 境界数据表 —— 后续扩内容只加数据，不改逻辑
export interface RealmDef {
  id: string;
  name: string;
  stages: number; // 小境界数（练气=9层，其余=初/中/后/大圆满）
  speed: number; // 每息（1秒）基础灵力
  baseCost: number; // 本境界第一小境突破所需灵力
  lifespan: string;
  breakChance: number; // 冲入本境界的成功率（1=无需突破）
  note: string;
}

export const REALMS: RealmDef[] = [
  {
    id: "lianqi",
    name: "练气",
    stages: 9,
    speed: 1,
    baseCost: 60,
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