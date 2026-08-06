import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PixelFrame } from './PixelFrame';

// 設定面板。從主介面右上角的「設定」打開,蓋在畫面上。
//
// 目前只有一項(背景音樂),但**做成面板而不是一顆裸的開關**是有理由的:
// 之後還會有音效、震動、畫質那類東西,一顆一顆往右上角塞會把標題列擠爆,
// 而且玩家找設定的直覺就是「右上角那顆齒輪」——先把那個位置留出來。
//
// 沒有齒輪圖示:`assets/sprites/ui/` 裡沒有,而圖示鐵則禁止拿 emoji 頂替
// (見 CLAUDE.md)。文字「設定」在這個尺寸下反而更好認。

interface Props {
  bgmOff: boolean;
  onToggleBgm: () => void;
  onClose: () => void;
}

export function Settings({ bgmOff, onToggleBgm, onClose }: Props) {
  return (
    <View style={styles.overlay}>
      <PixelFrame style={styles.card}>
        <View style={styles.inner}>
          <Text style={styles.title}>設定</Text>

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>背景音樂</Text>
              <Text style={styles.rowHint}>循環播放,關掉之後會記住</Text>
            </View>
            <Pressable
              accessibilityLabel={`背景音樂 ${bgmOff ? '關' : '開'}`}
              style={[styles.switch, !bgmOff && styles.switchOn]}
              onPress={onToggleBgm}
            >
              <Text style={[styles.switchLabel, !bgmOff && styles.switchLabelOn]}>
                {bgmOff ? '關' : '開'}
              </Text>
            </Pressable>
          </View>

          <Pressable style={styles.close} accessibilityLabel="關閉設定" onPress={onClose}>
            <Text style={styles.closeLabel}>關閉</Text>
          </Pressable>
        </View>
      </PixelFrame>
    </View>
  );
}

const styles = StyleSheet.create({
  overlay: {
    position: 'absolute',
    left: 0, right: 0, top: 0, bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    // 不要整片黑:底下的主介面是「我現在在哪」的資訊。
    backgroundColor: '#16161cd0',
    zIndex: 60,
  },
  card: { minWidth: 260, maxWidth: '88%' },
  inner: { gap: 12, alignSelf: 'stretch' },
  title: { color: '#e0a95c', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  rowText: { flex: 1, gap: 2 },
  rowName: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
  rowHint: { color: '#8a8a95', fontSize: 11 },
  switch: {
    width: 52, paddingVertical: 7, borderRadius: 8, alignItems: 'center',
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  switchOn: { backgroundColor: '#e0a95c', borderColor: '#e0a95c' },
  switchLabel: { color: '#8a8a95', fontSize: 14, fontWeight: '700' },
  switchLabelOn: { color: '#16161c' },
  close: {
    alignSelf: 'stretch', paddingVertical: 11, borderRadius: 10,
    backgroundColor: '#3a3448', alignItems: 'center',
  },
  closeLabel: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },
});
