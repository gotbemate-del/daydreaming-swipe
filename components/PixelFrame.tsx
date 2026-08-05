import type { ReactNode } from 'react';
import { Image, StyleSheet, View, type ViewStyle } from 'react-native';

// 像素外框(9-slice)。`assets/sprites/ui/frames/` 有現成的四角 + 四邊,中間是空的,
// 所以底色由使用端自己給——同一組框可以套在深色面板與稍亮的面板上。
//
// ## 四邊一定要用 View 包起來,不能直接把 Image 絕對定位
//
// 直覺寫法是 `<Image style={{position:'absolute', left:CORNER, right:CORNER}}>`,
// 但 **RN 的 Image 只給 left/right 不會被拉寬**——它用原圖的寬度(63px)畫完就停,
// 上邊只有靠左三分之一有東西,框看起來像斷掉。`resizeMode` 換成 repeat 或 stretch 都救不了,
// 因為問題出在「框多寬」而不是「圖怎麼填」。
//
// 解法是外面包一層 View(View 吃 left/right),Image 在裡面填 100%。
// 這樣 stretch 才有東西可以拉——邊條的花紋沿著長邊接近均勻,拉開看不太出來。
//
// ## 為什麼不套在閘門上
//
// 閘門一排兩個、畫面上同時有好幾排,套上去等於每一格多 8 張圖(一排 16 張、四排 64 張),
// 而且閘門的重點是**一眼分辨好壞**——現在靠的是綠框/紅框,換成同一組像素框就得
// 另外想辦法標好壞。框是給「面板」用的,不是給跑道上的互動物件用的。

/** 角落畫多大。46x46 的來源縮到這個尺寸,四個角一致。 */
const CORNER = 20;
/** 邊條多厚。照來源的比例(18/46)換算,不然邊跟角接不起來。 */
const EDGE = Math.round(CORNER * (18 / 46));

const ART = {
  tl: require('../assets/sprites/ui/frames/popup_corner_tl.png'),
  tr: require('../assets/sprites/ui/frames/popup_corner_tr.png'),
  bl: require('../assets/sprites/ui/frames/popup_corner_bl.png'),
  br: require('../assets/sprites/ui/frames/popup_corner_br.png'),
  top: require('../assets/sprites/ui/frames/popup_edge_top.png'),
  bottom: require('../assets/sprites/ui/frames/popup_edge_bottom.png'),
  left: require('../assets/sprites/ui/frames/popup_edge_left.png'),
  right: require('../assets/sprites/ui/frames/popup_edge_right.png'),
};

interface Props {
  children: ReactNode;
  /** 面板底色。框中間是透明的,所以底色一定要給,不然會看到後面的東西。 */
  background?: string;
  style?: ViewStyle;
  /** 內容離框多遠。預設剛好讓內容不會壓到角落的花紋。 */
  padding?: number;
}

export function PixelFrame({ children, background = '#2a2a35', style, padding = CORNER }: Props) {
  return (
    <View style={[styles.wrapper, style]}>
      {/* 底色鋪在框裡面(內縮半個邊),不然深色底會蓋掉框本身的花紋 */}
      <View style={[styles.fill, { backgroundColor: background }]} pointerEvents="none" />

      <View style={[styles.edgeTop, { height: EDGE }]} pointerEvents="none">
        <Image source={ART.top} resizeMode="stretch" style={styles.stretch} />
      </View>
      <View style={[styles.edgeBottom, { height: EDGE }]} pointerEvents="none">
        <Image source={ART.bottom} resizeMode="stretch" style={styles.stretch} />
      </View>
      <View style={[styles.edgeLeft, { width: EDGE }]} pointerEvents="none">
        <Image source={ART.left} resizeMode="stretch" style={styles.stretch} />
      </View>
      <View style={[styles.edgeRight, { width: EDGE }]} pointerEvents="none">
        <Image source={ART.right} resizeMode="stretch" style={styles.stretch} />
      </View>

      <Image source={ART.tl} style={[styles.corner, { top: 0, left: 0 }]} />
      <Image source={ART.tr} style={[styles.corner, { top: 0, right: 0 }]} />
      <Image source={ART.bl} style={[styles.corner, { bottom: 0, left: 0 }]} />
      <Image source={ART.br} style={[styles.corner, { bottom: 0, right: 0 }]} />

      <View style={{ padding }}>{children}</View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { position: 'relative' },
  // 底色內縮到邊條裡面,不然它會蓋掉框本身的花紋。
  fill: { position: 'absolute', left: EDGE - 1, right: EDGE - 1, top: EDGE - 1, bottom: EDGE - 1 },
  corner: { position: 'absolute', width: CORNER, height: CORNER },
  stretch: { width: '100%', height: '100%' },
  // 四邊各自從角落之後開始鋪,所以邊與角不會互相蓋住。
  edgeTop: { position: 'absolute', top: 0, left: CORNER, right: CORNER },
  edgeBottom: { position: 'absolute', bottom: 0, left: CORNER, right: CORNER },
  edgeLeft: { position: 'absolute', left: 0, top: CORNER, bottom: CORNER },
  edgeRight: { position: 'absolute', right: 0, top: CORNER, bottom: CORNER },
});
