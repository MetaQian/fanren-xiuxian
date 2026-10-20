import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

// 黑屏兜底：mount 失败 或 任何运行时错误（渲染/事件/定时器）都显示提示页并刷新
// —— 宁可提示"刷新重试"，也不给用户一片黑屏
function showBootErr(msg: string): void {
  const w = window as unknown as { __showBootErr?: (m?: string) => void };
  if (w.__showBootErr) w.__showBootErr(msg);
  else console.error(msg);
}

function bootMsg(e: unknown): string {
  const m = e instanceof Error ? e.message : String(e);
  return `页面未能正常启动（${m}），点下方按钮刷新重试。`;
}

try {
  const app = createApp(App);
  app.config.errorHandler = (err) => {
    console.error(err);
    showBootErr(bootMsg(err));
  };
  app.mount("#app");
} catch (e) {
  console.error(e);
  showBootErr(bootMsg(e));
}

window.addEventListener("error", (ev) => {
  // 资源加载失败（如缓存的旧 JS 404）也兜底提示
  if (ev.target instanceof Element || !ev.error) {
    showBootErr("页面资源加载失败，点下方按钮刷新重试。");
    return;
  }
  showBootErr(bootMsg(ev.error));
});
window.addEventListener("unhandledrejection", (ev) => {
  showBootErr(bootMsg(ev.reason));
});