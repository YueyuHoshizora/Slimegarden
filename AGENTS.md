# AGENTS.md — 史萊姆花園 Slimegarden AI 協作守則

## 權威文件序
1. `PLAN.md`：企劃唯一規格來源。
2. `DESIGN.md`：數值敘述，由 `node tools/gen-design.mjs` 從 `src/data/` 產生，不手改。
3. `ACCEPTANCE.md`：驗收項目與結果。
4. 本檔：實作慣例。

規格衝突裁示（2026-09-25）：物種共 62（原生 1＋基礎 22＋原初系 3＋配方 36）；配方 36（明示 27＋隱藏 9），配方圖鑑 36 格；BGM 交付 3 首。

## 硬性限制
- 純前端 HTML／CSS／ES modules；無框架、無 CDN、無 npm 相依、無建置步驟。
- 數值只放 `src/data/`；其他處不寫死數字。
- 所有 UI 保持在視窗內，`html`／`body`／面板不得出現捲軸；斷點 ≥1024／600–1023／<600。
- 觸控目標 ≥44×44px；合成支援拖放與點選。
- 三語（zh／en／ja）同步，文案資料皆為 `{ zh, en, ja }`；語系以 `?lang=` 路由，切換不重載。
- 調性：可愛治癒，禁止攻擊／傷害／擊殺／懲罰類詞彙；失敗不造成不可逆損失。
- 圖鑑插畫必須是 SVG 精繪（四層構成），禁止像素風與色塊。
- PWA 離線可玩為硬性驗收項目。
- 程式註解與提交訊息使用繁體中文。

## 目錄結構
```
index.html  manifest.webmanifest  sw.js  CNAME  favicon.ico
assets/        圖示、音軌資料
styles/        CSS
src/data/      數值與內容資料（唯一來源），texts/ 三語文案
src/core/      引擎、存檔、晝夜、離線結算（無 DOM，可用 node 測試）
src/render/    Canvas 缸內生態
src/art/       SVG 插畫、配色、卡片匯出
src/audio/     8-bit 音效與 BGM 音序器
src/i18n/      語系切換
src/ui/        介面
tests/         node --test
tools/         模擬、DESIGN.md 產生、SW 資產清單
```

## 指令
- 本機執行：`python3 -m http.server 8000`，開啟 `http://localhost:8000/`
- 測試：`node --test tests/`
- 平衡模擬：`node tools/sim.mjs`
- 產生 DESIGN.md：`node tools/gen-design.mjs`
- 更新 SW 快取清單：`node tools/build-sw-manifest.mjs`

## 實作慣例
- `src/core` 保持純函式、可注入 RNG／時間／storage，方便測試。
- 修改 `src/data/` 後重新產生 `DESIGN.md` 並執行模擬確認節奏目標。
- 修改任何執行期資源後重新產生 SW 資產清單。
- 依任務階段提交，訊息使用繁體中文；未經小語要求不 push。
