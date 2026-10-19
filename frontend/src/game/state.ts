import {
  DUNGEON,
  ENEMIES,
  ITEMS,
  METHODS,
  MISSIONS,
  SPELLS,
  type EnemyDef,
  type ItemDef,
  type MethodDef,
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
  logs: LogEntry[];
  lastSave: number;
  created: number;
}

const SAVE_KEY = "fanren_xiuxian_save_v1";
const OFFLINE_CAP_SEC = 8 * 3600; // 离线最多结算 8 小时
const OFFLINE_RATE = 0.5; // 离线五成速度
const MEDITATE_SEC = 10; // 入定持续时间
const MEDITATE_MUL = 2.5; // 入定速度倍率
const STONE_TO_SPIRIT = 10; // 1 灵石抵 10 灵力
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
  if (Date.now() < s.injuredUntil) v *= 0.5;
  return v;
}

// 气血 / 攻击：随境界与小境界成长
export function maxHpOf(s: GameState): number {
  const r = REALMS[s.realm];
  return Math.round((100 + 10 * (s.realm + 1)) * r.speed * (1 + 0.15 * (s.stage - 1)));
}

export function atkOf(s: GameState): number {
  return Math.round(maxHpOf(s) * 0.18);
}

export function enemyOf(s: GameState): EnemyDef | null {
  return s.enemy ? ENEMIES.find((e) => e.id === s.enemy!.defId) ?? null : null;
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
    logs: [],
    lastSave: Date.now(),
    created: Date.now(),
  };
  s.hp = maxHpOf(s);
  pushLog(s, "七玄门外门弟子韩立，自此踏上修仙之路。", "info");
  pushLog(s, "灵气入体，修炼开始：每息自动积累灵力，攒够即可突破。", "info");
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
  s.lastSave = Date.now();
  return s;
}

export function tick(s: GameState, dtSec: number): void {
  s.spirit += speedOf(s) * dtSec;
  s.days += dtSec;
  // 缓慢回气（满 10 秒回 1% 气血）
  s.hp = Math.min(maxHpOf(s), s.hp + (maxHpOf(s) / 10) * (dtSec / 10));
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
    const chance = Math.min(0.95, r.breakChance + m.breakBonus);
    const roll = Math.random();
    const nxt = REALMS[s.realm + 1];
    if (roll < chance) {
      s.realm += 1;
      s.stage = 1;
      s.hp = maxHpOf(s);
      s.lowKey = Math.min(100, s.lowKey + 5);
      pushLog(s, `天劫已过，雷云散尽——恭喜突破至【${stageLabel(s.realm, s.stage)}】！寿元再增，低调值 +5。`, "break");
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

// 入定：10 秒内修炼速度 ×2.5
export function meditate(s: GameState): void {
  if (s.enemy) {
    pushLog(s, "生死搏杀之中，无暇入定。", "info");
    return;
  }
  if (Date.now() < s.meditateUntil) return;
  s.meditateUntil = Date.now() + MEDITATE_SEC * 1000;
  pushLog(s, "屏息凝神，进入入定状态：十息之内，修炼速度 ×2.5。", "info");
  save(s);
}

// 灵石抵灵力：1 灵石 = 10 灵力（灵石全换）
export function stoneToSpirit(s: GameState): void {
  if (s.stones <= 0) {
    pushLog(s, "囊中无石，无可兑换。", "info");
    return;
  }
  const n = s.stones;
  const gain = n * STONE_TO_SPIRIT;
  s.stones = 0;
  s.spirit += gain;
  pushLog(s, `将 ${n} 枚灵石融入灵台，灵力 +${gain.toLocaleString()}。`, "good");
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

// 使用物品：战斗外可用回灵丹/聚灵丹；灵甲符仅战斗中生效
export function useItem(s: GameState, id: string): void {
  const it = itemDef(id);
  if (!it || !s.inv[id]) return;
  if (it.combatOnly) {
    if (!s.enemy) {
      pushLog(s, "灵甲符需面对敌人时方可祭出。", "info");
      return;
    }
    s.armorTurns += it.blockTurns ?? 1;
  }
  if (it.healPct) {
    const heal = Math.round(maxHpOf(s) * it.healPct);
    s.hp = Math.min(maxHpOf(s), s.hp + heal);
    pushLog(s, `服下【${it.name}】，气血 +${heal.toLocaleString()}。`, "good");
  }
  if (it.spirit) {
    const gain = Math.round(maxHpOf(s) * it.spirit);
    s.spirit += gain;
    pushLog(s, `炼化【${it.name}】，灵力 +${gain.toLocaleString()}。`, "good");
  }
  s.inv[id] -= 1;
  if (s.inv[id] <= 0) delete s.inv[id];
  save(s);
}

// ===== M2：战斗 =====

export function spawnEnemy(s: GameState, def: EnemyDef): void {
  const hp = Math.round(maxHpOf(s) * def.hpMul);
  s.enemy = { defId: def.id, hp, maxHp: hp, atk: Math.round(atkOf(s) * def.atkMul), boss: def.boss };
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
  const stoneGain = rnd(edef.stones[0], edef.stones[1]) * (1 + s.realm);
  const spiritGain = Math.round(e.maxHp * 0.6);
  s.stones += stoneGain;
  s.spirit += spiritGain;
  if (edef.boss) s.karma += 1;
  pushLog(s, `斩敌【${edef.name}】！获灵石 ${stoneGain}，灵力 +${spiritGain.toLocaleString()}${edef.boss ? "，因果 +1" : ""}。`, "good");
  if (Math.random() < edef.itemChance) {
    const drop = ITEMS[rnd(0, ITEMS.length - 1)];
    s.inv[drop.id] = (s.inv[drop.id] ?? 0) + 1;
    pushLog(s, `敌尸中翻出【${drop.name}】×1。`, "good");
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
  save(s);
}

// ===== M2：秘境探索（启元洞府） =====

// 房序：敌/宝/敌/祸/敌/Boss
const ROOM_KINDS = ["enemy", "treasure", "enemy", "hazard", "enemy", "boss"] as const;
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