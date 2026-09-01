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
bash scripts/routing-data/build-guangzhou.sh \
  /path/to/guangdong-latest.osm.pbf \
  public/routing/guangzhou \
  graph-2026-09-01-001 \
  <west> <south> <east> <north>
```

参数顺序为：源 PBF、输出根目录、不可变 graph 版本、裁剪范围 west/south/east/north。脚本拒绝覆盖已有 graph 版本；需要重建时使用新版本号。

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
