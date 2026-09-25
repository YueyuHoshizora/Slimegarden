# 史萊姆花園 Slimegarden

在窗邊的小庭園裡，養一缸軟軟的史萊姆。

一款可愛治癒的網頁放置養成遊戲：累積黏液、合成進化、探索配方，收集在晝夜光影裡慢慢長大的小夥伴。純前端執行，免登入，進度保存在自己的瀏覽器中。

[遊戲網址](https://slimegarden.yustellar.dev/) · [繁體中文](https://slimegarden.yustellar.dev/?lang=zh-Hant) · [English](https://slimegarden.yustellar.dev/?lang=en) · [日本語](https://slimegarden.yustellar.dev/?lang=ja)

## 遊戲特色

- **放置與合成**：史萊姆自動產出黏液；三隻同物種、同階史萊姆可以合成升階，支援點選與拖放。
- **配方與收集**：62 種物種、36 種配方，搭配變異與 SVG 圖鑑插畫；可下載圖鑑與配方卡片。
- **晝夜庭園**：隨時段變化的庭園景色、日夜限定配方，以及 24 首日夜背景音樂。
- **持續成長**：離線收益、庭園裝飾、轉生與永久升級。
- **三語介面**：繁體中文、英文、日文，可即時切換，不必重新載入。
- **離線遊玩**：透過 Service Worker 快取遊戲資源，並提供 PWA 安裝支援。

## 開始遊玩

### 繁體中文

在窗邊的小庭園裡，和軟軟的史萊姆一起慢慢成長。

1. 累積史萊姆產出的黏液，並用來召喚新夥伴。
2. 選取三隻同物種、同階的史萊姆，合成為一隻更高階的史萊姆；支援點選與拖放。
3. 搭配不同物種探索配方，發現新史萊姆並補齊圖鑑；部分配方有日夜時段限制。
4. 隨著成長解鎖轉生，帶著永久升級展開下一輪庭園生活。

收集 62 種物種、36 種配方與各式變異，也能佈置庭園、下載圖鑑圖片與配方卡片。離開期間仍可累積離線收益，讓庭園持續成長。

### English

Grow a cozy little garden of slimes at your own pace.

1. Collect Gel produced by your slimes and use it to summon new companions.
2. Select three slimes of the same species and tier to merge them into one of a higher tier. Both tap selection and drag-and-drop are supported.
3. Combine different species through recipes to discover new slimes and fill your codex. Some recipes depend on the time of day.
4. As your garden grows, unlock rebirth and permanent upgrades for your next journey.

Discover 62 species, 36 recipes, and mutations; decorate your garden and export codex images or recipe cards. Offline earnings help your garden keep growing while you are away.

### 日本語

窓辺の小さな庭で、やわらかなスライムたちとのんびり過ごしましょう。

1. スライムが生み出すジェルを集めて、新しい仲間を召喚します。
2. 同じ種族・同じランクのスライムを3匹選ぶと、1つ上のランクに合成できます。タップでの選択とドラッグ＆ドロップに対応しています。
3. 異なる種族をレシピで組み合わせて、新しいスライムを発見し、図鑑を埋めていきましょう。時間帯が条件となるレシピもあります。
4. 庭園が育ったら、転生と永続アップグレードを解放して、次の庭園生活へ進みましょう。

62種のスライム、36種のレシピ、さまざまな変異を収集できます。庭を飾ったり、図鑑画像やレシピカードをダウンロードしたりして楽しめます。離れている間も、オフライン収益で成長を続けられます。

### 存檔與離線注意事項

- 進度使用 `localStorage` 儲存在目前瀏覽器與網站來源中，**不會自動跨裝置同步**。清除網站資料前，請先匯出存檔。
- 設定介面提供 JSON 下載、Base64 存檔碼、匯入預覽與備份還原。
- 匯入存檔或還原備份會保留目前介面語言；下次啟動仍可沿用本機存檔的語言設定。
- 第一次遊玩需連線載入，待 Service Worker 完成快取後才能離線使用。音訊播放可能需要先點擊或觸碰畫面。
- PWA 安裝入口依瀏覽器而異；實體裝置安裝與各瀏覽器音訊的驗證狀態，請見 [ACCEPTANCE.md](ACCEPTANCE.md)。

## 本機執行

直接執行原始碼不需要安裝 npm 套件，也不需要編譯或打包。於專案根目錄執行：

```sh
python3 -m http.server 8000
```

開啟 <http://localhost:8000/>，或使用 <http://localhost:8000/?lang=zh-Hant> 指定繁體中文。

請透過 HTTP 伺服器開啟，不要直接以 `file://` 開啟 `index.html`。Service Worker 需要安全來源；本機 `localhost` 可供開發使用，正式部署請使用 HTTPS。

## 開發與驗證

開發工具使用 Node.js；測試使用內建的 `node:test`。下列指令皆於專案根目錄執行：

```sh
# 核心邏輯測試
node --test 'tests/**/*.test.js'

# 遊戲節奏模擬
node tools/sim.mjs

# 從 src/data/ 重新產生數值文件
node tools/gen-design.mjs

# 更新 CSS／JS 雜湊網址與 Service Worker 預快取清單
node tools/build-assets.mjs
```

- 修改 `src/data/` 後，重新產生 `DESIGN.md` 並執行節奏模擬；不要手動修改生成的數值文件。
- 修改執行期資源後，交付前必須更新資產雜湊與快取清單。`build-assets.mjs` 更新原始碼版本的 `index.html` 與 `sw-assets.js`；正式部署請使用下方的壓縮流程。
- 原始碼保留可讀格式；esbuild 僅作為建置相依，不會加入遊戲執行期。
- 現行資產網址使用根路徑，靜態部署應以網站根目錄提供專案內容，而非直接置於子路徑。

### 壓縮部署產物

```sh
npm ci
npm run build

# 預覽壓縮後的網站
python3 -m http.server 8000 --directory dist
```

`npm run build` 會清空並重建 `dist/`，將所有執行期 JS／CSS 壓縮後，再產生對應內容的雜湊網址、import map 與離線快取清單。`sw.js`、`sw-assets.js` 也會壓縮；不合併 ES modules、不改寫原始碼，不部署測試、開發工具或 `node_modules/`。

GitHub Pages 工作流程會安裝鎖定版本的建置工具、執行測試並建置，最後只上傳 `dist/`。此目錄為生成產物，不應放入手動維護的檔案。

## 專案結構

```text
index.html             網頁入口
styles/                響應式介面樣式
src/
  data/                數值、物種、配方與三語文案
  core/                遊戲引擎、存檔、晝夜與離線結算
  render/              Canvas 庭園生態
  art/                 SVG 插畫與卡片匯出
  audio/               音效與 BGM 音序器
  i18n/                語言切換
  ui/                  介面互動
assets/                圖示與音軌資料
tests/                 核心邏輯測試
tools/                 模擬、文件與資產清單產生工具
sw.js                  Service Worker
sw-assets.js           自動產生的預快取清單
manifest.webmanifest   PWA 設定
```

## 專案文件

- [PLAN.md](PLAN.md)：遊戲企劃與規格來源。
- [DESIGN.md](DESIGN.md)：由遊戲資料產生的數值文件。
- [ACCEPTANCE.md](ACCEPTANCE.md)：驗收方式、歷史結果與尚未驗證項目。
- [AGENTS.md](AGENTS.md)：專案實作與協作慣例。

## 授權

本專案採用 **GNU Affero General Public License v3.0**，詳見 [LICENSE](LICENSE)。
