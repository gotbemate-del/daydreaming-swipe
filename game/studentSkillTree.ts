// 「學生」期(Lv1-29,見 lib/storage.ts 的 hasChosenJob)專屬技能樹:玩家還沒選定主職業,
// 不能借用 game/skillTree.ts 那套 Record<Archetype, ...> 的職業技能樹,所以獨立一份。
// 結構完全比照既有 SkillSlotId(passive1/passive2/active1~active4)框架,但只有「一套」
// (不分職業),分 tier1(Lv1,新生)/tier2(Lv10,模範生)兩組敘述,呼應「10級做一組,共兩組」。
//
// 升級花費/觸發間隔/被動加成/主動效果數值全部直接沿用 game/skillTree.ts 的既有公式,
// 不重新發明——學生樹只是「繫在不同的等級軌道上」,機制跟職業樹完全一樣。
import {
  activeSkillDamageCutRatio,
  ActiveSkillSlotId,
  activeSkillTriggerIntervalSeconds,
  getPassiveBonusValue,
  getPassiveEffectKind,
  isPassiveSlot,
  PassiveEffectKind,
  skillSlotUpgradeBookCost,
  SkillSlotId,
} from './skillTree';

export type { PassiveEffectKind };
export {
  activeSkillTriggerIntervalSeconds,
  getPassiveBonusValue,
  getPassiveEffectKind,
  skillSlotUpgradeBookCost,
};

export function createInitialStudentSkillTreeLevels(): Record<SkillSlotId, number> {
  return { passive1: 0, passive2: 0, passive3: 0, active1: 0, active2: 0, active3: 0, active4: 0 };
}

// 學生沒有 JobTier 概念,等級上限直接開一個新常數。原本對齊職業樹 tier1 封頂(2級),
// 現在拉高到5級,讓學生期(Lv1-29)本身就有更完整的技能投資深度,不用畢業轉職才練得動技能。
export const STUDENT_SKILL_LEVEL_CAP = 5;

export function canUpgradeStudentSkillSlot(level: number, skillBooks: number): boolean {
  return level < STUDENT_SKILL_LEVEL_CAP && skillBooks >= skillSlotUpgradeBookCost(level);
}

export function upgradeStudentSkillSlot(level: number): number {
  return Math.min(STUDENT_SKILL_LEVEL_CAP, level + 1);
}

export interface StudentSkillFlavor {
  name: string;
  description: string;
}

// tier1(Lv1,剛入學的「新生」)/tier2(Lv10,已經打出名號的「風雲人物」)兩組敘述,
// 呼應「10級做一組,共兩組」的需求,語氣走國高中生校園情境,不重複職業樹 tier1 的
// 「工讀生」系列上班族梗。
export const STUDENT_SKILL_FLAVOR: Record<1 | 2, Record<SkillSlotId, StudentSkillFlavor>> = {
  1: {
    passive1: {
      name: '新生的求知欲',
      description: '剛入學什麼都好奇,上課特別認真抄重點,經驗值吸收得更快。',
    },
    passive2: {
      name: '早餐店熟客價',
      description: '早餐店老闆記得你的臉,順手多找一點零錢回來。',
    },
    passive3: {
      name: '課間補眠術',
      description: '下課十分鐘就能瞬間回血,吸血跟自動回血效果都會提升。',
    },
    active1: {
      name: '抄筆記抄出心得',
      description: '筆記抄出自己的一套心得,抓準破綻補刀,造成額外傷害。',
    },
    active2: {
      name: '福利社前撿到零錢',
      description: '福利社前低頭一看撿到一枚硬幣,順勢補上一記,造成可觀傷害。',
    },
    active3: {
      name: '小考超常發揮',
      description: '這次小考超常發揮,招式力道全開,對敵人造成沉重傷害。',
    },
    active4: {
      name: '打鐘下課',
      description: '鐘聲一響立刻收拾書包衝出教室,狠狠痛擊要害,造成大量傷害。',
    },
  },
  2: {
    passive1: {
      name: '模範生的讀書法',
      description: '摸出一套自己的讀書方法,經驗值吸收得更快。',
    },
    passive2: {
      name: '班費幹部精算術',
      description: '當上班費幹部練出的精算功力,順手多幫班上多存一點。',
    },
    passive3: {
      name: '萬人迷的好體質',
      description: '天生好體質加上人緣好心情佳,吸血跟自動回血效果都會提升。',
    },
    active1: {
      name: '重點整理神技',
      description: '一份重點整理筆記傳遍全班,抓準破綻補刀,造成額外傷害。',
    },
    active2: {
      name: '校慶擺攤賺一筆',
      description: '校慶園遊會擺攤生意興隆,順勢補上一記,造成可觀傷害。',
    },
    active3: {
      name: '段考奪冠',
      description: '這次段考全班奪冠,招式力道全開,對敵人造成沉重傷害。',
    },
    active4: {
      name: '風雲人物人氣爆棚',
      description: '風雲人物人氣爆棚,一聲令下全場歡呼收場,狠狠痛擊要害,造成大量傷害。',
    },
  },
};

// level < 1 用 tier1(新生)內容,level >= 1 用 tier2(風雲人物)內容——新制封頂只有2級,
// 格子很少、每一級都珍貴,練過一次升級就換一套敘述,呼應舊制「10級做一組」按比例縮小後的分界。
export function getStudentSkillFlavor(level: number, slot: SkillSlotId): StudentSkillFlavor {
  return STUDENT_SKILL_FLAVOR[level >= 1 ? 2 : 1][slot];
}

// 依目前技能等級組成一句人看得懂的說明,對照 game/skillTree.ts 的 getSkillSlotBonusDescription——
// 學生的4個主動格跟職業樹一樣是「造成傷害」,只吃欄位+等級,不需要職業/subtype 資訊。
export function getStudentSkillSlotBonusDescription(slot: SkillSlotId, level: number): string {
  if (isPassiveSlot(slot)) {
    const kind = getPassiveEffectKind(slot);
    const pct = Math.round(getPassiveBonusValue(level) * 1000) / 10;
    if (kind === 'expMastery') return `永久經驗獲取 +${pct}%`;
    if (kind === 'coinMastery') return `永久金幣獲取 +${pct}%`;
    return `永久吸血+自動回血 +${pct}%`;
  }
  const activeSlot = slot as ActiveSkillSlotId;
  const seconds = activeSkillTriggerIntervalSeconds(activeSlot, level);
  const pct = Math.round(activeSkillDamageCutRatio(activeSlot, level) * 1000) / 10;
  return `每 ${seconds} 秒觸發一次,對敵人造成傷害(削減這場戰鬥剩餘時間 ${pct}%)`;
}
