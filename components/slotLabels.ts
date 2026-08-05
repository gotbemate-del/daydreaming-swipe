// 裝備部位的中文名。放在 components/ 是因為它純粹是顯示用的字串——
// game/equipment.ts 只吐 slot 的英文 id,那一層不該知道畫面要顯示什麼。
export const EQUIPMENT_SLOT_LABELS: Record<string, string> = {
  mainhand: '主手',
  offhand: '副手',
  headwear: '頭部',
  face: '臉部',
  top: '上衣',
  bottom: '下著',
  gloves: '手套',
  belt: '腰帶',
  back: '披風',
};
