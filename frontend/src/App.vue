<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { DUNGEON, ITEMS, HERBS, PILLS, TOWER, PETS, PET_BLOOD, METHODS, MISSIONS, REALMS, SPELLS, MAP_NODES, type MapNodeDef, type HerbDef, type PillDef } from "./game/data";
import {
  type GameState,
  type LogEntry,
  act,
  alchProgress,
  buyHerb,
  buyItem,
  castSpell,
  checkMissions,
  currentMission,
  currentNode,
  dungeonOpen,
  enemyOf,
  enterDungeon,
  enterTower,
  evolvePet,
  hatchPet,
  itemDef,
  load,
  maxHpOf,
  meditate,
  methodOf,
  moveTo,
  nextCost,
  nodeUnlocked,
  nodeLockText,
  petDef,
  retreat,
  resetGame,
  save,
  speedOf,
  stageLabel,
  STONE_TO_SPIRIT,
  MEDITATE_MUL,
  stoneToSpirit,
  startBrew,
  tick,
  useItem,
} from "./game/state";

const s = ref<GameState>(load());

// ===== 浮层提示（toast） =====
interface Toast {
  id: number;
  text: string;
  kind: LogEntry["kind"];
}
const toasts = ref<Toast[]>([]);
let toastId = 0;
let seenLogs = s.value.logs.length; // 只对新日志弹提示

function flushToasts() {
  const logs = s.value.logs;
  if (logs.length > seenLogs) {
    const fresh = logs.slice(seenLogs);
    seenLogs = logs.length;
    for (const l of fresh) {
      const id = ++toastId;
      toasts.value.push({ id, text: l.text, kind: l.kind });
      // 重要事件停留久一些
      const life = l.kind === "break" ? 6000 : 3500;
      window.setTimeout(() => dismissToast(id), life);
    }
    // 最多同屏 4 条，超出最旧的立即沉底
    if (toasts.value.length > 4) toasts.value.splice(0, toasts.value.length - 4);
  }
}
function dismissToast(id: number) {
  toasts.value = toasts.value.filter((t) => t.id !== id);
}
// 首屏只弹"刚产生的"日志（如离线结算，t≈now）；陈旧的（刷新前的入定等）不弹
const lastLog = s.value.logs[s.value.logs.length - 1];
if (lastLog && Date.now() - lastLog.t < 10000) {
  const id = ++toastId;
  toasts.value.push({ id, text: lastLog.text, kind: lastLog.kind });
  window.setTimeout(() => dismissToast(id), 5000);
}

// 修仙史册（独立页面）
const journalOpen = ref(false);
const journalList = computed(() => s.value.logs.slice().reverse());

