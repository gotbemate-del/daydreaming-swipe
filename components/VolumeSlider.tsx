import { useMemo, useRef, useState } from 'react';
import { PanResponder, StyleSheet, Text, View } from 'react-native';

/**
 * 音量滑桿。
 *
 * ## 為什麼手寫而不是拿現成的
 *
 * RN 核心沒有 slider,而 `@react-native-community/slider` 在 web 上是另一套實作
 *(RNW 沒有對應的原生元件),外觀跟這款的像素風格對不上,而且為了兩條滑桿多裝一個
 * 有平台差異的相依不划算。這裡要的東西很小:一條軌道、一顆把手、按哪裡跳哪裡。
 *
 * ## 為什麼用「絕對位置」而不是 gesture.dx
 *
 * 跑道的拖曳用的是相對位移(從畫面任何地方開始拖都行,見 LaneRunner),但滑桿相反:
 * 玩家的直覺是**按在哪裡就設到哪裡**。用 dx 的話,點軌道左端不會有任何反應
 *(位移是 0),玩家會以為滑桿壞了,只能一格一格慢慢推。
 *
 * `onStartShouldSetPanResponder` 一收下就先設值,所以「點一下」跟「按著拖」是同一條路徑,
 * 不用另外接 onPress。
 *
 * ## 為什麼要 STEPS
 *
 * 連續值會讓「我上次調到多少」變成一個記不住的數字,而且每個像素都觸發一次
 * setState + 一次 `player.volume` 寫入。切成 20 格(每格 5%)之後,顯示的百分比是
 * 整齊的數字,拖動時的重畫次數也降到二十分之一。
 */

/** 切幾格。20 格 = 每格 5%。 */
const STEPS = 20;
const TRACK_HEIGHT = 8;
const KNOB_SIZE = 20;

interface Props {
  label: string;
  /** 0~1。 */
  value: number;
  onChange: (value: number) => void;
  /** 關掉的時候整條變灰(例如音樂被靜音了,音量還在但沒有意義)。 */
  disabled?: boolean;
  /** 給測試用的選取器。文字選取器會選到畫面上其他同字的文字(見 CLAUDE.md)。 */
  testLabel?: string;
}

export function VolumeSlider({ label, value, onChange, disabled = false, testLabel }: Props) {
  const [width, setWidth] = useState(0);
  // ref 而不是 state:PanResponder 是 useMemo 出來的,閉包會抓到建立當下的那一份;
  // 用 state 的話拖到一半量到的永遠是 0(軌道還沒 layout 完的那個值)。
  const widthRef = useRef(0);
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const clamped = Math.min(1, Math.max(0, value));
  const percent = Math.round(clamped * 100);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => !disabledRef.current,
        onMoveShouldSetPanResponder: () => !disabledRef.current,
        onPanResponderGrant: (e, gesture) => {
          // 軌道的左緣在**畫面座標**裡是多少。
          //
          // 不能用 onLayout 的 `layout.x`:那是相對於父層的,而這條滑桿的父層是面板的
          // 內容區、面板又置中在整個畫面上——兩者差了好幾十像素,拿去減 moveX 會讓
          // 算出來的比例整條偏掉(實測拖到 75% 的位置,值直接飽和成 100%)。
          //
          // `gesture.x0 - locationX` 是「按下去那一點的畫面座標」減掉「同一點在軌道內的座標」,
          // 剩下的就是軌道左緣的畫面座標。不必動用 measureInWindow(那是非同步的,
          // 回來的時候手指已經移到別的地方了)。
          trackLeftRef.current = gesture.x0 - e.nativeEvent.locationX;
          setFromX(e.nativeEvent.locationX);
        },
        onPanResponderMove: (_e, gesture) => {
          // 移動事件不能用 locationX:它是「相對於當下命中的那個元素」,拖出軌道之後
          // 那個元素會變成別人(面板、甚至整個畫面),量出來的數字會跳掉。
          setFromX(gesture.moveX - trackLeftRef.current);
        },
      }),
    [],
  );

  const trackLeftRef = useRef(0);

  function setFromX(x: number) {
    const w = widthRef.current;
    if (w <= 0 || disabledRef.current) return;
    const ratio = Math.min(1, Math.max(0, x / w));
    onChangeRef.current(Math.round(ratio * STEPS) / STEPS);
  }

  return (
    <View style={styles.wrapper}>
      <View style={styles.head}>
        <Text style={[styles.label, disabled && styles.dim]}>{label}</Text>
        <Text style={[styles.percent, disabled && styles.dim]}>{percent}%</Text>
      </View>
      <View
        accessibilityLabel={`${testLabel ?? label} ${percent}`}
        // 命中範圍比軌道高(TRACK_HEIGHT 只有 8px,手指按不準)。
        style={styles.hit}
        onLayout={(e) => {
          const w = e.nativeEvent.layout.width;
          widthRef.current = w;
          setWidth(w);
        }}
        {...panResponder.panHandlers}
      >
        <View style={styles.track}>
          <View style={[styles.fill, { width: clamped * width }, disabled && styles.fillDim]} />
        </View>
        <View
          pointerEvents="none"
          style={[
            styles.knob,
            // 把手要夾在軌道內,不然 0% 跟 100% 的時候會有一半凸出去。
            { left: Math.min(width - KNOB_SIZE, Math.max(0, clamped * width - KNOB_SIZE / 2)) },
            disabled && styles.knobDim,
          ]}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { gap: 4, alignSelf: 'stretch' },
  head: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  percent: { color: '#e0a95c', fontSize: 12, fontWeight: '700' },
  dim: { color: '#8a8a95' },
  hit: { height: KNOB_SIZE + 8, justifyContent: 'center' },
  track: {
    height: TRACK_HEIGHT, borderRadius: TRACK_HEIGHT / 2, overflow: 'hidden',
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  fill: { height: '100%', backgroundColor: '#e0a95c' },
  fillDim: { backgroundColor: '#3a3448' },
  knob: {
    position: 'absolute',
    width: KNOB_SIZE, height: KNOB_SIZE, borderRadius: KNOB_SIZE / 2,
    backgroundColor: '#e0a95c', borderWidth: 2, borderColor: '#16161c',
  },
  knobDim: { backgroundColor: '#8a8a95' },
});
