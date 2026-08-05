// 存檔驗證。要證明的只有一件事:**不管硬碟上那串字是什麼,遊戲都進得去。**
//
// 存檔在 web 上就是 localStorage,玩家改得動、擴充套件改得動、寫到一半斷電也會壞。
// 所以這裡的每一項都是「餵一份壞掉的東西進去,看它有沒有安靜地退回合法狀態」——
// 丟例外就等於白畫面,而白畫面在 web 上意味著玩家再也進不去,連清存檔的入口都沒有。

import {
  DEFAULT_SAVE, newSave, readSave, writeSave, SAVE_VERSION, TOTAL_STAGES, type SaveData,
} from '../game/save';
import { MAX_SKILL_BOOK_LEVEL } from '../game/laneRunSkills';
import { MAX_SKILL_LEVEL, MAX_SKILL_SLOTS } from '../game/laneSkills';

let fail = 0;
const check = (name: string, cond: boolean, extra = '') => {
  console.log(`${cond ? 'PASS' : 'FAIL'}  ${name}${extra ? '  ' + extra : ''}`);
  if (!cond) fail++;
};

// --- 全新玩家 ---
check('沒有存檔 -> 預設值', readSave(null).save.stage === 1 && readSave(null).save.coins === 0);
check('空字串 -> 預設值', readSave('').save.stage === 1);
check('newSave 不會共用同一個陣列(改一份不會污染另一份)', (() => {
  const a = newSave();
  a.skills.push({ id: 'forge', level: 1 });
  return newSave().skills.length === 0 && DEFAULT_SAVE.skills.length === 0;
})());

// --- 來回一趟要一模一樣 ---
const full: SaveData = {
  version: SAVE_VERSION,
  stage: 137,
  job: { archetype: 'magicRanged', branch: 'B', tier: 3 },
  skills: [{ id: 'forge', level: 5 }, { id: 'toughen', level: 2 }],
  coins: 98765,
  books: 3,
  bestSurvival: 42,
};
const round = readSave(writeSave(full)).save;
check('存進去再讀回來一模一樣', JSON.stringify(round) === JSON.stringify(full), JSON.stringify(round));
check('讀回一份現行版本的存檔不算遷移', readSave(writeSave(full)).migrated === false);

// --- 壞掉的東西 ---
// 每一項的重點都是「不丟例外」而且「退回合法值」。
const survives = (label: string, text: string, expect: (s: SaveData) => boolean) => {
  let result: SaveData | null = null;
  let threw = false;
  try {
    result = readSave(text).save;
  } catch {
    threw = true;
  }
  check(label, !threw && result !== null && expect(result), threw ? '丟了例外' : JSON.stringify(result));
};

survives('壞掉的 JSON -> 預設值', '{not json at all', (s) => s.stage === 1);
survives('存了一個陣列 -> 預設值', '[1,2,3]', (s) => s.stage === 1);
survives('存了 null -> 預設值', 'null', (s) => s.stage === 1);
survives('存了一個數字 -> 預設值', '42', (s) => s.stage === 1);
survives('整份是空物件 -> 每個欄位各自退回預設值',
  '{}', (s) => s.stage === 1 && s.job === null && s.skills.length === 0 && s.coins === 0);

// 單一欄位壞掉**不能拖垮整份**——一個手滑的 coins 欄位不該讓玩家失去 300 關的進度。
survives('只有 coins 壞掉,關卡照樣留著',
  JSON.stringify({ version: 1, stage: 250, coins: 'lots', job: null, skills: [] }),
  (s) => s.stage === 250 && s.coins === 0);
survives('只有 job 壞掉,關卡照樣留著',
  JSON.stringify({ version: 1, stage: 250, coins: 10, job: { archetype: '駭客', branch: 'Z' }, skills: [] }),
  (s) => s.stage === 250 && s.job === null);

// --- 改過的存檔要被夾回合法範圍 ---
survives('關卡被改超過總關卡數 -> 夾到上限',
  JSON.stringify({ version: 1, stage: 999999 }), (s) => s.stage === TOTAL_STAGES);
survives('關卡被改成 0 或負數 -> 夾回第 1 關',
  JSON.stringify({ version: 1, stage: -5 }), (s) => s.stage === 1);
survives('關卡被改成小數 -> 取整',
  JSON.stringify({ version: 1, stage: 12.9 }), (s) => s.stage === 12);
// Infinity 不是「很大的數字」,是壞掉的數字(JSON.parse 把 1e999 讀成 Infinity),
// 所以退回預設值而不是夾到上限——夾到上限等於承認它是一個合法的進度。
survives('關卡被改成 Infinity -> 退回第 1 關(不是夾到上限)',
  '{"version":1,"stage":1e999}', (s) => s.stage === 1);
survives('金幣被改成負數 -> 夾回 0',
  JSON.stringify({ version: 1, coins: -100 }), (s) => s.coins === 0);
survives('職業階級被改超過 5 階 -> 夾回 5',
  JSON.stringify({ version: 1, job: { archetype: 'magicMelee', branch: 'A', tier: 99 } }),
  (s) => s.job?.tier === 5);
