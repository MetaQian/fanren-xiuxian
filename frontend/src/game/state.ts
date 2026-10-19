import {
  DUNGEON,
  ENEMIES,
  HERBS,
  ITEMS,
  MAP_HOME,
  MAP_NODES,
  METHODS,
  MISSIONS,
  PILLS,
  SPELLS,
  TOWER,
  TOWER_ELITES,
  TOWER_MOBS,
  type EnemyDef,
  type HerbDef,
  type ItemDef,
  type MapNodeDef,
  type MethodDef,
  type PillDef,
  type SpellDef,
  CN_NUM,
  REALMS,
  SUB4,
} from "./data";

export interface LogEntry {
  t: number;
  text: string;
  kind: "info" | "good" | "bad" | "break";
}

export interface EnemyState {
  defId: string;
  hp: number;
  maxHp: number;
  atk: number;
  boss?: boolean;
}

export interface GameState {
  name: string;
  realm: number; // REALMS 下标
  stage: number; // 1 起
  spirit: number; // 当前灵力
  stones: number; // 灵石（宗门资源）
  methodId: string; // 当前功法
  missionIdx: number; // MISSIONS 推进下标（下一条待领任务）
  rank: string; // 宗门身份
  days: number; // 游戏内天数（1 现实秒 = 1 息 ≈ 1 天）
  karma: number; // 因果
  lowKey: number; // 低调值 0-100
  injuredUntil: number; // 重伤状态截止（真实时间戳 ms）
  meditateUntil: number; // 入定状态截止（真实时间戳 ms）
  hp: number; // 当前气血
  inv: Record<string, number>; // 物品背包
  armorTurns: number; // 灵甲符剩余减伤回合
  bellActive: boolean; // 金钟罩：本回合减伤
  enemy: EnemyState | null; // 战斗中敌人
  dungeon: { room: number; total: number } | null; // 秘境进度
  dungeonClears: number; // 秘境通关次数
  loc: string; // 当前所在地图节点（MAP_NODES id）
  alch: { pillId: string; until: number } | null; // 丹炉：正在炼制的丹 + 完成时间戳（ms）
  gatherUntil: number; // 凝气丹修炼加速截止（ms）
  gatherMul: number; // 凝气丹加速倍率（0=无）
  breakPillStacks: number; // 破境丹层数（0-3，大突破时消耗）
  tower: { floor: number } | null; // 镇岳塔本次登塔进度（null=不在塔内）
  towerBest: number; // 镇岳塔历史最高层
  logs: LogEntry[];
  lastSave: number;
  created: number;
}

const SAVE_KEY = "fanren_xiuxian_save_v1";
const OFFLINE_CAP_SEC = 8 * 3600; // 离线最多结算 8 小时
const OFFLINE_RATE = 0.5; // 离线五成速度
export const MEDITATE_MUL = 2.5; // 入定速度倍率
export const STONE_TO_SPIRIT = 10; // 1 灵石抵 10 灵力
const INJURE_SEC = 180; // 重伤时长
const DUNGEON_MIN_STAGE = 3; // 秘境要求：本境界第 3 小境

export function stageLabel(realm: number, stage: number): string {
  const r = REALMS[realm];
  if (r.id === "lianqi") return `练气期 ${CN_NUM[stage - 1]}层`;
  if (r.stages === 1) return `${r.name}期`;
  return `${r.name}·${SUB4[stage - 1]}`;
}

export function methodOf(s: GameState): MethodDef {
  return METHODS.find((m) => m.id === s.methodId) ?? METHODS[0];
}

export function speedOf(s: GameState): number {
  const r = REALMS[s.realm];
  const m = methodOf(s);
  let v = r.speed * (1 + 0.12 * (s.stage - 1)) * m.speedMul;
  if (Date.now() < s.meditateUntil) v *= MEDITATE_MUL;
  if (Date.now() < s.gatherUntil && s.gatherMul > 0) v *= 1 + s.gatherMul; // 凝气丹
  if (Date.now() < s.injuredUntil) v *= 0.5;
  const node = currentNode(s);
  if (node?.speedBonus) v *= 1 + node.speedBonus; // 宝地加成
  return v;
}

// 气血 / 攻击：随境界与小境界成长
export function maxHpOf(s: GameState): number {
  const r = REALMS[s.realm];
  return Math.round((100 + 10 * (s.realm + 1)) * r.speed * (1 + 0.15 * (s.stage - 1)));
}

// ===== M2.5：场景地图 =====

// 当前所在节点（找不到回退出生地）
export function currentNode(s: GameState): MapNodeDef {
  return MAP_NODES.find((n) => n.id === s.loc) ?? MAP_NODES.find((n) => n.id === MAP_HOME)!;
}

