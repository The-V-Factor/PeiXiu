# PeiXiu · 广州摩托导航

> 面向广州的免费 Web/PWA 摩托车辅助导航实验项目

![Status](https://img.shields.io/badge/status-MVP%20complete-success)
![Version](https://img.shields.io/badge/version-v0.0.1-blue)
![Region](https://img.shields.io/badge/region-Guangzhou-red)
![Routing](https://img.shields.io/badge/routing-browser--local-green)
![Cost](https://img.shields.io/badge/cost-free-brightgreen)

PeiXiu 是一个**浏览器本地计算路线**的广州摩托车辅助导航 MVP：用户选择起点和终点后，在本地完成路线规划，并根据已知摄像头抓拍点位尝试生成避让路线。

项目坚持轻量、免费和可验证，暂时不追求全国覆盖，也不把复杂的禁摩法规全部编码进系统。

## 项目信息

| 项目 | 当前信息 |
| --- | --- |
| 版本 | `v0.0.1` |
| 状态 | MVP 已完成 |
| 正式地址 | [peixiu.pages.dev](https://peixiu.pages.dev/) |
| 覆盖范围 | 广州 |
| 前端托管 | Cloudflare Pages |
| 路网数据 | 真实广州 OSM graph，独立仓库 + jsDelivr |
| 路线计算 | 浏览器本地 Valhalla WASM Worker |

## 当前状态

**MVP v0.0.1 已完成并部署。**正式访问地址：[peixiu.pages.dev](https://peixiu.pages.dev/)。

当前版本已经完成：

- 广州范围的 MapLibre 地图和起终点选择；
- 浏览器 Web Worker 中的 Valhalla WASM `motorcycle` 路线计算；
- 真实广州 OSM graph 按需加载与 IndexedDB 缓存；
- 已知摄像头点位展示和路线走廊避让；
- PWA App Shell、Service Worker 和 Cloudflare Pages 部署；
- 独立路网数据仓库 + jsDelivr 的版本化 graph 发布。

当前版本仍是辅助参考工具，不是实时导航产品。后续功能如地址搜索、实时交通、实时摄像头同步和更完整的摩托车通行规则，均不属于本 MVP。

## 项目边界

### V1 做什么

- 暂时只覆盖广州；
- 使用已知摄像头抓拍点位作为风险点；
- 支持当前位置或地图点选起点；
- 支持地图点选目的地；
- 在浏览器 Web Worker 中计算路线；
- 显示路线、距离、预计时间和避开点位数量；
- 优先使用免费地图数据、静态托管和公开路网数据分发；当前 graph tile 使用独立数据仓库 + jsDelivr。

### V1 不做什么

- 不覆盖全国、省级或跨城市路线；
- 不接入实时交通和实时摄像头数据；
- 不实现完整禁摩法规、时段、车籍和例外规则；
- 不做账号、收藏、社区、后台管理和地址搜索；
- 不承诺“避开摄像头”就等于合法通行。

## 技术路线

```mermaid
flowchart LR
    A[手机浏览器] --> B[MapLibre 地图 UI]
    B --> C[Web Worker]
    C --> D[Valhalla WASM]
    D --> E[广州 Graph Tiles]
    B --> F[摄像头 JSON]
    E --> G[内存缓存 / IndexedDB]
    H[独立公开路网仓库 + jsDelivr] --> E
    I[Cloudflare Pages] --> B
```

### MVP 实现：Valhalla WASM

Valhalla 原生支持 `motorcycle` costing，也提供 `exclude_locations`。MVP 已验证浏览器 WASM、graph tile 按需加载、异步文件系统和摄像头避让流程。

### 备用：omt-router

如果 Valhalla WASM 在浏览器中无法稳定运行，再评估 [omt-router](https://github.com/AbelVM/omt-router)。它更偏向浏览器本地路由，但目前不原生支持摩托车，需要接受汽车路网近似或自行扩展避让逻辑，并评估 AGPL-3.0 许可影响。

## 核心流程

```mermaid
flowchart TD
    A[打开 Web/PWA] --> B[加载地图与摄像头数据]
    B --> C{定位成功?}
    C -->|是| D[显示当前位置]
    C -->|否| E[地图点选起点]
    D --> F[选择目的地]
    E --> F
    F --> G[第一次 motorcycle 路由]
    G --> H[筛选路线附近摄像头]
    H --> I{发现风险点?}
    I -->|否| J[显示普通路线]
    I -->|是| K[第二次路由并排除附近道路]
    K --> L[显示最终路线与避开数量]
```

## 设计原则

| 原则 | 做法 |
| --- | --- |
| 先验证关键链路 | 先做 Valhalla WASM Spike，再做完整产品 |
| 本地优先 | 路线计算放在浏览器 Worker，不依赖长期运行的 Routing API |
| 免费优先 | 优先使用 OSM 数据、静态托管和免费额度内的基础设施 |
| 可替换 | 业务层依赖 `RoutingEngine`，路由引擎通过 Adapter 接入 |
| 结果诚实 | 摄像头数据缺失或过期时明确提示，不伪装成法律判断 |

## 文档

- [下一版本 PRD：数据外置与路线规划体验优化](docs/prd/2026-09-01-v0.1.0-data-and-routing-ux.md)
- [实施方案（Markdown）](docs/guangzhou-motorcycle-routing-implementation-plan.md)
- [实施方案（HTML）](docs/guangzhou-motorcycle-routing-implementation-plan.html)

实施方案包含技术路线、架构图、核心流程、数据模型、Spike 任务和验收标准。

## 主要模块

```text
map/                 地图、当前位置、目的地和路线图层
location/            定位权限与手动选点
routing/             路由接口、Worker 通信和结果标准化
routing/valhalla/    Valhalla WASM 适配器
routing/tiles/       Graph tile 加载、缓存和版本管理
restrictions/        摄像头点位数据与路线走廊筛选
pwa/                 App Shell、Manifest 和 Service Worker
tools/routing-data/  广州 OSM 数据与 Graph tile 构建工具
```

## 免责声明

摄像头点位资料由爱好者整理维护，仅供辅助参考，可能存在遗漏、延迟或误差。路线结果不构成道路通行资格或合法性判断，也不代表避开已知摄像头即可合法通行。请始终以现场交通标志、道路标线和现行交通法规为准。

## License

项目自身许可证仍待确定；OpenStreetMap 数据按 ODbL 许可并保留来源和署名信息，依赖项遵循各自许可证。
