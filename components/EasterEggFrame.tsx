import { Image, View } from 'react-native';

import { EASTEREGG_FRAME } from './artAssets';

/**
 * 彩蛋框:兩根雕花柱子 + 上下卷軸。素材是既有的 `ui/frames/easteregg` 那八片。
 *
 * ## 為什麼不用既有的 PixelFrame
 *
 * PixelFrame 是「面板」的框(四角 + 四邊,方方正正),它的工作是把一段內容框起來讓人讀。
 * 這一個框的工作剛好相反——**它自己就是內容的一部分**:柱子上有國王、旗幟、寶石,
 * 玩家點史萊姆翻出來的那一張圖要配得上這個框才像「彩蛋」而不是「一張圖」。
 *
 * ## 為什麼每一片都寫死寬高
 *
 * `Image` 的 `resizeMode="stretch"` **不會被 `left:0 + right:0` 撐開**——react-native-web
 * 是用 background-size 實作 resizeMode 的,而「左右都釘住」在它眼裡不構成一個確定的寬度
 *(CLAUDE.md 記過:閘門的卷軸圖因此只鋪了一半,而且完全沒有警告)。
 * 所以這裡每一片都自己算出像素寬高,柱身與卷軸都用**重複貼**而不是拉伸。
 */

/** 素材的原始尺寸(柱子 83 寬、卷軸 80 寬)。 */
const SRC = {
  pillarW: 83,
  pillarTop: 82,
  pillarMid: 42,
  pillarBottom: 30,
  edgeW: 80,
  edgeTop: 45,
  edgeBottom: 27,
};

interface Props {
  /** 整個框的寬(含柱子)。 */
  width: number;
  /** 中間內容區的高。上下卷軸畫在它的外面。 */
  height: number;
  /** 縮放:0.42 大約等於柱子 35px 寬,配 240px 寬的圖剛好。 */
  scale?: number;
  children?: React.ReactNode;
}

export function EasterEggFrame({ width, height, scale = 0.42, children }: Props) {
  const pw = Math.round(SRC.pillarW * scale);
  const top = Math.round(SRC.pillarTop * scale);
  const mid = Math.round(SRC.pillarMid * scale);
  const bottom = Math.round(SRC.pillarBottom * scale);
  const ew = Math.round(SRC.edgeW * scale);
  const eTop = Math.round(SRC.edgeTop * scale);
  const eBottom = Math.round(SRC.edgeBottom * scale);

  const inner = Math.max(0, width - pw * 2);
  const edgeCount = Math.max(1, Math.ceil(inner / ew));
  // 柱身用幾片:扣掉頭尾之後照 mid 的高度補滿,寧可多一片(超出的部分被 overflow 裁掉)。
  const midCount = Math.max(1, Math.ceil((height - top - bottom) / mid));
  const total = height;

  const pillar = (side: 'L' | 'R') => (
    <View style={{ width: pw, height: total, overflow: 'hidden' }}>
      <Image
        source={EASTEREGG_FRAME[`pillar${side}_top`]}
        style={{ width: pw, height: top }}
        resizeMode="stretch"
      />
      {Array.from({ length: midCount }, (_, i) => (
        <Image
          key={i}
          source={EASTEREGG_FRAME[`pillar${side}_mid`]}
          style={{ width: pw, height: mid }}
          resizeMode="stretch"
        />
      ))}
      <Image
        source={EASTEREGG_FRAME[`pillar${side}_bottom`]}
        style={{ width: pw, height: bottom }}
        resizeMode="stretch"
      />
    </View>
  );

  const edge = (which: 'edge_top' | 'edge_bottom') => (
    <View style={{ flexDirection: 'row', width: inner, height: which === 'edge_top' ? eTop : eBottom, overflow: 'hidden' }}>
      {Array.from({ length: edgeCount }, (_, i) => (
        <Image
          key={i}
          source={EASTEREGG_FRAME[which]}
          style={{ width: ew, height: which === 'edge_top' ? eTop : eBottom }}
          resizeMode="stretch"
        />
      ))}
    </View>
  );

  return (
    <View style={{ flexDirection: 'row', width, height: total }}>
      {pillar('L')}
      <View style={{ width: inner, height: total }}>
        {edge('edge_top')}
        {/*
          內容區。**用 flex 撐滿,不要讓內容自己決定大小**——彩蛋圖要填滿整個框
          (畫框裡留一圈黑邊看起來像圖沒載完),所以這裡給的是一個確定的方框,
          圖用 `cover` 去填它(見 MainMenu)。
        */}
        <View style={{ flex: 1, alignSelf: 'stretch', overflow: 'hidden' }}>
          {children}
        </View>
        {edge('edge_bottom')}
      </View>
      {pillar('R')}
    </View>
  );
}