// 可直达的相邻节点（含解锁状态）
export function adjacentNodes(s: GameState): MapNodeDef[] {
  const cur = currentNode(s);
  return cur.links
    .map((id) => MAP_NODES.find((n) => n.id === id))
    .filter((n): n is MapNodeDef => !!n);
}

export function nodeUnlocked(n: MapNodeDef, s: GameState): boolean {
  return s.realm >= n.minRealm;
}

export function nodeLockText(n: MapNodeDef, s: GameState): string {
  return `需${REALMS[n.minRealm].name}期方可前往`;
}

// 移动：只能去相邻且已解锁的地点；战斗中不可
export function moveTo(s: GameState, id: string): void {
  if (s.enemy) {
    pushLog(s, "生死搏杀之中，走不开身。", "info");
    return;
  }
  if (s.dungeon) {
    pushLog(s, "身在" + DUNGEON.name + "之内，脱身方可远行。", "info");
    return;
  }
  const target = MAP_NODES.find((n) => n.id === id);
  if (!target) return;
  const cur = currentNode(s);
  if (!cur.links.includes(id)) {
    pushLog(s, "两地方隔山海，须循路而至。", "info");
    return;
  }
  if (!nodeUnlocked(target, s)) {
    pushLog(s, `${target.name}气息森然，境界不足，未敢贸然踏入。`, "info");
    return;
  }
  s.loc = id;
  pushLog(s, `移步【${target.name}】：${target.desc}`, "info");
  // 踏入野外：立刻可能遭遇
  if (target.kind === "wild" && target.encounter) {
    tryWildEncounter(s, target);
  }
  save(s);
}

// 野外遭遇：按概率结算（moveTo 踏入时 dtSec=1；tick 每秒传实际秒数）
export function tryWildEncounter(s: GameState, node?: MapNodeDef, dtSec = 1): void {
  if (s.enemy || s.dungeon || s.tower) return;
  const nd = node ?? currentNode(s);
  if (nd.kind !== "wild" || !nd.encounter) return;
  if (Math.random() >= nd.encounter * dtSec) return;
  const pool = nd.enemies
    ? ENEMIES.filter((e) => nd.enemies!.includes(e.id) && e.realms.includes(s.realm))
    : [];
  const def = pool.length ? pool[rnd(0, pool.length - 1)] : ENEMIES[0];
  spawnEnemy(s, def);
  pushLog(s, `${nd.name}中突起杀机——${def.flavor} 是【${def.name}】！`, def.boss ? "break" : "bad");
  save(s);
}

export function atkOf(s: GameState): number {
  return Math.round(maxHpOf(s) * 0.3);
}

export function enemyOf(s: GameState): EnemyDef | null {
  if (!s.enemy) return null;
  // 镇岳塔：动态按层合成的凶物
  if (s.enemy.defId.startsWith("tower:")) return towerEnemyAt(parseInt(s.enemy.defId.slice(6), 10));
  return ENEMIES.find((e) => e.id === s.enemy!.defId) ?? null;
}

// 下一级所需灵力：境内存级差 1.6 倍；冲入下一大境界 = 下一境界 baseCost × 4
export function nextCost(s: GameState): number {
  const r = REALMS[s.realm];
  if (s.stage < r.stages) {
    return Math.round(r.baseCost * Math.pow(1.6, s.stage - 1));
  }
  const nxt = REALMS[s.realm + 1];
  if (!nxt) return 0; // 化神：此界尽头
  const special: Record<string, number> = { huashen: 300000 }; // 元婴→化神
  return special[nxt.id] ?? nxt.baseCost * 4;
}

export function currentMission(s: GameState) {
  return s.missionIdx < MISSIONS.length ? MISSIONS[s.missionIdx] : null;
}

export function pushLog(s: GameState, text: string, kind: LogEntry["kind"] = "info"): void {
  s.logs.push({ t: Date.now(), text, kind });
  if (s.logs.length > 200) s.logs.splice(0, s.logs.length - 200);
}

// 领取已完成的任务（境界达标后调用）
export function checkMissions(s: GameState): void {
  let changed = false;
  while (s.missionIdx < MISSIONS.length) {
    const m = MISSIONS[s.missionIdx];
    if (s.realm > m.realm || (s.realm === m.realm && s.stage >= m.stage)) {
      s.missionIdx += 1;
      s.stones += m.stones;
      if (m.spirit) s.spirit += m.spirit;
      if (m.method && m.method !== s.methodId) {
        s.methodId = m.method;
        const md = METHODS.find((x) => x.id === m.method);
        pushLog(s, `宗门功法阁秘授新功法【${md?.name ?? m.method}】！`, "good");
      }
      if (m.rank) {
        s.rank = m.rank;
        pushLog(s, `宗门大比夺魁，晋升为七玄门·${m.rank}！`, "break");
      }
      pushLog(s, `任务【${m.name}】完成：灵石 +${m.stones}${m.spirit ? `，灵力 +${m.spirit}` : ""}。`, "good");
      changed = true;
    } else {
      break;
    }
  }
  if (changed) save(s);
}

