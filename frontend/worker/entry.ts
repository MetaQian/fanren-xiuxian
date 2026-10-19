interface Env {
  ASSETS: Fetcher;
}

// M0: 静态资源 + 健康检查。
// M4 计划: /api/save、/api/load 接 D1 云存档。
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

    return env.ASSETS.fetch(request);
  },
} satisfies ExportedHandler<Env>;