// ===== 主界面 Tab（一念逍遥式底部栏）=====
// 修炼(主面板+丹炉) / 灵兽(灵兽栏) / 秘境(地图+秘境塔) / 储物(商行) / 宗门(任务+境界之路)
const mainTab = ref<"xiu" | "shou" | "mi" | "cu" | "zong">("xiu");
const TABS = [
  { id: "xiu", name: "修炼", ico: "🧘" },
  { id: "shou", name: "灵兽", ico: "🐾" },
  { id: "mi", name: "秘境", ico: "🗺️" },
  { id: "cu", name: "储物", ico: "👝" },
  { id: "zong", name: "宗门", ico: "🏯" },
] as const;
// 战斗中（立绘与各 Tab 面板让位给战斗整屏）
const inBattle = computed(() => !!(s.value.enemy || s.value.dungeon || s.value.tower));
// 修行者立绘（按境界变化，水墨立像）
const FIGURES = ["🧒", "🧑‍🎓", "🧙", "🧘", "🧚", "⚡", "☁️"];
function figureGlyph() {
  return FIGURES[s.value.realm] ?? "🧑";
}
function fmtTime(t: number) {
  const d = new Date(t);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function doAct() {
  act(s.value);
  flushToasts();
}

function doReset() {
  if (!window.confirm("前尘尽断，转世重修？当前存档将被清除。")) return;
  s.value = resetGame();
  seenLogs = s.value.logs.length; // 清档后不弹旧提示
  flushToasts();
}

const isFinal = () => s.value.realm === REALMS.length - 1;
const isTopStage = () => s.value.stage >= REALMS[s.value.realm].stages;
const cost = () => nextCost(s.value);
const pct = () => {
  const c = cost();
  if (!c) return 100;
  return Math.min(100, (s.value.spirit / c) * 100);
};
const injured = () => Date.now() < s.value.injuredUntil;
const meditating = () => Date.now() < s.value.meditateUntil;

// ===== 入定：时长可调 + 条上预览 =====
const medSec = ref(10); // 选择的入定时长（息）
function medBaseSpeed() {
  const v = speedOf(s.value);
  // speedOf 在入定中已含 ×2.5，预览要基于"基础增速"避免重复计
  return meditating() ? v / MEDITATE_MUL : v;
}
function medGain() {
  return medBaseSpeed() * (MEDITATE_MUL - 1) * medSec.value; // 入定比常态多赚的
}
function medPct() {
  const c = cost();
  if (!c) return 100;
  return Math.min(100, ((s.value.spirit + medTotal()) / c) * 100);
}
function medTotal() {
  // 入定 medSec 息共得灵力（含基础，×2.5）
  return medBaseSpeed() * MEDITATE_MUL * medSec.value;
}
function doMeditate() {
  const sec = Math.floor(Number(medSec.value));
  if (!isFinite(sec) || sec < 1) {
    toastOnce("请输入入定时长（息）。");
    return;
  }
  medSec.value = sec;
  meditate(s.value, sec);
  flushToasts();
}
// 入定剩余秒数（模板里取不到 Date，用函数算）
const medLeft = () => Math.max(0, Math.ceil((s.value.meditateUntil - Date.now()) / 1000));

// ===== M3：炼丹 =====
const alchBrewPill = (): PillDef | null =>
  s.value.alch ? PILLS.find((p) => p.id === s.value.alch!.pillId) ?? null : null;
const alchPct = () => alchProgress(s.value).pct;
const alchLeft = () => alchProgress(s.value).left;
function doBrew(id: string) {
  startBrew(s.value, id);
  flushToasts();
}
function buyH(id: string) {
  buyHerb(s.value, id);
  flushToasts();
}
function invN(id: string): number {
  return s.value.inv[id] ?? 0;
}
function recipeText(p: PillDef): string {
  return Object.entries(p.recipe)
    .map(([hid, n]) => `【${HERBS.find((h) => h.id === hid)?.name ?? hid}】×${n}`)
    .join("＋");
}
function pillEffect(p: PillDef): string {
  if (p.effect === "heal" && p.healPct) return `服用回 ${Math.round(p.healPct * 100)}% 气血`;
  if (p.effect === "spirit" && p.spiritMul) return `炼化灵力 +${Math.round(p.spiritMul * 100)}% 上限`;
  if (p.effect === "break") return `下次大突破成功率 +${Math.round((p.breakBonus ?? 0) * 100)}%（可叠3层）`;
  if (p.effect === "gather") return `修炼速度 +${Math.round((p.gatherMul ?? 0) * 100)}%（${p.gatherSec}息）`;
  return p.desc;
}
function herbOf(h: HerbDef): string {
  return h.realmReq > 0 ? `筑基后常见` : h.realmReq < 0 ? "" : "常见";
}
// ===== 图标点缀 =====
const REALM_ICONS = ["🌫️", "🏔️", "⚛️", "🐲", "🌟"]; // 按大境界序号
const realmIco = () => REALM_ICONS[s.value.realm] ?? "🌫️";
const ICONS: Record<string, string> = {
  sword: "⚔️",
  flash: "⚡",
  recover: "💚",
  shield: "🔔",
  thunder: "🌩️",
  heal: "🌿",
  gather: "💊",
  armor: "🪬",
  wolf: "🐺",
  beast: "🦊",
  raider: "🏹",
  mobei: "😈",
  ghost: "👻",
  beastking: "🐯",
  demonlord: "💀",
  yuanshui: "☠️",
  // M3 丹药
  pill_huichun: "💊",
  pill_juqi: "🧪",
  pill_pojing: "🔥",
  pill_ningshu: "🌀",
  // M3 药材
  herb_yuteng: "🌿",
  herb_linglu: "💧",
  herb_riyan: "🌺",
  herb_leisui: "⚡",
};
const ico = (id?: string) => {
  if (!id) return "✦";
  if (id.startsWith("tower:")) return "👹";
  if (id.startsWith("egg_")) return "🥚";
  return ICONS[id] ?? "✦";
};
const toastIco = (k: string) => (k === "break" ? "⚡" : k === "good" ? "🌿" : k === "bad" ? "🗡️" : "📜");
const btnText = () => {
  if (s.value.enemy) return "战斗中 · 不可修炼";
  if (isFinal()) return "已臻化神 · 静待飞升";
  return isTopStage() ? `冲击${REALMS[s.value.realm + 1].name}` : "修 炼";
};
const canAct = () => !s.value.enemy && !isFinal() && s.value.spirit >= cost();
// 灵力条目标文案：冲哪个突破
const costTarget = () => {
  if (isFinal()) return "静待飞升";
  return isTopStage() ? `冲击${REALMS[s.value.realm + 1].name}` : `突破至${stageLabel(s.value.realm, s.value.stage + 1)}`;
};

// ===== 灵石化灵：可设数量 + 预览 =====
const stoneAmt = ref(0); // 0 = 未设置
const stoneCount = () => {
  const n = Math.floor(Number(stoneAmt.value));
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.min(n, s.value.stones);
};
const stoneGainPreview = () => stoneCount() * STONE_TO_SPIRIT;
function setStonePreset(n: number | "all") {
  if (n === "all") stoneAmt.value = s.value.stones;
  else stoneAmt.value = n;
}
function doStoneToSpirit() {
  const n = stoneCount();
  if (n <= 0) {
    toastOnce("灵石不足或数量未设置。");
    return;
  }
  stoneToSpirit(s.value, n);
  stoneAmt.value = 0; // 用完清空，避免误连点
  flushToasts();
}
let lastToastText = "";
function toastOnce(text: string) {
  if (lastToastText === text) return; // 避免同句重复弹
  lastToastText = text;
  const id = ++toastId;
  toasts.value.push({ id, text, kind: "info" });
  window.setTimeout(() => dismissToast(id), 3500);
}
// 按钮为何置灰：给玩家一个明确的原因，而不是干等
const actHint = () => {
  if (s.value.enemy) return "战斗中不可修炼，先了结眼前之战。";
  if (isFinal()) return "";
  const c = cost();
  if (!c) return "";
  if (s.value.spirit < c) {
    const lack = c - s.value.spirit;
    const sp = speedOf(s.value); // 每秒（每息）积累量，重伤/入定已计入
    const secs = sp > 0 ? Math.ceil(lack / sp) : Infinity;
    const need = Number.isFinite(secs)
      ? `，按当前增速约需 ${secs.toLocaleString()} 息`
      : "";
    return `灵力尚缺 ${Math.ceil(lack).toLocaleString()}${need}${injured() ? "（重伤未愈，增速减半）" : ""}。`;
  }
  return "";
};
const breakChance = () =>
  Math.min(0.95, REALMS[s.value.realm].breakChance + methodOf(s.value).breakBonus);

const mission = () => currentMission(s.value);
const missionDone = (m: (typeof MISSIONS)[number]) =>
  s.value.realm > m.realm || (s.value.realm === m.realm && s.value.stage >= m.stage);

// 战斗视图
const enemy = () => s.value.enemy;
const canDungeon = () => !s.value.enemy && dungeonOpen(s.value);
const enemyDef = () => enemyOf(s.value);
const hpPct = () => Math.max(0, (s.value.hp / maxHpOf(s.value)) * 100);
const canCast = (id: string) => {
  const sp = SPELLS.find((x) => x.id === id)!;
  return !!s.value.enemy && s.value.realm >= sp.realm && s.value.spirit >= sp.cost;
};

// 背包（含炼制的丹药）
const invEntries = () =>
  Object.entries(s.value.inv)
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ def: itemDef(id) ?? PILLS.find((p) => p.id === id)!, n }));