export function newGame(): GameState {
  const s: GameState = {
    name: "韩立",
    realm: 0,
    stage: 1,
    spirit: 0,
    stones: 50,
    methodId: "basic",
    missionIdx: 0,
    rank: "外门弟子",
    days: 0,
    karma: 0,
    lowKey: 60,
    injuredUntil: 0,
    meditateUntil: 0,
    hp: 0,
    inv: {},
    armorTurns: 0,
    bellActive: false,
    enemy: null,
    dungeon: null,
    dungeonClears: 0,
    loc: MAP_HOME,
    alch: null,
    gatherUntil: 0,
    gatherMul: 0,
    breakPillStacks: 0,
    tower: null,
    towerBest: 0,
    logs: [],
    lastSave: Date.now(),
    created: Date.now(),
  };
  s.hp = maxHpOf(s);
  pushLog(s, "七玄门外门弟子韩立，自此踏上修仙之路。", "info");
  pushLog(s, "灵气入体，修炼开始：每息自动积累灵力，攒够即可突破。", "info");
  pushLog(s, "身在七玄门，可于下方地图移步各景：野外猎敌、宝地加速、秘境寻宝。", "info");
  return s;
}

export function save(s: GameState): void {
  s.lastSave = Date.now();
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(s));
  } catch {
    /* 存储不可用时忽略 */
  }
}

export function load(): GameState {
  let raw: string | null = null;
  try {
    raw = localStorage.getItem(SAVE_KEY);
  } catch {
    return newGame();
  }
  if (!raw) return newGame();

  let s: GameState;
  try {
    // 以 newGame() 为底，兼容旧存档缺少的字段
    s = { ...newGame(), ...(JSON.parse(raw) as Partial<GameState>) };
  } catch {
    return newGame();
  }
  if (!s.inv) s.inv = {};
  if (s.hp <= 0) s.hp = maxHpOf(s);

  const dt = Math.min(Math.max((Date.now() - s.lastSave) / 1000, 0), OFFLINE_CAP_SEC);
  if (dt > 5) {
    const gain = Math.round(speedOf(s) * dt * OFFLINE_RATE);
    s.spirit += gain;
    s.days += Math.floor(dt);
    // 离线疗伤：气血缓慢恢复（30% 每秒，上限满值）
    s.hp = Math.min(maxHpOf(s), s.hp + Math.floor(dt * maxHpOf(s) * 0.003));
    pushLog(s, `闭关 ${Math.floor(dt).toLocaleString()} 日（离线按五成速度），得灵力 ${gain.toLocaleString()}。`, "info");
    checkMissions(s);
  }
  // 离线期间丹炉若已毕，回档即结算
  if (s.alch && Date.now() >= s.alch.until) resolveBrew(s);
  s.lastSave = Date.now();
  return s;
}

export function tick(s: GameState, dtSec: number): void {
  s.spirit += speedOf(s) * dtSec;
  s.days += dtSec;
  // 缓慢回气（满 10 秒回 1% 气血）
  s.hp = Math.min(maxHpOf(s), s.hp + (maxHpOf(s) / 10) * (dtSec / 10));
  // 丹炉推进
  if (s.alch && Date.now() >= s.alch.until) resolveBrew(s);
  // 野外：每秒按概率遭遇
  tryWildEncounter(s, undefined, dtSec);
}

