export type BodyType = 'thin' | 'normal' | 'fat';

// 厭世莫蘭迪調色盤,對應 CLAUDE.md「像素美術規格」章節。密度提升(64x56)沒有換色,
// 細節(眉毛/鼻影/領口/手指縫/鞋底線)全部靠既有 8 色的排列組合表現,不新增色碼。
export const HERO_PALETTE: Record<string, string> = {
  K: '#3a3542',
  H: '#7a7488',
  S: '#d9c9b8',
  T: '#8b8698',
  D: '#6b6678',
  B: '#5c5468',
  P: '#4a4456',
  O: '#38323f',
};

const BODY_PRESETS: Record<BodyType, { head: number; body: number }> = {
  thin: { head: 3, body: 2 },
  normal: { head: 4, body: 4 },
  fat: { head: 6, body: 6 },
};

export const PADDED_WIDTH = 64;
const CENTER_LEFT = 31;
const CENTER_RIGHT = 32;

function blankRow(): string[] {
  return new Array(PADDED_WIDTH).fill('.');
}

function buildRow(halfWidth: number, fillChar: string): string[] {
  const cells = blankRow();
  const left = CENTER_LEFT - halfWidth + 1;
  const right = CENTER_RIGHT + halfWidth - 1;
  for (let c = left; c <= right; c++) cells[c] = fillChar;
  return cells;
}

function setCell(cells: string[], index: number, ch: string): void {
  if (index >= 0 && index < cells.length) cells[index] = ch;
}

// 頭髮:寬度逐排變化做出蓬鬆輪廓,峰值只維持 2 排(第 4、5 排),避免變成平頂蘑菇頭。
const HAIR_DELTAS = [-2, -1, 0, 2, 3, 3, 2, 1, -1, -2];

function buildHairRows(headHalfWidth: number): string[][] {
  return HAIR_DELTAS.map((d, i) => {
    const row = buildRow(Math.max(2, headHalfWidth * 2 + d), 'H');
    if (i === 4 || i === 5) {
      setCell(row, CENTER_LEFT - 1, 'K');
      setCell(row, CENTER_RIGHT + 1, 'K');
    }
    return row;
  });
}

// 臉:9 排,眉毛(row2)/眼睛(row3)/鼻影(row5)/嘴巴(row6)用既有色碼點出五官。
const FACE_EYE_ROW_INDEX = 3;
const FACE_PLAIN_ROW_INDEX = 0;

function buildFaceRows(headHalfWidth: number): string[][] {
  const faceHalfWidth = Math.max(6, headHalfWidth * 2 - 2);
  const rows: string[][] = [];
  rows.push(buildRow(faceHalfWidth, 'S'));
  rows.push(buildRow(faceHalfWidth, 'S'));

  const browRow = buildRow(faceHalfWidth, 'S');
  setCell(browRow, CENTER_LEFT - faceHalfWidth + 2, 'K');
  setCell(browRow, CENTER_LEFT - faceHalfWidth + 3, 'K');
  setCell(browRow, CENTER_RIGHT + faceHalfWidth - 3, 'K');
  setCell(browRow, CENTER_RIGHT + faceHalfWidth - 2, 'K');
  rows.push(browRow);

  const eyeRow = buildRow(faceHalfWidth, 'S');
  setCell(eyeRow, CENTER_LEFT - faceHalfWidth + 2, 'K');
  setCell(eyeRow, CENTER_LEFT - faceHalfWidth + 3, 'K');
  setCell(eyeRow, CENTER_RIGHT + faceHalfWidth - 3, 'K');
  setCell(eyeRow, CENTER_RIGHT + faceHalfWidth - 2, 'K');
  rows.push(eyeRow);

  rows.push(buildRow(faceHalfWidth, 'S'));

  const noseRow = buildRow(faceHalfWidth, 'S');
  setCell(noseRow, CENTER_LEFT, 'D');
  setCell(noseRow, CENTER_RIGHT, 'D');
  rows.push(noseRow);

  const mouthRow = buildRow(faceHalfWidth, 'S');
  setCell(mouthRow, CENTER_LEFT - 1, 'K');
  setCell(mouthRow, CENTER_LEFT, 'K');
  setCell(mouthRow, CENTER_RIGHT, 'K');
  setCell(mouthRow, CENTER_RIGHT + 1, 'K');
  rows.push(mouthRow);

  rows.push(buildRow(faceHalfWidth, 'S'));
  rows.push(buildRow(faceHalfWidth, 'S'));
  return rows;
}