// ===== 场景地图 =====
const mapOpen = ref(false);
const curNode = () => currentNode(s.value);
const nodePos = (n: MapNodeDef) => ({ x: 10 + n.x * 40, y: 12 + n.y * 76 }); // x:0-2→10/50/90，y:0-1→12/88
const mapLinks = () => {
  const seen = new Set<string>();
  const out: { key: string; a: MapNodeDef; b: MapNodeDef }[] = [];
  for (const n of MAP_NODES) {
    for (const lid of n.links) {
      const key = [n.id, lid].sort().join(">");
      if (seen.has(key)) continue;
      seen.add(key);
      const b = MAP_NODES.find((x) => x.id === lid);
      if (!b) continue;
      out.push({ key, a: n, b });
    }
  }
  return out;
};
const nodeState = (n: MapNodeDef) => {
  if (n.id === s.value.loc) return "here";
  if (!nodeUnlocked(n, s.value)) return "locked";
  return curNode().links.includes(n.id) ? "reach" : "far";
};
const nodeTag = (n: MapNodeDef) => {
  if (n.kind === "home") return "安身";
  if (n.kind === "wild") return `出没 · 掉落×${n.dropMul ?? 1}`;
  if (n.kind === "spot") return `灵气浓郁 +${Math.round((n.speedBonus ?? 0) * 100)}%`;
  if (n.kind === "dungeon") return `秘境入口`;
  return "";
};
const nodeClick = (n: MapNodeDef) => {
  const st = nodeState(n);
  if (st === "here") return;
  if (st === "locked") {
    toasts.value.push({ id: ++toastId, text: `${n.name}：${nodeLockText(n, s.value)}`, kind: "info" });
    window.setTimeout(() => dismissToast(toasts.value[toasts.value.length - 1].id), 2600);
    return;
  }
  if (st === "far") {
    toasts.value.push({ id: ++toastId, text: `距${n.name}尚有山路，须循相邻地点而行。`, kind: "info" });
    window.setTimeout(() => dismissToast(toasts.value[toasts.value.length - 1].id), 2600);
    return;
  }
  moveTo(s.value, n.id);
  flushToasts();
};