// 修炼 / 突破
export function act(s: GameState): void {
  const cost = nextCost(s);
  if (s.spirit < cost) {
    pushLog(s, "灵力不足，静待积累。", "info");
    return;
  }
  s.spirit -= cost;
  const r = REALMS[s.realm];
  const m = methodOf(s);

  if (s.stage < r.stages) {
    s.stage += 1;
    s.hp = maxHpOf(s); // 突破后气血全满
    pushLog(s, `功法精进，突破至【${stageLabel(s.realm, s.stage)}】！`, "good");
  } else {
    let chance = Math.min(0.95, r.breakChance + m.breakBonus);
    let pillBonus = 0;
    if (s.breakPillStacks > 0) {
      const pill = PILLS.find((p) => p.effect === "break");
      pillBonus = Math.min(s.breakPillStacks, 3) * (pill?.breakBonus ?? 0);
      chance = Math.min(0.98, chance + pillBonus);
      s.breakPillStacks -= 1; // 每次大突破消耗一层
    }
    const roll = Math.random();
    const nxt = REALMS[s.realm + 1];
    if (roll < chance) {
      s.realm += 1;
      s.stage = 1;
      s.hp = maxHpOf(s);
      s.lowKey = Math.min(100, s.lowKey + 5);
      pushLog(s, `天劫已过，雷云散尽——恭喜突破至【${stageLabel(s.realm, s.stage)}】！${pillBonus ? `（破境丹助功 +${Math.round(pillBonus * 100)}%）` : ""}寿元再增，低调值 +5。`, "break");
    } else {
      const grave = Math.random() < 0.2;
      s.injuredUntil = Date.now() + INJURE_SEC * 1000;
      s.spirit = Math.floor(s.spirit * (grave ? 0.2 : 0.5));
      pushLog(
        s,
        grave
          ? `冲击${nxt ? nxt.name : ""}失败，天劫轰落、经脉俱损，跌入重伤！灵力大损，闭关疗伤中……`
          : `冲击${nxt ? nxt.name : ""}失败，走火入魔，灵力折半，闭关疗伤中……`,
        "bad",
      );
    }
  }
  checkMissions(s);
  save(s);
}

// 入定：指定时长内修炼速度 ×2.5（时长由 UI 选择）
export function meditate(s: GameState, sec: number): void {
  if (s.enemy) {
    pushLog(s, "生死搏杀之中，无暇入定。", "info");
    return;
  }
  if (Date.now() < s.meditateUntil) return; // 已在入定，不重置
  const dur = Math.max(1, Math.min(60, Math.floor(sec)));
  s.meditateUntil = Date.now() + dur * 1000;
  pushLog(s, `屏息凝神，进入入定状态：${dur}息之内，修炼速度 ×2.5。`, "info");
  save(s);
}

// 灵石抵灵力：1 灵石 = 10 灵力（按指定数量兑换）
export function stoneToSpirit(s: GameState, n: number): void {
  if (s.stones <= 0) {
    pushLog(s, "囊中无石，无可兑换。", "info");
    return;
  }
  const num = Math.max(1, Math.min(Math.floor(n), s.stones));
  const gain = num * STONE_TO_SPIRIT;
  s.stones -= num;
  s.spirit += gain;
  pushLog(s, `将 ${num.toLocaleString()} 枚灵石融入灵台，灵力 +${gain.toLocaleString()}。`, "good");
  save(s);
}

// ===== M3：炼丹（药材 → 丹方 → 成功率 → 丹药）=====

export function herbDef(id: string): HerbDef | undefined {
  return HERBS.find((h) => h.id === id);
}
export function pillDef(id: string): PillDef | undefined {
  return PILLS.find((p) => p.id === id);
}
export function alchProgress(s: GameState): { pct: number; left: number } {
  if (!s.alch) return { pct: 0, left: 0 };
  const p = pillDef(s.alch.pillId);
  const total = (p?.brewSec ?? 1) * 1000;
  const done = Math.min(Math.max(Date.now() - (s.alch.until - total), 0), total);
  return { pct: total > 0 ? (done / total) * 100 : 100, left: Math.max(0, Math.ceil((s.alch.until - Date.now()) / 1000)) };
}

// 投炉炼丹：扣材料，计时开始（离线也推进，回档即结算）
export function startBrew(s: GameState, pillId: string): void {
  if (s.alch) {
    pushLog(s, "丹炉已有一炉在炼，须待其毕。", "info");
    return;
  }
  const p = pillDef(pillId);
  if (!p) return;
  for (const [hid, n] of Object.entries(p.recipe)) {
    if ((s.inv[hid] ?? 0) < n) {
      pushLog(s, `药材不足：【${herbDef(hid)?.name ?? hid}】需 ${n}，现 ${s.inv[hid] ?? 0}。`, "info");
      return;
    }
  }
  for (const [hid, n] of Object.entries(p.recipe)) {
    s.inv[hid] -= n;
    if (s.inv[hid] <= 0) delete s.inv[hid];
  }
  s.alch = { pillId, until: Date.now() + p.brewSec * 1000 };
  pushLog(s, `炉火点燃，炼制【${p.name}】：约 ${p.brewSec} 息，成算 ${Math.round(p.chance * 100)}%。`, "info");
  save(s);
}

