# PeiXiu 部署说明

## 边界

- Cloudflare Pages 只提供前端 App Shell、JS/CSS、WASM、图标和 manifest。
- Valhalla `.gph` tile 发布到独立的公开路网数据仓库，再由 jsDelivr 分发，不由 Service Worker 全量 precache。
- 当前 `public/routing/guangzhou-mini` 是本地/小规模 fixture；广州正式 manifest 使用独立数据仓库的稳定 `@main` 入口，manifest 内的 `baseUrl` 仍指向固定 graph commit URL。
- 不部署长期运行的 Routing Server，也不把 `/route` 请求发送到远程服务。

## Pages

仓库根目录的 `wrangler.toml` 固定 Pages 构建目录为 `dist`。具备 Cloudflare 登录权限后执行：

```bash
npx wrangler login
npm run build
npx wrangler pages deploy dist --project-name peixiu
```

首次使用前确认 Pages 项目名、域名和环境；不要把账号 token 写入仓库。

## jsDelivr graph tile

独立仓库 `The-V-Factor/PeiXiu-routing-data` 的目录与 manifest 保持一致：

```text
routing/guangzhou/manifest.json
routing/guangzhou/graph-2026-09-01-001/1/040/973.gph
routing/guangzhou/graph-2026-09-01-001/2/000/652/053.gph
  cameras/guangzhou/manifest.json
boundaries/guangzhou/guangzhou-admin.geojson
routing/guangzhou/coverage.geojson
```

发布本地目录中的 graph 文件：

```text
将 public/routing/guangzhou 复制到独立数据仓库的 routing/guangzhou，提交后使用 commit SHA 生成固定 jsDelivr URL。
```

默认构建会使用稳定 manifest 入口，不需要设置环境变量：

```text
https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@main/routing/guangzhou/manifest.json
```

如需测试指定版本、回滚或使用本地 fixture，可覆盖 manifest 地址：

```bash
VITE_ROUTING_MANIFEST_URL=https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@<manifest-commit>/routing/guangzhou/manifest.json npm run build
```

摄像头数据默认使用独立数据仓库的稳定 manifest：

```text
https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@main/cameras/guangzhou/manifest.json
```

如需测试指定摄像头数据版本，可覆盖地址：

```bash
VITE_CAMERA_MANIFEST_URL=https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@<manifest-commit>/cameras/guangzhou/manifest.json npm run build
```

页面中的测试摄像头通过地图选点添加，保存在浏览器 LocalStorage，不会写入正式摄像头数据。

manifest 的 `baseUrl` 必须指向同一个数据仓库 commit 下的 graph 目录；`.gph` 使用固定 commit URL，不能覆盖已发布版本。更新 routing data 时只需发布数据仓库的 `main`，不需要修改 PeiXiu 或 Cloudflare 的变量。

广州 routing manifest 可同时提供 `boundaryUrl` 和 `coverageUrl`。前者是行政边界，后者是实际可路由覆盖范围；前端在加载成功时绘制 GeoJSON，旧 manifest 缺少这两个字段时才回退到 tile bounds。

## 发布前检查

```bash
npm test
npm run build
```

- 浏览器可安装 manifest，并注册 `/sw.js`。
- Application → Service Workers 显示已激活。
- Cache Storage 只包含 App Shell；`.gph` 不应出现在 Service Worker cache。
- Network 中 graph tile 来自 jsDelivr，manifest 的 `graphVersion` 与 tile 路径一致。
- 真实设备定位使用 HTTPS。

## 远端 Mac 测试

远端 Docker 测试可使用 `deploy/nginx.conf`，确保 manifest 返回 `application/manifest+json`：

```bash
/usr/local/bin/docker run -d --rm --name peixiu-test -p <PORT>:80 \
  -v <DIST_DIR>:/usr/share/nginx/html:ro \
  -v <REPO_DIR>/deploy/nginx.conf:/etc/nginx/nginx.conf:ro \
  nginx:alpine
```

测试结束后只删除本次容器，不要影响同机其他服务。
