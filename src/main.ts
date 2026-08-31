const app = document.querySelector<HTMLDivElement>("#app");

if (!app) {
  throw new Error("Missing application root");
}

app.innerHTML = `
  <h1>PeiXiu · 广州摩托导航</h1>
  <p>Phase 0 项目骨架已启动，下一阶段将接入 Valhalla WASM Spike。</p>
  <a href="/spike/valhalla-route.html">打开 Valhalla Spike</a>
`;
