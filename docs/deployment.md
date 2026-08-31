# PeiXiu 部署说明

## 边界

- Cloudflare Pages 只提供前端 App Shell、JS/CSS、WASM、图标和 manifest。
- Valhalla `.gph` tile 单独放在 R2，不由 Service Worker 全量 precache。
- 当前 `public/routing/guangzhou-mini` 是本地/小规模 fixture；生产 graph 发布前需把 manifest 的 `baseUrl` 指向 R2 自定义域名。
- 不部署长期运行的 Routing Server，也不把 `/route` 请求发送到远程服务。

## Pages

仓库根目录的 `wrangler.toml` 固定 Pages 构建目录为 `dist`。具备 Cloudflare 登录权限后执行：

```bash
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name peixiu
```

首次使用前确认 Pages 项目名、域名和环境；不要把账号 token 写入仓库。

## R2 graph tile

R2 对象目录与 manifest 保持一致：

```text
routing/guangzhou-mini/manifest.json
routing/guangzhou-mini/graph-2026-08-31-001/1/040/973.gph
routing/guangzhou-mini/graph-2026-08-31-001/2/000/652/053.gph
```

上传本地目录中的 graph 文件：

```bash
bash scripts/routing-data/upload-r2.sh <R2_BUCKET> public/routing/guangzhou-mini routing/guangzhou-mini
```

脚本给 immutable `.gph` 设置长期缓存，给 manifest 设置短缓存。R2 bucket 需要绑定可读自定义域名，并应用 CORS：

```bash
npx wrangler r2 bucket cors set <R2_BUCKET> --file config/r2-cors.json
npx wrangler r2 bucket cors list <R2_BUCKET>
```

把 `config/r2-cors.json` 中的 Pages origin 替换成实际域名后再执行。R2 公共域名、CORS 和缓存策略必须在测试环境先验证。

## 发布前检查

```bash
npm test
npm run build
```

- 浏览器可安装 manifest，并注册 `/sw.js`。
- Application → Service Workers 显示已激活。
- Cache Storage 只包含 App Shell；`.gph` 不应出现在 Service Worker cache。
- Network 中 graph tile 来自 R2，manifest 的 `graphVersion` 与 tile 路径一致。
- 真实设备定位使用 HTTPS。
