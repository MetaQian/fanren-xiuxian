<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { REALMS } from "./game/data";
import {
  type GameState,
  type LogEntry,
  act,
  load,
  nextCost,
  resetGame,
  save,
  speedOf,
  stageLabel,
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
const btnText = () => {
  if (isFinal()) return "已臻化神 · 静待飞升";
  return isTopStage() ? `冲击${REALMS[s.value.realm + 1].name}` : "修 炼";
};
const canAct = () => !isFinal() && s.value.spirit >= cost();

let timer: number | undefined;
onMounted(() => {
  timer = window.setInterval(() => {
    tick(s.value, 1);
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
        <div><label>身份</label><b>七玄门 · 外门弟子</b></div>
        <div><label>寿元</label><b>{{ REALMS[s.realm].lifespan }}</b></div>
        <div><label>因果</label><b>{{ s.karma }}</b></div>
        <div><label>低调</label><b>{{ s.lowKey }} / 100</b></div>
      </div>
      <div class="realm-name">{{ stageLabel(s.realm, s.stage) }}</div>
      <p class="realm-note">{{ REALMS[s.realm].note }}</p>
      <div class="bar"><div class="fill" :style="{ width: pct + '%' }"></div></div>
      <div class="meta">
        <span>灵力 {{ Math.floor(s.spirit).toLocaleString() }} / {{ cost() ? cost().toLocaleString() : "—" }}</span>
        <span>增速 {{ speedOf(s).toFixed(1) }} / 息{{ injured() ? " · 重伤疗伤中" : "" }}</span>
        <span>历时 {{ Math.floor(s.days).toLocaleString() }} 日</span>
      </div>
      <button class="act" :disabled="!canAct()" @click="doAct">{{ btnText() }}</button>
      <p v-if="!isFinal() && isTopStage()" class="warn">
        突破成功率 {{ Math.round(REALMS[s.realm].breakChance * 100) }}% —— 失败恐遭天劫反噬
      </p>
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
      <span>M0 骨架 · 本地存档已启用，云存档 M4 上线</span>
      <button class="reset" @click="doReset">转世重修（清档）</button>
    </footer>
  </div>
</template>