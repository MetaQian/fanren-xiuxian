<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { METHODS, MISSIONS, REALMS } from "./game/data";
import {
  type GameState,
  type LogEntry,
  act,
  checkMissions,
  currentMission,
  load,
  meditate,
  methodOf,
  nextCost,
  resetGame,
  save,
  speedOf,
  stageLabel,
  stoneToSpirit,
  tick,
} from "./game/state";

const s = ref<GameState>(load());
const logList = ref<LogEntry[]>(s.value.logs.slice(-30).reverse());

function syncLogs() {
  logList.value = s.value.logs.slice(-30).reverse();
}

function doAct() {
  act(s.value);
  syncLogs();
}

function doReset() {
  if (!window.confirm("前尘尽断，转世重修？当前存档将被清除。")) return;
  s.value = resetGame();
  syncLogs();
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
  if (isFinal()) return "已臻化神 · 静待飞升";
  return isTopStage() ? `冲击${REALMS[s.value.realm + 1].name}` : "修 炼";
};
const canAct = () => !isFinal() && s.value.spirit >= cost();
const breakChance = () =>
  Math.min(0.95, REALMS[s.value.realm].breakChance + methodOf(s.value).breakBonus);

const mission = () => currentMission(s.value);
const missionDone = (m: (typeof MISSIONS)[number]) =>
  s.value.realm > m.realm || (s.value.realm === m.realm && s.value.stage >= m.stage);

let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    tick(s.value, 1);
    checkMissions(s.value);
    if (Math.floor(s.value.days) % 10 === 0) save(s.value);
  }, 1000);
  window.addEventListener("beforeunload", save);
});
onBeforeUnmount(() => {
  if (timer !== undefined) window.clearInterval(timer);
  window.removeEventListener("beforeunload", save);
});
</script>

<template>
  <div class="wrap">
    <header>
      <h1>凡人修仙 <span class="sub">· 七玄外传</span></h1>
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
      <div class="bar"><div class="fill" :style="{ width: pct + '%' }"></div></div>
      <div class="meta">
        <span>灵力 {{ Math.floor(s.spirit).toLocaleString() }} / {{ cost() ? cost().toLocaleString() : "—" }}</span>
        <span>
          增速 {{ speedOf(s).toFixed(1) }} / 息
          <em v-if="meditating()" class="stat">入定中</em>
          <em v-if="injured()" class="stat warn-stat">重伤</em>
        </span>
        <span>历时 {{ Math.floor(s.days).toLocaleString() }} 日</span>
      </div>
      <button class="act" :disabled="!canAct()" @click="doAct">{{ btnText() }}</button>
      <div class="sub-actions">
        <button class="mini" :disabled="meditating()" @click="meditate(s); syncLogs()">
          入定（×2.5 / 10息）
        </button>
        <button class="mini" :disabled="s.stones <= 0" @click="stoneToSpirit(s); syncLogs()">
          灵石化灵（1石=10灵力）
        </button>
      </div>
      <p v-if="!isFinal() && isTopStage()" class="warn">
        突破成功率 {{ Math.round(breakChance() * 100) }}%（功法加成已计入）—— 失败恐遭天劫反噬
      </p>
    </section>

    <section class="card">
      <h2>宗门任务</h2>
      <div class="mission" v-if="mission()">
        <div class="m-name">{{ mission()!.name }} <em class="m-desc">—— {{ mission()!.desc }}</em></div>
        <div class="m-req">
          达成条件：{{ stageLabel(mission()!.realm, mission()!.stage) }}
        </div>
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

    <section class="card log">
      <h2>修仙日志</h2>
      <ul>
        <li v-for="(l, i) in logList" :key="i" :class="l.kind">{{ l.text }}</li>
      </ul>
    </section>

    <footer>
      <span>《凡人修仙传》同人玩法 · 仅取世界观设定</span>
      <span>M1 · 功法 / 宗门任务 / 灵石</span>
      <button class="reset" @click="doReset">转世重修（清档）</button>
    </footer>
  </div>
</template>