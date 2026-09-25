export const UPGRADES = [
  {
    id: 'gel_garden', name: { zh: '黏黏花圃', en: 'Gel Garden', ja: 'ぷるぷる花壇' },
    maxLevel: 5, costs: [1, 2, 3, 4, 5], effectPerLevel: { gelRate: 0.1 },
  },
  {
    id: 'longer_naps', name: { zh: '安心午睡', en: 'Cozy Naps', ja: 'ゆったりおひるね' },
    maxLevel: 4, costs: [1, 2, 3, 4], effectPerLevel: { offlineCapHours: 1 },
  },
  {
    id: 'gentle_glimmer', name: { zh: '柔柔微光', en: 'Gentle Glimmer', ja: 'やさしいきらめき' },
    maxLevel: 5, costs: [1, 2, 3, 4, 5], effectPerLevel: { mutationRate: 0.05 },
  },
  {
    id: 'soft_summons', name: { zh: '輕柔召喚', en: 'Soft Summons', ja: 'やさしい召喚' },
    maxLevel: 5, costs: [1, 2, 3, 4, 5], effectPerLevel: { summonDiscount: 0.05 },
  },
  {
    id: 'mud_memory', name: { zh: '原初記憶', en: 'Primal Memory', ja: '原初の記憶' },
    maxLevel: 5, costs: [1, 2, 3, 4, 5], effectPerLevel: { mudGain: 0.1 },
  },
  {
    id: 'recipe_kindness', name: { zh: '配方溫柔', en: 'Recipe Kindness', ja: 'レシピのやさしさ' },
    maxLevel: 5, costs: [1, 2, 3, 4, 5], effectPerLevel: { recipeFeeDiscount: 0.05 },
  },
];
