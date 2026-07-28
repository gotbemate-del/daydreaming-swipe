import { Archetype, JobTier } from '../combat';
import { ActiveSkillSlotId } from '../skillTree';
import { getSkillIcon } from './skillIcons';

// 攻擊特效改成直接沿用 skillIcons.ts 的招式圖示(爆擊一擊/連續多重射擊/治療光環等六款各自造型),
// 不再用「近戰/遠程/輔助 x 物理/魔法」四套共用樣板——同一招式在技能面板的圖示跟戰鬥畫面動畫長得
// 一樣,玩家才認得出「這隻怪剛剛是被哪招打的」。改成吃「實際觸發的欄位」(見
// hooks/useGameState.ts 的 lastTriggeredSkillIcon)而不是永遠固定 active1,4個主動技能
// 各自觸發時畫面上會顯示對應的招式圖示。
export interface AttackEffectData {
  frame: string[];
  palette: Record<string, string>;
}

export function getAttackEffect(archetype: Archetype, slot: ActiveSkillSlotId, tier: JobTier): AttackEffectData {
  return getSkillIcon(archetype, slot, tier);
}
