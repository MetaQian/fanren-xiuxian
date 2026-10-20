interface Env {
  ASSETS: Fetcher;
}

// 静态资源 + 健康检查 + 资源 404 防线。
export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/api/health") {
      return Response.json({
        ok: true,
        game: "fanren-xiuxian",
        version: "0.1.0",
        time: Date.now(),
      });
    }

    if (url.pathname.startsWith("/api/")) {
      return Response.json(
        { ok: false, error: "该接口尚未开放（计划 M4：D1 云存档）" },
        { status: 501 },
      );
    }

    // 资源 404 防线：SPA fallback 会把不存在的 /assets/* 直接返回 200 + text/html，
    // 旧缓存 index.html 引用的旧 hash JS 会因此把 HTML 当 JS 执行 → 黑屏。
    // 这里识别出"回落的 HTML"，改返回一小段 JS 触发页面内置的"刷新重试"提示。
    if (url.pathname.startsWith("/assets/")) {
      const res = await env.ASSETS.fetch(request);
      const ct = res.headers.get("content-type") ?? "";
      if (ct.includes("text/html")) {
        return new Response(
          "window.__showBootErr && window.__showBootErr('页面资源加载失败（缓存过期），点下方按钮刷新重试。');",
          {
            status: 404,
            headers: {
              "content-type": "application/javascript; charset=utf-8",
              "cache-control": "no-store",
            },
          },
        );
      }
      return res;
    }

    const res = await env.ASSETS.fetch(request);
    // 关键：HTML（index.html / SPA 回落）绝不缓存。
    // 手机缓存旧 index.html → 引用的旧 hash JS 在新版本里已不存在 → 黑屏。
    // no-cache 让每次访问都取回与当前部署匹配的 index.html。
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("text/html")) {
      const headers = new Headers(res.headers);
      headers.set("cache-control", "no-cache, no-store, must-revalidate");
      headers.set("pragma", "no-cache");
      headers.set("expires", "0");
      return new Response(res.body, { status: res.status, headers });
    }
    return res;
  },
} satisfies ExportedHandler<Env>;