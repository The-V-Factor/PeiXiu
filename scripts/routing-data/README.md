# 真实广州路网构建

当前正式发布路径是独立公开数据仓库 + jsDelivr；`upload-r2.sh` 仅作为未来切换对象存储时的备选脚本，不属于当前部署方案。

当前仓库里的 `spike/fixtures/guangzhou-mini.osm` 是合成网格，只能用于 WASM Spike。产品化 graph 必须从真实 OSM PBF 构建。

## 数据来源

首选 [Geofabrik 广东省下载页](https://download.geofabrik.de/asia/china/guangdong.html) 的 `guangdong-latest.osm.pbf`。该文件覆盖范围大于 V1，构建时必须通过 bbox 裁剪为项目约定的广州范围。需要更小的临时区域时，可以使用 [BBBike 自定义导出](https://extract.bbbike.org/) 生成 PBF。

下载的数据来自 OpenStreetMap，发布时需要保留 ODbL 署名、来源 URL、下载时间和 checksum。

## 构建

本脚本使用 Docker 中的 Osmium 和 Valhalla builder，不要求宿主机安装这两个工具：

```bash
OSM_PBF_URL=https://download.geofabrik.de/asia/china/guangdong-latest.osm.pbf \
ROUTING_BOUNDARY_URL=https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@<data-commit>/boundaries/guangzhou/guangzhou-admin.geojson \
ROUTING_COVERAGE_URL=https://cdn.jsdelivr.net/gh/The-V-Factor/PeiXiu-routing-data@<data-commit>/routing/guangzhou/coverage.geojson \
bash scripts/routing-data/build-guangzhou.sh \
  /path/to/guangdong-latest.osm.pbf \
  public/routing/guangzhou \
  graph-2026-09-01-001 \
  <west> <south> <east> <north>
```

参数顺序为：源 PBF、输出根目录、不可变 graph 版本、裁剪范围 west/south/east/north。脚本拒绝覆盖已有 graph 版本；需要重建时使用新版本号。

`ROUTING_BOUNDARY_URL` 和 `ROUTING_COVERAGE_URL` 为可选 manifest 字段。发布到数据仓库时应使用可通过 jsDelivr 访问的固定版本地址或安全相对路径；前者表达广州行政边界，后者表达实际可路由 graph 覆盖范围。两者都必须使用 WGS84 GeoJSON 的 Polygon 或 MultiPolygon。

manifest 生成器会根据 Valhalla tile ID 写入每个 tile 的真实地理 bounds（level 0/1/2 分别为 4°/1°/0.25°网格），前端据此只下载与起终点相交的 tile；不要把所有 tile 的 bounds 都写成总裁剪范围。

如果使用 OSM 行政关系返回的 GeoJSON 作为裁剪边界，可先转换成 Osmium polygon 文件：

```bash
node scripts/routing-data/geojson-to-osmium-poly.mjs \
  /path/to/guangzhou-admin.geojson \
  /path/to/guangzhou.poly
```

然后将 `build-guangzhou.sh` 的 polygon 裁剪输入接到该 `.poly` 文件。行政边界数据需要保留来源、许可、关系 ID、下载时间和 checksum。

可以从广州范围内的 OSM 道路 GeoJSON 生成路网覆盖轮廓。先用 Osmium 提取 `highway` 要素并按广州 `.poly` 裁剪，再执行：

```bash
node scripts/routing-data/build-coverage.mjs \
  /path/to/guangzhou-roads.geojson \
  /path/to/coverage.geojson
```

该脚本按 0.005° 网格合并实际道路占用单元，生成用于页面展示和范围校验的近似覆盖轮廓；它不是行政区边界，也不替代 Valhalla 对具体道路连通性的判断。

构建时设置 `OSM_POLYGON_FILE` 即使用真实边界裁剪；未设置时仍兼容旧的 bbox 模式：

```bash
OSM_POLYGON_FILE=/path/to/guangzhou.poly \
bash scripts/routing-data/build-guangzhou.sh \
  /path/to/guangdong-latest.osm.pbf \
  public/routing/guangzhou \
  graph-2026-09-01-002 \
  112.95 22.56 114.06 23.94
```

输出目录可以交给 jsDelivr 发布脚本。脚本会把 graph 复制到独立数据仓库，使用两次提交将 tile commit SHA 固定进 manifest，并可选择推送：

```bash
node scripts/routing-data/publish-jsdelivr.mjs \
  public/routing/guangzhou \
  /path/to/PeiXiu-routing-data \
  The-V-Factor/PeiXiu-routing-data \
  --push
```

脚本会输出本次发布的固定 manifest URL，便于验收、回滚和环境覆盖。正式构建默认使用数据仓库 `main` 分支下的稳定 manifest 入口；更新 routing data 时只需发布数据仓库，不需要把 graph 文件提交到主代码仓库，也不需要修改主项目代码。

## 验收

- manifest 中的 `source.kind` 为 `osm-pbf`，不能使用 `osmFixture` 冒充真实数据。
- 起终点路线 geometry 与底图道路基本重合。
- 路线不沿合成 3×3 网格穿越建筑、河流或其他不可通行区域。
- graph 版本更新后，浏览器缓存不会混用旧 tile。
