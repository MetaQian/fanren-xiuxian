import { METHODS, MISSIONS, type MethodDef, CN_NUM, REALMS, SUB4 } from "./data";

export interface LogEntry {
  t: number;
  text: string;
  kind: "info" | "good" | "bad" | "break";
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
    stones: 0,
    methodId: "basic",
    missionIdx: 0,
    rank: "外门弟子",
    days: 0,
    karma: 0,
    lowKey: 60,
    injuredUntil: 0,
    meditateUntil: 0,
    logs: [],
    lastSave: Date.now(),
    created: Date.now(),
  };
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

  const dt = Math.min(Math.max((Date.now() - s.lastSave) / 1000, 0), OFFLINE_CAP_SEC);
  if (dt > 5) {
    const gain = Math.round(speedOf(s) * dt * OFFLINE_RATE);
    s.spirit += gain;
    s.days += Math.floor(dt);
    pushLog(s, `闭关 ${Math.floor(dt).toLocaleString()} 日（离线按五成速度），得灵力 ${gain.toLocaleString()}。`, "info");
    checkMissions(s);
  }
  s.lastSave = Date.now();
  return s;
}

export function tick(s: GameState, dtSec: number): void {
  s.spirit += speedOf(s) * dtSec;
  s.days += dtSec;
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
    pushLog(s, `功法精进，突破至【${stageLabel(s.realm, s.stage)}】！`, "good");
  } else {
    const chance = Math.min(0.95, r.breakChance + m.breakBonus);
    const roll = Math.random();
    const nxt = REALMS[s.realm + 1];
    if (roll < chance) {
      s.realm += 1;
      s.stage = 1;
      s.lowKey = Math.min(100, s.lowKey + 5);
      pushLog(s, `天劫已过，雷云散尽——恭喜突破至【${stageLabel(s.realm, s.stage)}】！寿元再增，低调值 +5。`, "break");
    } else {
      const grave = Math.random() < 0.2;
      s.injuredUntil = Date.now() + (grave ? 180 : 60) * 1000;
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