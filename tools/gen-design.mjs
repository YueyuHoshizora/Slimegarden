import { writeFile } from 'node:fs/promises';
import { CONFIG } from '../src/data/config.js';
import { DECORATIONS } from '../src/data/decorations.js';
import { MUTATIONS } from '../src/data/mutations.js';
import { RECIPES } from '../src/data/recipes.js';
import { SPECIES } from '../src/data/species.js';
import { UPGRADES } from '../src/data/upgrades.js';

const byId = new Map(SPECIES.map((species) => [species.id, species]));
const byStage = new Map(['intro', 'run1', 'run2'].map((stage) => [stage, RECIPES.filter((recipe) => recipe.stage === stage)]));
const percent = (value) => `${(value * 100).toFixed(1)}%`;
const hours = (milliseconds) => `${milliseconds / CONFIG.time.hourMs} 小時`;
const duration = (milliseconds) => milliseconds < CONFIG.time.minuteMs
  ? `${milliseconds / CONFIG.time.secondMs} 秒`
  : `${milliseconds / CONFIG.time.minuteMs} 分鐘`;
const kindCount = (kind) => SPECIES.filter((species) => species.kind === kind).length;
const baseCosts = Object.entries(CONFIG.economy.summonUnlockCosts)
  .sort((first, second) => first[1] - second[1])
  .map(([id, cost]) => `${byId.get(id).name['zh-Hant']} ${cost}`)
  .join('；');
