import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

try {
  createApp(App).mount("#app");
} catch (e) {
  console.error(e);
  const show = (window as unknown as { __showBootErr?: (m?: string) => void }).__showBootErr;
  if (show) show(`运行时错误：${e instanceof Error ? e.message : String(e)}`);
}