let timer: number | undefined;
const onHide = () => save(s.value);
onMounted(() => {
  save(s.value); // 立即落一次初始存档，避免首次刷新丢失
  timer = window.setInterval(() => {
    tick(s.value, 1);
    checkMissions(s.value);
    flushToasts(); // 离线结算/任务达成等也要弹提示
    // 每 5 秒至少落盘一次，不依赖页面退出事件
    if (Date.now() - s.value.lastSave >= 5000) save(s.value);
  }, 1000);
  window.addEventListener("beforeunload", onHide);
  window.addEventListener("pagehide", onHide);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") save(s.value);
  });
});
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
  window.removeEventListener("beforeunload", onHide);
  window.removeEventListener("pagehide", onHide);
});
</script>

<template>
  <div class="wrap">
    <!-- 水墨山水背景（层叠山峦 + 月 + 雾，全局） -->
    <div class="ink" aria-hidden="true">
      <svg viewBox="0 0 1440 900" preserveAspectRatio="xMidYMax slice">
        <circle cx="1120" cy="170" r="66" class="ink-moon" />
        <path class="ink-far" d="M0,540 L180,420 L360,540 L520,380 L760,560 L980,400 L1200,540 L1440,420 L1440,900 L0,900 Z" />
        <path class="ink-mid" d="M0,640 L240,520 L420,640 L640,500 L900,660 L1140,540 L1440,660 L1440,900 L0,900 Z" />
        <path class="ink-near" d="M0,760 L280,660 L520,780 L820,660 L1120,790 L1440,700 L1440,900 L0,900 Z" />
        <rect class="ink-mist" x="0" y="560" width="1440" height="140" />
      </svg>
    </div>

    <header class="topbar">
      <div class="brand">
        <span class="brand-t">凡人修仙</span>
        <span class="brand-s">七玄外传</span>
      </div>
      <div class="res">
        <span class="res-chip realm"><span class="realm-ico">{{ realmIco() }}</span>{{ stageLabel(s.realm, s.stage) }}</span>
        <span class="res-chip">💎 {{ s.stones.toLocaleString() }}</span>
        <span class="res-chip">⏳ {{ REALMS[s.realm].lifespan }}</span>
        <span class="res-chip dim">🕯 低调 {{ s.lowKey }}/100</span>
        <button class="mini journal-btn" @click="journalOpen = true">📜 史册</button>
      </div>
    </header>

    <section class="card hero-card" v-show="mainTab === 'xiu' && !inBattle">
      <!-- 修行者立绘（一念逍遥式中央立像，随境界而变） -->
      <div class="figure">
        <div class="figure-glow" :style="{ animationDuration: (9 - s.realm) + 's' }"></div>
        <div class="figure-glyph">{{ figureGlyph() }}</div>
        <div class="figure-cap">
          <b>{{ s.name }}</b>
          <span class="dim">七玄门 · {{ s.rank }}</span>
        </div>
      </div>
      <div class="who">
        <div><label>寿元</label><b>{{ REALMS[s.realm].lifespan }}</b></div>
        <div><label>灵石</label><b>{{ s.stones.toLocaleString() }}</b></div>
        <div><label>因果</label><b>{{ s.karma }}</b></div>
        <div><label>低调</label><b>{{ s.lowKey }} / 100</b></div>
        <div><label>历时</label><b>{{ Math.floor(s.days).toLocaleString() }} 日</b></div>
      </div>
      <div class="realm-name"><span class="realm-ico">{{ realmIco() }}</span>{{ stageLabel(s.realm, s.stage) }}</div>
      <p class="realm-note">{{ REALMS[s.realm].note }}（功法：{{ methodOf(s).name }}）</p>
      <p class="bar-label">💗 气血 · 生死之基</p>
      <div class="bar hp-bar"><div class="fill hp-fill" :style="{ width: hpPct() + '%' }"></div></div>
      <div class="meta">
        <span>气血 {{ Math.floor(s.hp).toLocaleString() }} / {{ maxHpOf(s).toLocaleString() }}</span>
        <span>灵力 {{ Math.floor(s.spirit).toLocaleString() }} / {{ cost() ? cost().toLocaleString() : "—" }}</span>
        <span>
          增速 {{ speedOf(s).toFixed(1) }} / 息
          <em v-if="meditating()" class="stat">入定中</em>
          <em v-if="injured()" class="stat warn-stat">重伤</em>
        </span>
        <span>历时 {{ Math.floor(s.days).toLocaleString() }} 日</span>
      </div>
      <p class="bar-label">💠 灵力 · 攒满即可{{ costTarget() }}</p>
      <div class="bar">
        <div class="fill med-preview" :style="{ left: pct() + '%', width: Math.max(0, medPct() - pct()) + '%' }"></div>
        <div class="fill spirit-fill" :style="{ width: pct() + '%' }"></div>
      </div>
      <button class="act" :disabled="!canAct()" @click="doAct">{{ btnText() }}</button>
      <p v-if="actHint()" class="act-hint">{{ actHint() }}</p>
      <p class="dim mi-hint">⛰️ 探秘 · 登塔 · 行脚山水 → 见底部「秘境」</p>
      <!-- 入定：时长可调 + 条上预览（浅蓝段） -->
      <div class="stone-panel">
        <p class="sp-title">🧘 入定（速度 ×2.5）· 灵力条浅蓝段 = 入定后预计灵力</p>
        <div class="sp-row">
          <input
            class="sp-input"
            type="number"
            min="1"
            max="60"
            placeholder="时长（息）"
            v-model.number="medSec"
          />
          <button class="mini sp-preset" :class="{ on: medSec === 5 }" @click="medSec = 5">5</button>
          <button class="mini sp-preset" :class="{ on: medSec === 10 }" @click="medSec = 10">10</button>
          <button class="mini sp-preset" :class="{ on: medSec === 20 }" @click="medSec = 20">20</button>
          <button class="mini sp-preset" :class="{ on: medSec === 30 }" @click="medSec = 30">30</button>
        </div>
        <div class="sp-row">
          <span class="sp-preview" v-if="medSec >= 1">
            入定 {{ Math.floor(medSec) }} 息 → 灵力 <b>+{{ Math.round(medTotal()).toLocaleString() }}</b>
            <em v-if="meditating()" class="stat">（入定中 余 {{ medLeft() }} 息）</em>
          </span>
          <button class="sp-go" :disabled="medSec < 1 || meditating() || !!s.enemy" @click="doMeditate">
            {{ meditating() ? "入定中 · 不可重入" : "入 定" }}
          </button>
        </div>
      </div>
      <!-- 灵石化灵：设数量 → 预览 → 确认 -->
      <div class="stone-panel">
        <p class="sp-title">💎 灵石化灵（1 石 = 10 灵力，持有 {{ s.stones.toLocaleString() }} 石）</p>
        <div class="sp-row">
          <input
            class="sp-input"
            type="number"
            min="1"
            :max="s.stones"
            placeholder="数量"
            v-model="stoneAmt"
          />
          <button class="mini sp-preset" @click="setStonePreset(10)">10</button>
          <button class="mini sp-preset" @click="setStonePreset(50)">50</button>
          <button class="mini sp-preset" @click="setStonePreset(100)">100</button>
          <button class="mini sp-preset" @click="setStonePreset('all')">全部</button>
        </div>
        <div class="sp-row">
          <span class="sp-preview" v-if="stoneCount() > 0">
            兑换 {{ stoneCount() }} 石 → 灵力 <b>+{{ stoneGainPreview().toLocaleString() }}</b>
            <em v-if="stoneCount() >= cost() && cost() > 0" class="sp-ok">（够{{ costTarget() }}）</em>
          </span>
          <span class="sp-preview dim" v-else>输入数量，预览将增加的灵力</span>
          <button class="sp-go" :disabled="stoneCount() <= 0" @click="doStoneToSpirit">确认化灵</button>
        </div>
      </div>
      <!-- M3：炼丹炉（药材 → 丹药，成功率仿一念逍遥 random_drug） -->
      <div class="stone-panel alch-panel">
        <p class="sp-title">⚗️ 炼丹炉（战后拾药，商行亦可购）</p>
        <div class="sp-row" v-if="s.alch && alchBrewPill()">
          <span class="sp-preview">
            炉中炼 <b>{{ ico(s.alch.pillId) }} {{ alchBrewPill()!.name }}</b>
            <em class="stat">余 {{ alchLeft() }} 息</em>
          </span>
          <div class="bar alch-bar"><div class="fill alch-fill" :style="{ width: alchPct() + '%' }"></div></div>
        </div>
        <div v-for="p in PILLS" :key="p.id" class="recipe">
          <div class="recipe-top">
            <b>{{ ico(p.id) }} {{ p.name }}</b>
            <span class="recipe-meta">成算 {{ Math.round(p.chance * 100) }}% · 约 {{ p.brewSec }} 息</span>
            <span class="recipe-meta">持有 ×{{ invN(p.id) }}</span>
          </div>
          <div class="recipe-bottom">
            <span class="dim recipe-need">{{ recipeText(p) }}</span>
            <span class="recipe-fx">{{ pillEffect(p) }}</span>
            <button
              class="mini sp-go"
              :disabled="!!s.alch"
              :title="s.alch ? '丹炉使用中' : ''"
              @click="doBrew(p.id)"
            >
              {{ s.alch ? "炉火未熄" : "投炉炼制" }}
            </button>
          </div>
        </div>
        <div class="herb-row">
          <span v-for="h in HERBS" :key="h.id" class="herb-chip" :title="h.desc">
            {{ ico(h.id) }} {{ h.name }} ×{{ invN(h.id) }}
            <button class="mini herb-buy" :disabled="s.stones < h.price" @click="buyH(h.id)">购{{ h.price }}石</button>
          </span>
        </div>
        <!-- 丹药袋：非战斗时可服用 -->
        <div class="pillbag-row" v-if="!s.enemy">
          <button
            v-for="p in PILLS.filter((x) => invN(x.id) > 0)"
            :key="p.id"
            class="mini pillbag"
            :title="pillEffect(p)"
            @click="useItem(s, p.id); flushToasts()"
          >
            服·{{ ico(p.id) }}{{ p.name }}×{{ invN(p.id) }}
          </button>
          <span class="dim" v-if="!PILLS.some((x) => invN(x.id) > 0)">
            丹药袋空——炼成丹药后可在此服用（回春/聚气/破境/凝气）
          </span>
        </div>
      </div>
      <p v-if="!isFinal() && isTopStage() && !s.enemy" class="warn">
        突破成功率 {{ Math.round(breakChance() * 100) }}%（功法加成已计入{{ s.breakPillStacks > 0 ? `，破境丹 ${s.breakPillStacks} 层待用 +${s.breakPillStacks * 15}%` : "" }}）—— 失败恐遭天劫反噬
      </p>
      <p v-if="!canDungeon() && !s.enemy" class="dim">
        秘境之门紧闭：需修至{{ stageLabel(s.realm, 3) }}方可踏入{{ DUNGEON.name }}。
      </p>
    </section>

    <!-- 战斗 / 秘境 -->
    <section class="card" v-if="s.enemy || s.dungeon || s.tower">
      <h2>
        {{ s.dungeon ? `🕳️ 秘境·${DUNGEON.name} 第 ${s.dungeon.room + 1}/${s.dungeon.total} 重` : s.tower ? `🗼 镇岳塔 第 ${s.tower.floor} 层` : "⚔️ 遭遇战" }}
        <em v-if="enemy() && enemyDef()?.boss" class="boss-tag">{{ s.tower ? "镇守" : "领主" }}</em>
      </h2>
      <div v-if="s.enemy" class="battle">
        <div class="foe">
          <b>{{ ico(enemyDef()?.id) }} {{ enemyDef()?.name }}</b>
          <div class="bar foe-bar"><div class="fill foe-fill" :style="{ width: (s.enemy.hp / s.enemy.maxHp) * 100 + '%' }"></div></div>
          <span class="dim">{{ Math.max(0, Math.floor(s.enemy.hp)) }} / {{ s.enemy.maxHp }} 气血</span>
        </div>
        <div class="spell-row">
          <button
            v-for="sp in SPELLS"
            :key="sp.id"
            class="mini spell"
            :disabled="!canCast(sp.id)"
            :title="sp.desc"
            @click="castSpell(s, sp.id); flushToasts()"
          >
            {{ ico(sp.id) }} {{ sp.name }}<small>（{{ sp.cost }}灵）</small>
          </button>
        </div>
        <div class="inv-row">
          <button
            v-for="it in invEntries()"
            :key="it.def.id"
            class="mini"
            @click="useItem(s, it.def.id); flushToasts()"
          >
            用·{{ ico(it.def.id) }}{{ it.def.name }}×{{ it.n }}
          </button>
          <button
            class="mini retreat-btn"
            @click="retreat(s); flushToasts()"
          >
            🏃 撤退（弃战保命）
          </button>
          <span v-if="!invEntries().length" class="dim">（无可用之物）</span>
        </div>
      </div>
      <p v-else class="dim">洞府幽暗中，你缓步前行……</p>
    </section>

    <!-- 储物袋 / 商行（Tab：储物） -->
    <section class="card" v-show="mainTab === 'cu' && !inBattle">
      <h2>储物袋 / 商行</h2>
      <div class="shop">
        <div v-for="it in ITEMS" :key="it.id" class="shop-item">
          <b>{{ ico(it.id) }} {{ it.name }}</b><small>{{ it.desc }}</small>
          <button class="mini" :disabled="!!s.enemy || s.stones < it.price" @click="buyItem(s, it.id); flushToasts()">
            购（{{ it.price }}石）
          </button>
          <button class="mini" :disabled="!s.inv[it.id]" @click="useItem(s, it.id); flushToasts()">
            用（{{ s.inv[it.id] ?? 0 }}）
          </button>
        </div>
      </div>
      <p class="dim" v-if="s.dungeonClears">秘境通关 {{ s.dungeonClears }} 次。</p>
    </section>

    <!-- M4：灵兽栏（七玄门灵兽园：孵化认主 + 血脉进阶）（Tab：灵兽） -->
    <section class="card pet-panel" v-show="mainTab === 'shou' && !inBattle">
      <h2>🐾 灵兽栏 <em class="pet-count">{{ s.pets.length }}/5 只</em></h2>
      <div v-if="s.pets.length" class="pet-list">
        <div v-for="(pet, i) in s.pets" :key="i" class="pet-card">
          <b class="pet-name">{{ petDef(pet.id)?.icon }} {{ petDef(pet.id)?.name }}</b>
          <span class="pet-blood b{{ pet.blood }}">血脉·{{ PET_BLOOD.names[pet.blood - 1] }}</span>
          <div class="pet-stats">
            <span>攻 +{{ Math.round(maxHpOf(s) * (petDef(pet.id)?.atk[pet.blood - 1] ?? 0)).toLocaleString() }}</span>
            <span>💎 {{ petDef(pet.id)?.stone[pet.blood - 1] }}/10息</span>
          </div>
          <button
            class="mini"
            :disabled="pet.blood >= 5 || !s.inv['blood_pill']"
            @click="evolvePet(s, i); flushToasts()"
            title="喂一枚血脉丹尝试升血脉"
          >
            喂血脉丹（{{ s.inv['blood_pill'] ?? 0 }}）
          </button>
        </div>
      </div>
      <p v-else class="dim">尚无灵兽。商行有售灵兽蛋（灵狐/青鳞蛇/麒麟/真龙），购得后点「用」孵化认主。</p>
    </section>

    <!-- 秘境大厅（Tab：秘境）· 探秘 / 登塔 / 行脚山水 -->
    <section class="card mi-panel" v-show="mainTab === 'mi' && !inBattle">
      <h2>🗺️ 秘境大厅</h2>
      <p class="dim mi-intro">七玄门之外的山水之间，藏着机缘，也藏着杀机。择一处入内，搏一个前程。</p>
      <div class="mi-list">
        <div class="mi-card">
          <div class="mi-head">
            <b>🕳️ {{ DUNGEON.name }}</b>
            <span class="mi-tag">Roguelike · 九重</span>
          </div>
          <p class="dim">须修至{{ stageLabel(s.realm, 3) }}方可入门。层层探索，破阵夺宝，九重尽破方得通关。</p>
          <div class="mi-foot">
            <span class="dim" v-if="!canDungeon() && !s.enemy">尚须境界（现{{ stageLabel(s.realm, s.stage) }}）</span>
            <span class="dim" v-else-if="s.dungeonClears">已通关 {{ s.dungeonClears }} 次</span>
            <button class="mini sp-go" :disabled="!!s.enemy || !!s.dungeon || !!s.tower || !canDungeon()" @click="enterDungeon(s); flushToasts()">
              入内探秘（{{ DUNGEON.fee }}石）
            </button>
          </div>
        </div>
        <div class="mi-card">
          <div class="mi-head">
            <b>🗼 {{ TOWER.name }}</b>
            <span class="mi-tag">无限层 · 镇守</span>
          </div>
          <p class="dim">后山老塔，前代掌门镇煞所立。怪随层加深，每五层有镇守，每十层有赏赐。失手即被震出。</p>
          <div class="mi-foot">
            <span class="dim" v-if="s.towerBest">最高曾至第 {{ s.towerBest }} 层</span>
            <button class="mini sp-go" :disabled="!!s.enemy || !!s.tower || !!s.dungeon || s.stones < TOWER.fee" @click="enterTower(s); flushToasts()">
              登塔（{{ TOWER.fee }}石）
            </button>
          </div>
        </div>
        <div class="mi-card">
          <div class="mi-head">
            <b>⛰️ 行脚山水</b>
            <span class="mi-tag">开放世界 · 现居【{{ curNode().name }}】</span>
          </div>
          <p class="dim">七玄门辖下六处所在，循相邻地点移步。各有所长：洞府得灵石、演武场得战力……</p>
          <div class="mi-foot">
            <button class="mini sp-go" @click="mapOpen = true">展开舆图</button>
          </div>
        </div>
      </div>
    </section>

    <section class="card" v-show="mainTab === 'zong' && !inBattle">
      <h2>宗门任务</h2>
      <div class="mission" v-if="mission()">
        <div class="m-name">{{ mission()!.name }} <em class="m-desc">—— {{ mission()!.desc }}</em></div>
        <div class="m-req">达成条件：{{ stageLabel(mission()!.realm, mission()!.stage) }}</div>
        <div class="m-reward">
          赏赐：灵石 {{ mission()!.stones.toLocaleString() }}
          <template v-if="mission()!.spirit">，灵力 {{ mission()!.spirit.toLocaleString() }}</template>
          <template v-if="mission()!.method">，功法【{{ METHODS.find((m) => m.id === mission()!.method)?.name }}】</template>
          <template v-if="mission()!.rank">，晋升{{ mission()!.rank }}</template>
        </div>
      </div>
      <p v-else class="m-done">宗门任务已全部完成，此界再无执念。</p>
      <details class="m-list" v-if="mission()">
        <summary>任务总览（{{ MISSIONS.filter(missionDone).length }} / {{ MISSIONS.length }}）</summary>
        <ul>
          <li
            v-for="m in MISSIONS"
            :key="m.id"
            :class="{ done: missionDone(m), cur: m.id === mission()!.id }"
          >
            {{ m.name }}：{{ m.desc }}
          </li>
        </ul>
      </details>
    </section>

    <section class="card" v-show="mainTab === 'zong' && !inBattle">
      <h2>境界之路</h2>
      <div class="chips">
        <span
          v-for="(r, i) in REALMS"
          :key="r.id"
          class="chip"
          :class="{ now: i === s.realm, past: i < s.realm }"
        >
          {{ r.name }}
        </span>
      </div>
    </section>

    <!-- 修仙史册 · 独立页面 -->
    <div class="journal-mask" v-if="journalOpen" @click.self="journalOpen = false">
      <div class="journal">
        <div class="j-head">
          <h2>📜 修仙史册</h2>
          <span class="dim">{{ s.logs.length }} 则</span>
          <button class="mini" @click="journalOpen = false">返回</button>
        </div>
        <ul v-if="journalList.length">
          <li v-for="(l, i) in journalList" :key="i" :class="l.kind">
            <time>{{ fmtTime(l.t) }}</time>
            <span>{{ l.text }}</span>
          </li>
        </ul>
        <p v-else class="dim">史册空空如也。</p>
      </div>
    </div>

    <!-- 场景地图 · 开放世界（数据表驱动，后续可扩展新区域/节点） -->
    <div class="map-mask" v-if="mapOpen" @click.self="mapOpen = false">
      <div class="map">
        <div class="j-head">
          <h2>🗺️ 场景地图</h2>
          <span class="dim">现居【{{ curNode().name }}】</span>
          <button class="mini" @click="mapOpen = false">返回</button>
        </div>
        <div class="map-board">
          <!-- 连线（SVG） -->
          <svg class="map-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line
              v-for="l in mapLinks()"
              :key="l.key"
              :x1="nodePos(l.a).x"
              :y1="nodePos(l.a).y"
              :x2="nodePos(l.b).x"
              :y2="nodePos(l.b).y"
              :class="{ reach: nodeState(l.a) === 'here' || nodeState(l.b) === 'here' }"
            />
          </svg>
          <!-- 节点 -->
          <button
            v-for="n in MAP_NODES"
            :key="n.id"
            class="map-node"
            :class="nodeState(n)"
            :style="{ left: nodePos(n).x + '%', top: nodePos(n).y + '%' }"
            @click="nodeClick(n)"
          >
            <span class="mn-ico">{{ n.icon }}</span>
            <span class="mn-name">{{ n.name }}</span>
            <span class="mn-tag">{{ nodeState(n) === "locked" ? "🔒 " + nodeLockText(n, s) : nodeTag(n) }}</span>
          </button>
        </div>
        <div class="map-cur">
          <b>当前：{{ curNode().icon }} {{ curNode().name }}</b>
          <p class="dim">{{ curNode().desc }}</p>
          <p class="dim small">
            点击相邻的亮色地点即可移步；金色 = 可前往，暗色 = 尚未解锁，灰线 = 未相邻。
          </p>
        </div>
      </div>
    </div>

    <!-- 浮层提示（toast） -->
    <div class="toasts">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.kind"
        @click="dismissToast(t.id)"
      >
        <span class="t-ico">{{ toastIco(t.kind) }}</span>{{ t.text }}
      </div>
    </div>

    <!-- 底部 Tab 栏（一念逍遥式导航） -->
    <nav class="tabbar" v-show="!inBattle">
      <button
        v-for="t in TABS"
        :key="t.id"
        class="tab"
        :class="{ on: mainTab === t.id }"
        @click="mainTab = t.id"
      >
        <span class="tab-ico">{{ t.ico }}</span>
        <span class="tab-name">{{ t.name }}</span>
      </button>
    </nav>

    <footer>
      <span>《凡人修仙传》同人玩法 · 仅取世界观设定</span>
      <span>M5 · 水墨主界面 / 修炼 / 丹道 / 灵兽 / 秘境</span>
      <button class="reset" @click="doReset">转世重修（清档）</button>
    </footer>
  </div>
</template>