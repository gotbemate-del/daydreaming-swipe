import { Platform, StyleSheet, Text, View } from 'react-native';

/**
 * 畫面最上方的廣告版位。
 *
 * 現在只是一個「佔著高度的空框」,還沒接任何廣告聯播網。先做版位不是拖延,而是因為
 * **高度必須先被佔住**:跑道是寫死 500px 的絕對定位版面(components/LaneRunner.tsx 的
 * bottomYFor 全部依賴它),之後才把廣告塞進來的話,整個畫面會往下擠、頭頂的結算線會跑掉。
 * 先留位子,之後接 SDK 只是把這個元件裡面填掉,版面不會再動一次。
 *
 * 之後要接的時候:
 *   - 網頁(AdSense):在這裡插入 <ins class="adsbygoogle"> 與對應的 script。
 *     前提是自己的網域 + 根目錄的 ads.txt,github.io 子網域過不了審核。
 *   - App(AdMob):用 react-native-google-mobile-ads 的 <BannerAd />。
 *     要 EAS Build 出原生版,Expo Go 跑不動,而且它在 web 上不會渲染。
 *     不要用 expo-ads-admob,那個從 SDK 46 就移除了。
 * 兩邊共用這一個元件、用 Platform.OS 分岔,遊戲邏輯(game/)完全不需要知道有廣告這件事。
 *
 * 版位規則(這是政策問題,不是美感問題):
 *   1. 廣告與跑道之間一定要留 AD_SLOT_GAP 的距離。緊貼著拖曳區會產生誤點,
 *      AdMob 對「意外點擊」抓得很嚴,帳號可能直接被停。
 *   2. 廣告不能蓋在跑道上,也不能跟著遊戲一起移動。
 *   3. 沒有廣告可播的時候仍然佔著同樣高度——版面不能跳。
 */

/** 標準手機橫幅高度(320x50)。改這個數字之前先確認跑道還放得下,見下方的版面預算。 */
export const AD_SLOT_HEIGHT = 50;
/** 廣告與遊戲區之間的安全距離,防誤點用。 */
export const AD_SLOT_GAP = 10;

/**
 * 空版位要不要畫出可見的外框。接上真的廣告之前留著,才看得出位子在哪;
 * 上線前把這個改成 false,就會變成一塊看不見但仍然佔住高度的保留區。
 */
const SHOW_PLACEHOLDER = true;

interface Props {
  /** 想換成大橫幅(320x100)之類的尺寸時覆寫 */
  height?: number;
}

export function AdSlot({ height = AD_SLOT_HEIGHT }: Props) {
  return (
    <View style={[styles.slot, { height }]} pointerEvents="none">
      {SHOW_PLACEHOLDER && (
        <Text style={styles.label}>廣告版位 {Platform.OS === 'web' ? 'AdSense' : 'AdMob'} · {height}px</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    width: '100%',
    maxWidth: 380,
    alignSelf: 'center',
    marginBottom: AD_SLOT_GAP,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#3a3448',
    backgroundColor: '#2a2a3540',
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: { color: '#8a8a95', fontSize: 11 },
});
