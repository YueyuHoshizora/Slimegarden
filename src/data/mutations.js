export const MUTATIONS = {
  hue: {
    name: { 'zh-Hant': '色相', en: 'Hue', ja: '色相' },
    levels: [
      { id: 0, name: { 'zh-Hant': '原色', en: 'Original', ja: '原色' }, gelRate: 0.01 },
      { id: 1, name: { 'zh-Hant': '柔和', en: 'Soft', ja: 'やわらか' }, gelRate: 0.04 },
      { id: 2, name: { 'zh-Hant': '霓虹', en: 'Neon', ja: 'ネオン' }, gelRate: 0.09 },
      { id: 3, name: { 'zh-Hant': '星雲', en: 'Nebula', ja: '星雲' }, gelRate: 0.15 },
    ],
  },
  gloss: {
    name: { 'zh-Hant': '光澤', en: 'Gloss', ja: 'つや' },
    levels: [
      { id: 0, name: { 'zh-Hant': '啞光', en: 'Matte', ja: 'マット' }, offlineRate: 0.01 },
      { id: 1, name: { 'zh-Hant': '果凍', en: 'Jelly', ja: 'ゼリー' }, offlineRate: 0.04 },
      { id: 2, name: { 'zh-Hant': '螢光', en: 'Luminous', ja: '発光' }, offlineRate: 0.08 },
      { id: 3, name: { 'zh-Hant': '透明', en: 'Crystal', ja: '透明' }, offlineRate: 0.12 },
    ],
  },
  core: {
    name: { 'zh-Hant': '核心', en: 'Core', ja: 'コア' },
    levels: [
      { id: 0, name: { 'zh-Hant': '無', en: 'None', ja: 'なし' }, mutationRate: 0, offlineCapMinutes: 0, mergeCostDiscount: 0, prestigeMudRate: 0 },
      { id: 1, name: { 'zh-Hant': '小葉', en: 'Little Leaf', ja: '小さな葉' }, mutationRate: 0.02, offlineCapMinutes: 0, mergeCostDiscount: 0, prestigeMudRate: 0 },
      { id: 2, name: { 'zh-Hant': '露珠', en: 'Dewdrop', ja: 'しずく' }, mutationRate: 0, offlineCapMinutes: 30, mergeCostDiscount: 0, prestigeMudRate: 0 },
      { id: 3, name: { 'zh-Hant': '花瓣', en: 'Petal', ja: '花びら' }, mutationRate: 0, offlineCapMinutes: 0, mergeCostDiscount: 0.02, prestigeMudRate: 0 },
      { id: 4, name: { 'zh-Hant': '星星', en: 'Star', ja: '星' }, mutationRate: 0, offlineCapMinutes: 0, mergeCostDiscount: 0, prestigeMudRate: 0.05 },
    ],
  },
};