survives('職業分支只認得 A/B',
  JSON.stringify({ version: 1, job: { archetype: 'magicMelee', branch: 'X', tier: 2 } }),
  (s) => s.job?.branch === 'A');

// 技能是最值得改的地方(直接等於戰力),三種手法都要擋。
survives('技能等級被改超過上限 -> 夾回上限',
  JSON.stringify({ version: 1, skills: [{ id: 'forge', level: 999 }] }),
  (s) => s.skills[0].level === MAX_SKILL_LEVEL);
survives('不存在的技能 id -> 直接丟掉',
  JSON.stringify({ version: 1, skills: [{ id: 'godmode', level: 5 }, { id: 'forge', level: 2 }] }),
  (s) => s.skills.length === 1 && s.skills[0].id === 'forge');
survives('塞超過格數的技能 -> 只留前幾個',
  JSON.stringify({
    version: 1,
    skills: [
      { id: 'forge', level: 5 }, { id: 'reinforce', level: 5 },
      { id: 'toughen', level: 5 }, { id: 'craft', level: 5 },
    ],
  }),
  (s) => s.skills.length === MAX_SKILL_SLOTS);
// 同一個 id 出現兩次:skillLevel 只讀第一個,重複的那個會變成看不見的幽靈,
// 但它在 skillOffers 那邊會佔掉一個格子——症狀是「選項變少了」而且完全查不出原因。
survives('同一個技能出現兩次 -> 只留一個',
  JSON.stringify({ version: 1, skills: [{ id: 'forge', level: 1 }, { id: 'forge', level: 5 }] }),
  (s) => s.skills.length === 1 && s.skills[0].level === 1);
survives('技能是 0 級 -> 當成沒學',
  JSON.stringify({ version: 1, skills: [{ id: 'forge', level: 0 }] }), (s) => s.skills.length === 0);
survives('技能欄位不是陣列 -> 空的',
  JSON.stringify({ version: 1, skills: 'forge' }), (s) => s.skills.length === 0);

survives('技能書被改超過上限 -> 夾回上限',
  JSON.stringify({ version: 2, books: 999 }), (s) => s.books === MAX_SKILL_BOOK_LEVEL);
survives('技能書是負數 -> 夾回 0',
  JSON.stringify({ version: 2, books: -3 }), (s) => s.books === 0);

// --- 版本與遷移 ---
// CLAUDE.md:改動存檔結構要附遷移邏輯,並模擬一次「舊存檔載入」。
// v0 = 這款正式格式之前的那些(沒有 version 欄位)。欄位名稱對得上的要留著。
// v1 存檔:上一版正式格式,沒有 books / bestSurvival(生存模式那時還不存在)。
const v1 = JSON.stringify({ version: 1, stage: 88, coins: 500, job: null, skills: [{ id: 'craft', level: 2 }] });
const fromV1 = readSave(v1);
check('v1 存檔升到 v2 之後進度全留著,新欄位補 0',
  fromV1.save.stage === 88 && fromV1.save.coins === 500 && fromV1.save.skills[0]?.level === 2
  && fromV1.save.books === 0 && fromV1.save.bestSurvival === 0 && fromV1.save.version === SAVE_VERSION,
  JSON.stringify(fromV1.save));
check('v1 存檔會回報 migrated', fromV1.migrated === true);
check('v1 升上來之後再讀一次就穩定了', readSave(writeSave(fromV1.save)).migrated === false);

const v0 = JSON.stringify({ stage: 42, coins: 3000, skills: [{ id: 'forge', level: 3 }] });
const fromV0 = readSave(v0);
check('舊存檔(沒有 version 欄位)載入後保留得住進度',
  fromV0.save.stage === 42 && fromV0.save.coins === 3000 && fromV0.save.skills[0]?.level === 3,
  JSON.stringify(fromV0.save));
check('舊存檔載入後版本會被補成現行版本', fromV0.save.version === SAVE_VERSION);
check('舊存檔載入會回報 migrated(呼叫端才知道要立刻寫回去)', fromV0.migrated === true);
check('壞掉的存檔也會回報 migrated(才不會每次開遊戲都重跑一次)', readSave('{oops').migrated === true);

// 比程式新的存檔不要硬吃:欄位意義可能已經改了,照著讀會產生「看起來正常但其實錯了」的進度。
const future = JSON.stringify({ version: SAVE_VERSION + 5, stage: 999, coins: 1 });
check('比程式還新的存檔 -> 整份重來,而不是硬讀',
  readSave(future).save.stage === 1 && readSave(future).migrated === true);

// 遷移完的結果必須是**現行版本**,不然下次開遊戲又會遷移一次(無限迴圈的溫床)。
check('遷移的結果一定是現行版本',
  [v0, '{}', '{"version":0}', future].every((t) => readSave(t).save.version === SAVE_VERSION));
// 讀→寫→讀 要穩定下來:第二次讀不該再回報 migrated,不然每次開遊戲都會多寫一次硬碟。
check('遷移過的存檔寫回去之後就穩定了(不會每次開遊戲都再遷移一次)',
  readSave(writeSave(readSave(v0).save)).migrated === false);

console.log(fail === 0 ? '\n全部通過' : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
