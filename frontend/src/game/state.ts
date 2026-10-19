import { CN_NUM, REALMS, SUB4 } from "./data";

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
  days: number; // 游戏内天数（1 现实秒 = 1 息 ≈ 1 天）
  karma: number; // 因果
  lowKey: number; // 低调值 0-100
  injuredUntil: number; // 重伤状态截止（真实时间戳 ms）
  logs: LogEntry[];
  lastSave: number;
  created: number;
}

const SAVE_KEY = "fanren_xiuxian_save_v1";
const OFFLINE_CAP_SEC = 8 * 3600; // 离线最多结算 8 小时
const OFFLINE_RATE = 0.5; // 离线五成速度

export function stageLabel(realm: number, stage: number): string {
  const r = REALMS[realm];
  if (r.id === "lianqi") return `练气期 ${CN_NUM[stage - 1]}层`;
  if (r.stages === 1) return `${r.name}期`;
  return `${r.name}·${SUB4[stage - 1]}`;
}

export function speedOf(s: GameState): number {
  const r = REALMS[s.realm];
  let v = r.speed * (1 + 0.12 * (s.stage - 1));
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

export function pushLog(s: GameState, text: string, kind: LogEntry["kind"] = "info"): void {
  s.logs.push({ t: Date.now(), text, kind });
  if (s.logs.length > 200) s.logs.splice(0, s.logs.length - 200);
}

export function newGame(): GameState {
  const s: GameState = {
    name: "韩立",
    realm: 0,
    stage: 1,
    spirit: 0,
    days: 0,
    karma: 0,
    lowKey: 60,
    injuredUntil: 0,
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

  if (s.stage < r.stages) {
    s.stage += 1;
    pushLog(s, `功法精进，突破至【${stageLabel(s.realm, s.stage)}】！`, "good");
  } else {
    const roll = Math.random();
    const nxt = REALMS[s.realm + 1];
    if (roll < r.breakChance) {
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