// 丹毕结算：成功得丹；失败炸炉，未用材料折损
function resolveBrew(s: GameState): void {
  const a = s.alch;
  if (!a) return;
  s.alch = null;
  const p = pillDef(a.pillId);
  if (!p) return;
  if (Math.random() < p.chance) {
    s.inv[p.id] = (s.inv[p.id] ?? 0) + 1;
    pushLog(s, `丹炉轻响，【${p.name}】炼成！`, "good");
  } else {
    // 炸炉：有概率挽回 1 份材料
    if (Math.random() < 0.5) {
      const hids = Object.keys(p.recipe);
      const h = hids[rnd(0, hids.length - 1)];
      s.inv[h] = (s.inv[h] ?? 0) + 1;
      pushLog(s, `丹炉炸裂，烟气呛人——【${p.name}】炼制失败，幸而捞回【${herbDef(h)?.name ?? h}】1 份。`, "bad");
    } else {
      pushLog(s, `丹炉炸裂，烟气呛人——【${p.name}】炼制失败，材料尽焚。`, "bad");
    }
  }
  save(s);
}

// 采买药材
export function buyHerb(s: GameState, id: string): void {
  if (s.enemy) {
    pushLog(s, "战斗中无法采买。", "info");
    return;
  }
  const h = herbDef(id);
  if (!h) return;
  if (s.stones < h.price) {
    pushLog(s, `灵石不足（需 ${h.price}）。`, "info");
    return;
  }
  s.stones -= h.price;
  s.inv[id] = (s.inv[id] ?? 0) + 1;
  pushLog(s, `购得【${h.name}】×1（灵石 -${h.price}）。`, "info");
  save(s);
}

// ===== M2：物品 =====

export function itemDef(id: string): ItemDef | undefined {
  return ITEMS.find((i) => i.id === id);
}

// 购买物品
export function buyItem(s: GameState, id: string): void {
  if (s.enemy) {
    pushLog(s, "战斗中无法采买。", "info");
    return;
  }
  const it = itemDef(id);
  if (!it) return;
  if (s.stones < it.price) {
    pushLog(s, `灵石不足（需 ${it.price}）。`, "info");
    return;
  }
  s.stones -= it.price;
  s.inv[id] = (s.inv[id] ?? 0) + 1;
  pushLog(s, `购得【${it.name}】×1（灵石 -${it.price}）。`, "info");
  save(s);
}

// 使用物品：战斗外可用回灵丹/聚灵丹；灵甲符仅战斗中生效；炼制的丹药按丹方效果
export function useItem(s: GameState, id: string): void {
  const it = itemDef(id);
  const pill = PILLS.find((p) => p.id === id);
  if ((!it && !pill) || !s.inv[id]) return;
  if (it?.combatOnly) {
    if (!s.enemy) {
      pushLog(s, "灵甲符需面对敌人时方可祭出。", "info");
      return;
    }
    s.armorTurns += it.blockTurns ?? 1;
  }
  if (it?.healPct) {
    const heal = Math.round(maxHpOf(s) * it.healPct);
    s.hp = Math.min(maxHpOf(s), s.hp + heal);
    pushLog(s, `服下【${it.name}】，气血 +${heal.toLocaleString()}。`, "good");
  }
  if (it?.spirit) {
    const gain = Math.round(maxHpOf(s) * it.spirit);
    s.spirit += gain;
    pushLog(s, `炼化【${it.name}】，灵力 +${gain.toLocaleString()}。`, "good");
  }
  // M3：炼制的丹药（回春/聚气/破境/凝气）
  if (pill) {
    if (pill.effect === "heal" && pill.healPct) {
      const heal = Math.round(maxHpOf(s) * pill.healPct);
      s.hp = Math.min(maxHpOf(s), s.hp + heal);
      pushLog(s, `服下【${pill.name}】，气血 +${heal.toLocaleString()}。`, "good");
    } else if (pill.effect === "spirit" && pill.spiritMul) {
      const gain = Math.round(maxHpOf(s) * pill.spiritMul);
      s.spirit += gain;
      pushLog(s, `炼化【${pill.name}】，灵力 +${gain.toLocaleString()}。`, "good");
    } else if (pill.effect === "break") {
      if (s.breakPillStacks >= 3) {
        pushLog(s, "丹力已满（3 层），破境丹须待下次突破后再服。", "info");
        return;
      }
      s.breakPillStacks += 1;
      pushLog(s, `服下【${pill.name}】，丹力入体——下次大境界突破成功率 +${Math.round((pill.breakBonus ?? 0) * 100)}%（已叠 ${s.breakPillStacks} 层）。`, "good");
    } else if (pill.effect === "gather" && pill.gatherMul && pill.gatherSec) {
      s.gatherUntil = Date.now() + pill.gatherSec * 1000;
      s.gatherMul = pill.gatherMul;
      pushLog(s, `运起【${pill.name}】药力，${pill.gatherSec}息内修炼速度 +${Math.round(pill.gatherMul * 100)}%。`, "good");
    }
  }
  s.inv[id] -= 1;
  if (s.inv[id] <= 0) delete s.inv[id];
  save(s);
}

// ===== M2：战斗 =====