// 軀幹+手臂:肩膀比軀幹寬,手臂從肩膀延伸出去,袖口(第5、6排)露出手,領口(第1排)開V字缺角。
function buildTorsoRows(bodyHalfWidth: number): string[][] {
  const shoulderHalfWidth = bodyHalfWidth * 2 + 2;
  const armReach = 6;
  const rows: string[][] = [];

  for (let i = 0; i < 6; i++) {
    const row = buildRow(shoulderHalfWidth, 'T');
    const left = CENTER_LEFT - shoulderHalfWidth + 1;
    const right = CENTER_RIGHT + shoulderHalfWidth - 1;
    if (i === 0) {
      setCell(row, CENTER_LEFT, 'K');
      setCell(row, CENTER_RIGHT, 'K');
    }
    for (let a = 1; a <= armReach; a++) {
      setCell(row, left - a, 'D');
      setCell(row, right + a, 'D');
    }
    if (i >= 4) {
      setCell(row, left - armReach - 1, 'S');
      setCell(row, left - armReach - 2, 'S');
      setCell(row, right + armReach + 1, 'S');
      setCell(row, right + armReach + 2, 'S');
      if (i === 5) {
        setCell(row, left - armReach - 1, 'K');
        setCell(row, right + armReach + 2, 'K');
      }
    }
    rows.push(row);
  }

  rows.push(buildRow(bodyHalfWidth * 2, 'D'), buildRow(bodyHalfWidth * 2, 'D'));
  rows.push(buildRow(bodyHalfWidth * 2, 'T'), buildRow(bodyHalfWidth * 2, 'T'));
  const taperHalfWidth = Math.max(4, bodyHalfWidth * 2 - 2);
  rows.push(buildRow(taperHalfWidth, 'T'), buildRow(taperHalfWidth, 'T'));
  rows.push(buildRow(taperHalfWidth, 'B'), buildRow(taperHalfWidth, 'B'));
  return rows;
}

// 雙腳:真正分成兩條腿(中間留縫),鞋底(最後一排)用 K 畫出分色鞋底線。
function buildLegRows(bodyHalfWidth: number): string[][] {
  const legHalfWidth = Math.max(4, bodyHalfWidth * 2 - 2);
  const legGap = 2;

  function legRow(ch: string): string[] {
    const cells = blankRow();
    const leftFrom = CENTER_LEFT - legHalfWidth + 1;
    const leftTo = CENTER_LEFT - legGap;
    const rightFrom = CENTER_RIGHT + legGap;
    const rightTo = CENTER_RIGHT + legHalfWidth - 1;
    for (let c = leftFrom; c <= leftTo; c++) cells[c] = ch;
    for (let c = rightFrom; c <= rightTo; c++) cells[c] = ch;
    return cells;
  }

  const rows: string[][] = [];
  for (let i = 0; i < 8; i++) rows.push(legRow('P'));
  for (let i = 0; i < 4; i++) rows.push(legRow('O'));
  const soleRow = legRow('O');
  for (let c = 0; c < PADDED_WIDTH; c++) if (soleRow[c] === 'O') soleRow[c] = 'K';
  rows.push(soleRow);
  return rows;
}

function buildSilhouette(headHalfWidth: number, bodyHalfWidth: number): string[] {
  const rows: string[][] = [];
  rows.push(blankRow(), blankRow(), blankRow(), blankRow());
  rows.push(...buildHairRows(headHalfWidth));
  rows.push(...buildFaceRows(headHalfWidth));
  rows.push(buildRow(4, 'K'), buildRow(4, 'K'));
  rows.push(...buildTorsoRows(bodyHalfWidth));
  rows.push(...buildLegRows(bodyHalfWidth));
  rows.push(blankRow(), blankRow(), blankRow(), blankRow());
  return rows.map((r) => r.join(''));
}

const HAIR_ROW_OFFSET = 4;
const FACE_ROW_OFFSET = HAIR_ROW_OFFSET + HAIR_DELTAS.length;

function blinkFrame(frame: string[]): string[] {
  const eyeRowIndex = FACE_ROW_OFFSET + FACE_EYE_ROW_INDEX;
  const plainRow = frame[FACE_ROW_OFFSET + FACE_PLAIN_ROW_INDEX];
  return frame.map((row, i) => (i === eyeRowIndex ? plainRow : row));
}

export interface HeroFrames {
  open: string[];
  blink: string[];
}

export function buildHeroFrames(bodyType: BodyType): HeroFrames {
  const preset = BODY_PRESETS[bodyType];
  const open = buildSilhouette(preset.head, preset.body);
  return { open, blink: blinkFrame(open) };
}