const recipeRows = [...byStage].map(([stage, recipes]) => {
  const list = recipes.map((recipe) => {
    const mark = recipe.hidden ? '（隱藏）' : '';
    const time = recipe.time === 'any' ? '不限時段' : recipe.time === 'day' ? '日間' : '夜間';
    return `- ${byId.get(recipe.id).name['zh-Hant']}${mark}：${byId.get(recipe.a).name['zh-Hant']}（${recipe.tierA} 階）＋${byId.get(recipe.b).name['zh-Hant']}（${recipe.tierB} 階），${time}`;
  }).join('\n');
  return `### ${stage}（${recipes.length} 種）\n${list}`;
}).join('\n\n');
const mutationRows = Object.entries(MUTATIONS).map(([dimension, definition]) => {
  const levels = definition.levels.map((level) => {
    const bonus = dimension === 'hue' ? `黏液產速 ${percent(level.gelRate)}`
      : dimension === 'gloss' ? `離線效率 ${percent(level.offlineRate)}`
        : `變異率 +${percent(level.mutationRate)}；離線上限 +${level.offlineCapMinutes} 分鐘；合成費用 -${percent(level.mergeCostDiscount)}；原初之泥 +${percent(level.prestigeMudRate)}`;
    return `${level.name['zh-Hant']}：${bonus}`;
  }).join('；');
  return `- **${definition.name['zh-Hant']}**：${levels}`;
}).join('\n');
const upgradeRows = UPGRADES.map((upgrade) => `- ${upgrade.name['zh-Hant']}（上限 ${upgrade.maxLevel} 級；每級原初之泥 ${upgrade.costs.join('、')}）：${Object.entries(upgrade.effectPerLevel).map(([key, value]) => `${key} ${key === 'offlineCapHours' ? `+${value} 小時` : `+${percent(value)}`}`).join('、')}`).join('\n');
const decorationRows = DECORATIONS.map((item) => `- ${item.name['zh-Hant']}：廢料 ${item.cost.scrap}、黏液 ${item.cost.gel}、星塵 ${item.cost.stardust}；預設位置 (${item.placement.x}, ${item.placement.y})`).join('\n');
const text = `# 史萊姆花園數值設計

> 本檔由 \`node tools/gen-design.mjs\` 從 \`src/data/\` 產生；請勿手動修改。

## 節奏目標

- 首次合成：${duration(CONFIG.pacing.firstMergeMs)} 內。
- 解鎖全部基礎物種：${duration(CONFIG.pacing.allBaseSpeciesMs)} 內。
- 首次變異：${duration(CONFIG.pacing.firstMutationMs)} 內。
- 首次稀有變異：${duration(CONFIG.pacing.firstRareMutationMs)} 內。
- 收集全部初見配方：${duration(CONFIG.pacing.introRecipesMs)} 內。
- 首次轉生：${hours(CONFIG.pacing.firstPrestigeMs[0])}～${hours(CONFIG.pacing.firstPrestigeMs[1])}。

## 物種與缸容量

- 物種共 ${SPECIES.length} 種：原生 ${kindCount('starter')}、基礎 ${kindCount('base')}、配方 ${kindCount('recipe')}、原初 ${kindCount('primal')}。
- 缸內最多容納 ${CONFIG.tank.capacity} 隻史萊姆；階級範圍為 1～${CONFIG.merge.maximumTier} 階，${CONFIG.merge.requiredSlimes} 隻同種同階合成一隻高一階。
- 基礎物種首次召喚解鎖費由低至高：${baseCosts}。
- 原初系首次轉生後可用原初之泥召喚：${Object.entries(CONFIG.economy.primalSpeciesCost).map(([id, cost]) => `${byId.get(id).name['zh-Hant']} ${cost}`).join('；')}。原初物種不消耗黏液。
- 一般召喚基礎費 ${CONFIG.economy.repeatSummonCost} 黏液；階級費用由 ${CONFIG.economy.summonTierCostMultiplier} 倍數遞增。星塵可召喚超過物種當前進度的材料：${Object.entries(CONFIG.economy.stardustSummonTierCosts).map(([tier, cost]) => `${tier}階 ${cost}`).join('；')}。

## 配方

- 共 ${RECIPES.length} 種：明示 ${RECIPES.filter((recipe) => !recipe.hidden).length}、隱藏 ${RECIPES.filter((recipe) => recipe.hidden).length}；初見／一週目／二週目分別 ${byStage.get('intro').length}／${byStage.get('run1').length}／${byStage.get('run2').length} 種。
- 試錯不消耗史萊姆素材；黏液費 ${CONFIG.economy.recipeFailureGel}，並獲得廢料 ${CONFIG.economy.recipeFailureScrap}。

${recipeRows}

## 變異與晝夜

${mutationRows}

- 每個維度只取全缸加成最高的 ${CONFIG.merge.requiredSlimes} 隻個體。
- 單次誕生變異率：色相 ${percent(CONFIG.economy.mutation.hueChance)}、光澤 ${percent(CONFIG.economy.mutation.glossChance)}、核心 ${percent(CONFIG.economy.mutation.coreChance)}；夜間乘以 ${CONFIG.time.phaseRate.nightMutation}。
- 當地時間 ${CONFIG.time.dayStartHour}:00–${CONFIG.time.nightStartHour}:00 為日間，黏液產速乘以 ${CONFIG.time.phaseRate.dayGel}；其餘時間為夜間。
- 基礎單隻黏液產速 ${CONFIG.economy.baseGelPerSecond}／秒，依階級的 ${CONFIG.economy.tierProductionExponent} 次方成長。

## 圖鑑、資源與轉生

- 圖鑑完整條目數 ${CONFIG.economy.codex.totalEntries}；每解鎖一格，永久黏液產速 +${percent(CONFIG.economy.codex.gelRatePerEntry)}。${Object.entries(CONFIG.economy.codex.giftMilestones).map(([count, gift]) => `${count} 格贈星塵 ${gift.stardust}`).join('；')}。
- 離線收益上限 ${CONFIG.time.offlineCapHours} 小時，永久升級最多提高至 ${CONFIG.time.maxOfflineCapHours} 小時；露珠核心可額外增加 ${CONFIG.time.glossOfflineCapBonusMinutes} 分鐘。
- 轉生需任一物種達 ${CONFIG.economy.prestige.minimumTier} 階；原初之泥 = 各物種本輪最高階級總和 × 圖鑑完成度 × 永久加成，至少 ${CONFIG.economy.prestige.minimumMud}。
- 六項永久升級：
${upgradeRows}

## 裝飾

- 缸內裝飾上限 ${CONFIG.tank.decorationCapacity} 件；擺放位置採 ${CONFIG.tank.coordinateMin}～${CONFIG.tank.coordinateMax} 正規化座標，不影響產出。
${decorationRows}
`;

await writeFile(new URL('../DESIGN.md', import.meta.url), text, 'utf8');