export function spawnEnemy(s: GameState, def: EnemyDef, bossOverride?: boolean): void {
  const hp = Math.round(maxHpOf(s) * def.hpMul);
  s.enemy = { defId: def.id, hp, maxHp: hp, atk: Math.round(maxHpOf(s) * def.atkMul), boss: bossOverride ?? def.boss };
}

function rnd(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

// 释放法术
export function castSpell(s: GameState, id: string): void {
  if (!s.enemy) return;
  const sp = SPELLS.find((x) => x.id === id) as SpellDef | undefined;
  if (!sp) return;
  if (s.realm < sp.realm || s.spirit < sp.cost) {
    pushLog(s, s.realm < sp.realm ? `境界不足，尚无法催动【${sp.name}】。` : `灵力不足，难以催动【${sp.name}】。`, "info");
    return;
  }
  s.spirit -= sp.cost;
  const e = s.enemy;
  const edef = enemyOf(s)!;

  if (sp.mul > 0) {
    let dmg = Math.round(atkOf(s) * sp.mul * (0.9 + Math.random() * 0.2));
    let crit = false;
    if (sp.crit && Math.random() < sp.crit) {
      dmg = Math.round(dmg * (sp.critMul ?? 2));
      crit = true;
    }
    e.hp -= dmg;
    pushLog(s, `使出【${sp.name}】，${crit ? "会心一击！" : ""}对${edef.name}造成 ${dmg} 伤害。`, crit ? "break" : "info");
  } else if (sp.healPct) {
    const heal = Math.round(maxHpOf(s) * sp.healPct);
    s.hp = Math.min(maxHpOf(s), s.hp + heal);
    pushLog(s, `运起【${sp.name}】，气血 +${heal.toLocaleString()}。`, "good");
  } else if (sp.block) {
    s.bellActive = true;
    pushLog(s, `布下【${sp.name}】，本回合所受伤害 -${Math.round((sp.block ?? 0) * 100)}%。`, "info");
  }

  if (e.hp <= 0) {
    winFight(s, edef);
    return;
  }
  enemyTurn(s, edef);
  save(s);
}

// 敌人回合
function enemyTurn(s: GameState, edef: EnemyDef): void {
  if (!s.enemy) return;
  let dmg = Math.round(s.enemy.atk * (0.85 + Math.random() * 0.3));
  if (s.bellActive) {
    dmg = Math.round(dmg * 0.4);
    s.bellActive = false;
    pushLog(s, "【金钟罩】金芒迸射，硬撼敌招！", "good");
  }
  if (s.armorTurns > 0) {
    dmg = Math.round(dmg * 0.5);
    s.armorTurns -= 1;
    pushLog(s, `【灵甲符】金光护体，抵挡了部分伤害。`, "info");
  }
  s.hp -= dmg;
  pushLog(s, `${edef.name}反击，你受到 ${dmg} 伤害。`, "bad");
  if (s.hp <= 0) loseFight(s, edef);
}

// 战胜
function winFight(s: GameState, edef: EnemyDef): void {
  const e = s.enemy!;
  s.enemy = null;
  const mul = 1 + (currentNode(s).dropMul ?? 0) + s.realm; // 地点越险，掉落越多
  const stoneGain = rnd(edef.stones[0], edef.stones[1]) * mul;
  const spiritGain = Math.round(e.maxHp * 0.6);
  s.stones += stoneGain;
  s.spirit += spiritGain;
  // 战后吐纳调息：恢复部分气血
  const rest = Math.round(maxHpOf(s) * 0.28);
  s.hp = Math.min(maxHpOf(s), s.hp + rest);
  if (edef.boss) s.karma += 1;
  pushLog(s, `斩敌【${edef.name}】！获灵石 ${stoneGain}，灵力 +${spiritGain.toLocaleString()}，调息气血 +${rest}。`, "good");
  if (Math.random() < edef.itemChance) {
    const drop = ITEMS[rnd(0, ITEMS.length - 1)];
    s.inv[drop.id] = (s.inv[drop.id] ?? 0) + 1;
    pushLog(s, `敌尸中翻出【${drop.name}】×1。`, "good");
  }
  // M3：药材掉落（危险地掉得更多）
  const hMul = 1 + (currentNode(s).dropMul ?? 0) * 0.5;
  for (const h of HERBS) {
    if (Math.random() < h.drop * hMul) {
      s.inv[h.id] = (s.inv[h.id] ?? 0) + 1;
      pushLog(s, `拾得药材【${h.name}】×1。`, "good");
    }
  }
  // 秘境：进入下一房
  if (s.dungeon) {
    s.dungeon.room += 1;
    if (s.dungeon.room >= s.dungeon.total) {
      const bonus = 100 * (1 + s.realm);
      s.stones += bonus;
      s.dungeonClears += 1;
      pushLog(s, `洞府深处一座石殿豁然开朗——通关！额外获得灵石 ${bonus}。`, "break");
      s.dungeon = null;
      s.armorTurns = 0;
      s.bellActive = false;
    } else {
      enterRoom(s, s.dungeon.room);
    }
  } else if (s.tower) {
    towerAdvance(s);
  } else {
    s.armorTurns = 0;
    s.bellActive = false;
  }
  checkMissions(s);
  save(s);
}

// 战败
function loseFight(s: GameState, edef: EnemyDef): void {
  s.enemy = null;
  s.hp = Math.round(maxHpOf(s) * 0.5);
  s.injuredUntil = Date.now() + INJURE_SEC * 1000;
  const lost = Math.floor(s.stones * 0.25);
  s.stones -= lost;
  s.armorTurns = 0;
  s.bellActive = false;
  pushLog(
    s,
    `不敌${edef.name}，重伤倒地！幸有同门相救，丢灵石 ${lost}，气血半空，闭关疗伤。`,
    "bad",
  );
  // 秘境中断
  if (s.dungeon) {
    pushLog(s, "仓皇退出" + DUNGEON.name + "，洞府之门在身后闭合……", "bad");
    s.dungeon = null;
  }
  // 镇岳塔：被击落出塔，保留最高层
  if (s.tower) {
    pushLog(s, `煞气将你震出【${TOWER.name}】，只攀至第 ${s.tower.floor} 层，最高层记录 ${s.towerBest}。`, "bad");
    s.tower = null;
  }
  save(s);
}

// ===== M3：镇岳塔（七玄门后山老塔，无限层）=====

// 按层合成凶物：普通层 / 镇守（精英）。基准仍是玩家气血，故境界上去了才攻得动高层
export function towerEnemyAt(floor: number): EnemyDef {
  const elite = floor % TOWER.eliteEvery === 0;
  const hpMul =
    (TOWER.hpBase + TOWER.hpPerFloor * (floor - 1)) * (elite ? TOWER.eliteHpMul : 1);
  const atkMul =
    (TOWER.atkBase + TOWER.atkPerFloor * (floor - 1)) * (elite ? TOWER.eliteAtkMul : 1);
  const lo = TOWER.stoneBase + TOWER.stonePerFloor * (floor - 1);
  const hi = Math.round(lo * 1.5) + (elite ? lo : 0);
  const name = elite ? TOWER_ELITES[(floor / TOWER.eliteEvery - 1) % TOWER_ELITES.length] : TOWER_MOBS[(floor - 1) % TOWER_MOBS.length];
  const flavor = elite
    ? `第 ${floor} 层【镇守】现世：${name}盘踞层关，煞气冲霄！`
    : `第 ${floor} 层：${name}自墙缝中渗出，煞意森森。`;
  return {
    id: `tower:${floor}`,
    name: elite ? `镇守·${name}` : name,
    hpMul,
    atkMul,
    stones: [Math.round(lo), Math.round(hi)],
    itemChance: 0.15 + (floor % 5) * 0.03,
    realms: [],
    boss: elite,
    flavor,
  };
}

export function enterTower(s: GameState): void {
  if (s.enemy || s.tower || s.dungeon) return;
  if (s.stones < TOWER.fee) {
    pushLog(s, `灵石不足（需 ${TOWER.fee} 作登塔香钱）。`, "info");
    return;
  }
  s.stones -= TOWER.fee;
  s.tower = { floor: 1 };
  pushLog(s, `踏入门内铜阶，【${TOWER.name}】层层煞气自下而上涌来。第 1 层，凶物现身。`, "break");
  spawnEnemy(s, towerEnemyAt(1));
  save(s);
}

// 胜一层：记录最高层；里程碑层（每 10 层）给大赏并给下一层入口
function towerAdvance(s: GameState): void {
  if (!s.tower) return;
  const floor = s.tower.floor;
  if (floor > s.towerBest) s.towerBest = floor;
  // 里程碑层关：额外灵石 + 回气
  if (floor % TOWER.milestoneEvery === 0) {
    const bonus = (TOWER.stoneBase + TOWER.stonePerFloor * floor) * 4;
    s.stones += bonus;
    s.hp = Math.min(maxHpOf(s), s.hp + Math.round(maxHpOf(s) * 0.4));
    pushLog(s, `第 ${floor} 层【层关】破！得赏灵石 ${bonus}，吐纳回气，可继续登塔。`, "break");
  }
  s.tower.floor += 1;
  spawnEnemy(s, towerEnemyAt(s.tower.floor));
  save(s);
}

// ===== M2：秘境探索（启元洞府） =====

// 房序：敌/宝/敌/祸/敌/Boss
const ROOM_KINDS = ["enemy", "treasure", "enemy", "hazard", "boss"] as const;
type RoomKind = (typeof ROOM_KINDS)[number];

export function dungeonOpen(s: GameState): boolean {
  return s.stage >= DUNGEON_MIN_STAGE;
}

export function enterDungeon(s: GameState): void {
  if (s.enemy || s.dungeon) return;
  if (!dungeonOpen(s)) {
    pushLog(s, `需修至本境界第 ${CN_NUM[DUNGEON_MIN_STAGE - 1]} 小境，方可进入${DUNGEON.name}。`, "info");
    return;
  }
  if (s.stones < DUNGEON.fee) {
    pushLog(s, `灵石不足（需 ${DUNGEON.fee} 作为引路灯油）。`, "info");
    return;
  }
  s.stones -= DUNGEON.fee;
  s.dungeon = { room: 0, total: DUNGEON.rooms };
  pushLog(s, `提灯步入【${DUNGEON.name}】，共 ${DUNGEON.rooms} 重洞府，末重必有大敌。`, "break");
  enterRoom(s, 0);
  save(s);
}

function pickEnemy(s: GameState, boss: boolean): EnemyDef {
  const pool = ENEMIES.filter((e) => e.realms.includes(s.realm) && !!e.boss === boss);
  if (!pool.length) return boss ? ENEMIES[6] : ENEMIES[0];
  return pool[rnd(0, pool.length - 1)];
}

function enterRoom(s: GameState, room: number): void {
  if (!s.dungeon) return;
  const kind = ROOM_KINDS[room] ?? "enemy";
  if (kind === "treasure") {
    const gain = rnd(30, 80) * (1 + s.realm);
    s.stones += gain;
    pushLog(s, `第 ${room + 1} 房：石壁暗格中藏着一袋灵石 +${gain}。`, "good");
    advanceRoom(s);
  } else if (kind === "hazard") {
    const roll = Math.random();
    if (roll < 0.5) {
      const dmg = Math.round(maxHpOf(s) * 0.25);
      s.hp = Math.max(1, s.hp - dmg);
      pushLog(s, `第 ${room + 1} 房：脚下机关骤发，毒针扫来，气血 -${dmg}。`, "bad");
    } else {
      const gain = Math.round(maxHpOf(s) * 0.5);
      s.hp = Math.min(maxHpOf(s), s.hp + gain);
      pushLog(s, `第 ${room + 1} 房：一池灵泉汩汩而流，气血 +${gain.toLocaleString()}。`, "good");
    }
    advanceRoom(s);
  } else {
    const boss = kind === "boss";
    const def = pickEnemy(s, boss);
    spawnEnemy(s, def);
    pushLog(
      s,
      `第 ${room + 1} 房${boss ? "【领主】" : ""}：${def.flavor}${boss ? ` 是【${def.name}】！` : ""}`,
      boss ? "break" : "info",
    );
  }
}

// 非战斗房（宝藏/祸）前进一房；末房兜底
function advanceRoom(s: GameState): void {
  if (!s.dungeon) return;
  s.dungeon.room += 1;
  if (s.dungeon.room >= s.dungeon.total) {
    // 理论上末房必为 boss 触发 winFight 清场，此为兜底
    s.dungeon = null;
    s.armorTurns = 0;
    s.bellActive = false;
  } else {
    enterRoom(s, s.dungeon.room);
  }
}

// 撤退：战斗中认怂。放弃当前秘境（若在内），不掉落灵石，仅受小伤。
// 凡人保命第一——打不过就跑，这不是耻辱。
export function retreat(s: GameState): void {
  if (!s.enemy) return;
  const dmg = Math.round(maxHpOf(s) * 0.1);
  s.enemy = null;
  s.hp = Math.max(1, s.hp - dmg);
  s.armorTurns = 0;
  s.bellActive = false;
  pushLog(s, `咬破舌尖强行脱身，弃了这场争斗（气血 -${dmg}）。保命要紧，来日方长。`, "info");
  if (s.dungeon) {
    pushLog(s, "你遁出" + DUNGEON.name + "，石门在身后无声闭合。", "info");
    s.dungeon = null;
  }
  if (s.tower) {
    if (s.tower.floor > s.towerBest) s.towerBest = s.tower.floor;
    pushLog(s, `你扶着铜阶退回【${TOWER.name}】塔底，本次攀至第 ${s.tower.floor} 层，最高层 ${s.towerBest}。`, "info");
    s.tower = null;
  }
  save(s);
}

export function resetGame(): GameState {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
  const s = newGame();
  pushLog(s, "前尘往事如大梦一场。转世重修，再入七玄门。", "break");
  save(s);
  return s;
}