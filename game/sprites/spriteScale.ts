// 共用的最近鄰放大:把既有形狀(已經是驗證過辨識度沒問題的圖案)整張放大 factor 倍,
// 用來配合勇者本體密度提升(64x56)後,武器/裝備圖示也要跟著拉高密度,但不重新設計形狀。
export function upscaleFrame(frame: string[], factor: number): string[] {
  const scaled: string[] = [];
  for (const row of frame) {
    let scaledRow = '';
    for (const ch of row) scaledRow += ch.repeat(factor);
    for (let i = 0; i < factor; i++) scaled.push(scaledRow);
  }
  return scaled;
}
