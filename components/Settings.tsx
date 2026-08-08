import { Pressable, StyleSheet, Text, View } from 'react-native';

import { PixelFrame } from './PixelFrame';
import { VolumeSlider } from './VolumeSlider';
import { playSfx } from '../hooks/useSfx';

/**
 * 設定面板。從右上角的齒輪打開,蓋在畫面上。
 *
 * 主介面與跑圖中共用同一個面板,差別只在 `paused`:
 *   - 主介面:標題就是「設定」,關掉之後回到原畫面。
 *   - 跑圖中:**面板打開的時候跑圖是停住的**(見 LaneRunner 的 settingsOpen),
 *     所以標題要明講「已暫停」,而關閉鈕要寫「繼續」——玩家在中場打開設定,
 *     最想知道的是「我按下去之後會不會突然被怪撞上」。
 *
 * 為什麼音樂有開關又有滑桿:靜音是要能立刻復原的動作(旁邊有人講話),
 * 音量是偏好。合成一個數字的話,為了暫時靜音把滑桿拉到 0 之後,
 * 想開回來只能憑記憶找原本的位置(見 game/save.ts 的欄位註解)。
 */

export interface AudioSettings {
  bgmOff: boolean;
  bgmVolume: number;
  sfxVolume: number;
}

interface Props {
  audio: AudioSettings;
  onChangeAudio: (patch: Partial<AudioSettings>) => void;
  onClose: () => void;
  /** 打開這個面板的同時跑圖停住了沒。只影響文字,暫停本身由呼叫端負責。 */
  paused?: boolean;
}

export function Settings({ audio, onChangeAudio, onClose, paused = false }: Props) {
  return (
    <View style={styles.overlay}>
      <PixelFrame style={styles.card}>
        <View style={styles.inner}>
          <Text style={styles.title}>{paused ? '已暫停' : '設定'}</Text>
          {paused && <Text style={styles.subtitle}>跑圖停在原地,按「繼續」再開始</Text>}

          <View style={styles.row}>
            <View style={styles.rowText}>
              <Text style={styles.rowName}>背景音樂</Text>
              <Text style={styles.rowHint}>循環播放,關掉之後會記住</Text>
            </View>
            <Pressable
              accessibilityLabel={`背景音樂 ${audio.bgmOff ? '關' : '開'}`}
              style={[styles.switch, !audio.bgmOff && styles.switchOn]}
              onPress={() => {
                // 先發聲再改狀態:關掉音樂的那一下仍然聽得到回饋(音效跟音樂是兩條)。
                playSfx('click');
                onChangeAudio({ bgmOff: !audio.bgmOff });
              }}
            >
              <Text style={[styles.switchLabel, !audio.bgmOff && styles.switchLabelOn]}>
                {audio.bgmOff ? '關' : '開'}
              </Text>
            </Pressable>
          </View>

          <VolumeSlider
            label="音樂音量"
            testLabel="音樂音量"
            value={audio.bgmVolume}
            disabled={audio.bgmOff}
            onChange={(v) => onChangeAudio({ bgmVolume: v })}
          />

          <VolumeSlider
            label="音效音量"
            testLabel="音效音量"
            value={audio.sfxVolume}
            onChange={(v) => {
              onChangeAudio({ sfxVolume: v });
              // 拖到哪裡就用那個音量試聽一下,不然玩家調完完全不知道自己調到多大。
              // 放在 onChange 而不是放開手才響:滑桿是切成 20 格的,一格才響一次。
              playSfx('click');
            }}
          />

          <Pressable
            style={styles.close}
            accessibilityLabel={paused ? '繼續' : '關閉設定'}
            onPress={() => {
              playSfx('click');
              onClose();
            }}
          >
            <Text style={styles.closeLabel}>{paused ? '繼續' : '關閉'}</Text>
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
    // 不要整片黑:底下的畫面是「我現在在哪」的資訊。
    backgroundColor: '#16161cd0',
    zIndex: 60,
  },
  card: { minWidth: 260, maxWidth: '88%' },
  inner: { gap: 12, alignSelf: 'stretch' },
  title: { color: '#e0a95c', fontSize: 18, fontWeight: '700', textAlign: 'center' },
  subtitle: { color: '#8a8a95', fontSize: 11, textAlign: 'center', marginTop: -8 },
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
