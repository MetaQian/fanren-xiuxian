<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { DUNGEON, ITEMS, METHODS, MISSIONS, REALMS, SPELLS } from "./game/data";
import {
  type GameState,
  type LogEntry,
  act,
  buyItem,
  castSpell,
  checkMissions,
  currentMission,
  dungeonOpen,
  enemyOf,
  enterDungeon,
  itemDef,
  load,
  maxHpOf,
  meditate,
  methodOf,
  nextCost,
  retreat,
  resetGame,
  save,
  speedOf,
  stageLabel,
  stoneToSpirit,
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
const btnText = () => {
  if (s.value.enemy) return "战斗中 · 不可修炼";
  if (isFinal()) return "已臻化神 · 静待飞升";
  return isTopStage() ? `冲击${REALMS[s.value.realm + 1].name}` : "修 炼";
};
const canAct = () => !s.value.enemy && !isFinal() && s.value.spirit >= cost();
// 按钮为何置灰：给玩家一个明确的原因，而不是干等
const actHint = () => {
  if (s.value.enemy) return "战斗中不可修炼，先了结眼前之战。";
  if (isFinal()) return "";
  const c = cost();
  if (!c) return "";
  if (s.value.spirit < c) {
    const lack = c - s.value.spirit;
    const sp = speedOf(s); // 每秒（每息）积累量，重伤/入定已计入
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

// 背包
const invEntries = () =>
  Object.entries(s.value.inv).filter(([, n]) => n > 0).map(([id, n]) => ({ def: itemDef(id)!, n }));

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
    <header>
      <div class="head-row">
        <h1>凡人修仙 <span class="sub">· 七玄外传</span></h1>
        <button class="mini journal-btn" @click="journalOpen = true">
          史册（{{ s.logs.length }}）
        </button>
      </div>
      <p class="tag">凡人流 · 放置修炼 · 每一次突破，皆是生死一线</p>
    </header>

    <section class="card">
      <div class="who">
        <div><label>姓名</label><b>{{ s.name }}</b></div>
        <div><label>身份</label><b>七玄门 · {{ s.rank }}</b></div>
        <div><label>寿元</label><b>{{ REALMS[s.realm].lifespan }}</b></div>
        <div><label>灵石</label><b>{{ s.stones.toLocaleString() }}</b></div>
        <div><label>因果</label><b>{{ s.karma }}</b></div>
        <div><label>低调</label><b>{{ s.lowKey }} / 100</b></div>
      </div>
      <div class="realm-name">{{ stageLabel(s.realm, s.stage) }}</div>
      <p class="realm-note">{{ REALMS[s.realm].note }}（功法：{{ methodOf(s).name }}）</p>
      <div class="bar hp-bar"><div class="fill hp-fill" :style="{ width: hpPct + '%' }"></div></div>
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
      <div class="bar"><div class="fill" :style="{ width: pct + '%' }"></div></div>
      <button class="act" :disabled="!canAct()" @click="doAct">{{ btnText() }}</button>
      <p v-if="actHint()" class="act-hint">{{ actHint() }}</p>
      <div class="sub-actions">
        <button class="mini" :disabled="meditating() || !!s.enemy" @click="meditate(s); flushToasts()">
          入定（×2.5 / 10息）
        </button>
        <button class="mini" :disabled="s.stones <= 0" @click="stoneToSpirit(s); flushToasts()">
          灵石化灵（1石=10灵力）
        </button>
        <button class="mini" :disabled="!!s.enemy" @click="enterDungeon(s); flushToasts()">
          探秘{{ DUNGEON.name }}（{{ DUNGEON.fee }}石）
        </button>
      </div>
      <p v-if="!isFinal() && isTopStage() && !s.enemy" class="warn">
        突破成功率 {{ Math.round(breakChance() * 100) }}%（功法加成已计入）—— 失败恐遭天劫反噬
      </p>
      <p v-if="!canDungeon() && !s.enemy" class="dim">
        秘境之门紧闭：需修至{{ stageLabel(s.realm, 3) }}方可踏入{{ DUNGEON.name }}。
      </p>
    </section>

    <!-- 战斗 / 秘境 -->
    <section class="card" v-if="s.enemy || s.dungeon">
      <h2>
        {{ s.dungeon ? `秘境·${DUNGEON.name} 第 ${s.dungeon.room + 1}/${s.dungeon.total} 重` : "遭遇战" }}
        <em v-if="enemy() && enemyDef()?.boss" class="boss-tag">领主</em>
      </h2>
      <div v-if="s.enemy" class="battle">
        <div class="foe">
          <b>{{ enemyDef()?.name }}</b>
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
            {{ sp.name }}<small>（{{ sp.cost }}灵）</small>
          </button>
        </div>
        <div class="inv-row">
          <button
            v-for="it in invEntries()"
            :key="it.def.id"
            class="mini"
            @click="useItem(s, it.def.id); flushToasts()"
          >
            用·{{ it.def.name }}×{{ it.n }}
          </button>
          <button
            class="mini retreat-btn"
            @click="retreat(s); flushToasts()"
          >
            撤退（弃战保命）
          </button>
          <span v-if="!invEntries().length" class="dim">（无可用之物）</span>
        </div>
      </div>
      <p v-else class="dim">洞府幽暗中，你缓步前行……</p>
    </section>

    <!-- 背包 / 商行 -->
    <section class="card">
      <h2>储物袋 / 商行</h2>
      <div class="shop">
        <div v-for="it in ITEMS" :key="it.id" class="shop-item">
          <b>{{ it.name }}</b><small>{{ it.desc }}</small>
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

    <section class="card">
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

    <section class="card">
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
          <h2>修仙史册</h2>
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

    <!-- 浮层提示（toast） -->
    <div class="toasts">
      <div
        v-for="t in toasts"
        :key="t.id"
        class="toast"
        :class="t.kind"
        @click="dismissToast(t.id)"
      >
        {{ t.text }}
      </div>
    </div>

    <footer>
      <span>《凡人修仙传》同人玩法 · 仅取世界观设定</span>
      <span>M2 · 战斗 / 秘境 / 法术 / 商行</span>
      <button class="reset" @click="doReset">转世重修（清档）</button>
    </footer>
  </div>
</template>