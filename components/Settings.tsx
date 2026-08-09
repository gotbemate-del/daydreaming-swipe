import { useState } from 'react';
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
  /**
   * 重新再來 / 放棄遊戲。**只有跑圖中才給**(主介面沒有「這一場」可以重來或放棄)。
   *
   * 兩顆都會把當下這一場丟掉,所以各自要按兩次:第一次把字換成「再按一次」,
   * 第二次才真的執行。這裡刻意不另外開一個確認視窗——面板已經蓋在跑道上了,
   * 再疊一層會變成「面板上的面板」,而且小螢幕上塞不下。
   */
  onRestart?: () => void;
  onQuit?: () => void;
  /** 生存模式:重來是整輪重來(不是這一關重來),文字要講清楚。 */
  survival?: boolean;
  /**
   * 重置存檔。**只有主介面才給**(跑圖中重置等於在一場進行中的遊戲底下把地板抽掉)。
   *
   * 跟另外兩顆一樣要按兩次,而且它是這個面板裡最不可逆的一顆——關卡、金幣、技能書、
   * 圖鑑、轉職全部歸零,所以排在最後面。
   */
  onResetSave?: () => void;
}

export function Settings({
  audio, onChangeAudio, onClose, paused = false, onRestart, onQuit, survival = false, onResetSave,
}: Props) {
  /** 哪一顆正在等第二次確認。同時只會有一顆,按另一顆會把前一顆的確認狀態取消。 */
  const [confirming, setConfirming] = useState<'restart' | 'quit' | 'reset' | null>(null);

  const danger = (
    kind: 'restart' | 'quit' | 'reset',
    label: string,
    hint: string,
    run: () => void,
  ) => (
    <Pressable
      accessibilityLabel={confirming === kind ? `${label} 再按一次確認` : label}
      style={[styles.danger, confirming === kind && styles.dangerArmed]}
      onPress={() => {
        playSfx('click');
        if (confirming === kind) { run(); return; }
        setConfirming(kind);
      }}
    >
      <Text style={[styles.dangerLabel, confirming === kind && styles.dangerLabelArmed]}>
        {confirming === kind ? '再按一次確認' : label}
      </Text>
      <Text style={[styles.dangerHint, confirming === kind && styles.dangerLabelArmed]}>
        {confirming === kind ? hint : ''}
      </Text>
    </Pressable>
  );

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
              setConfirming(null);
              onClose();
            }}
          >
            <Text style={styles.closeLabel}>{paused ? '繼續' : '關閉'}</Text>
          </Pressable>

          {/* 兩顆危險操作排在「繼續」下面:玩家打開這個面板九成是要暫停或調音量,
              把丟掉整場的按鈕放在最後才不會手滑按到。 */}
          {paused && onRestart && (
            danger('restart', '重新再來',
              survival ? '整輪從頭開始,累計波數歸零' : '這一關從頭開始',
              onRestart)
          )}
          {paused && onQuit && (
            danger('quit', '放棄遊戲',
              survival ? '結束這一輪並看結算' : '回主介面,這一關不算過',
              onQuit)
          )}
          {/*
            重置存檔。**只有主介面給**(paused = false):跑圖中重置等於在進行中的一場
            底下把地板抽掉,而那一場的狀態全部活在 LaneRunner 這個實例裡。
            排在最後一顆,理由跟另外兩顆一樣——玩家打開這個面板九成是要調音量。
          */}
          {!paused && onResetSave && (
            danger('reset', '重置存檔', '關卡 / 金幣 / 技能書 / 圖鑑 / 轉職全部歸零',
              onResetSave)
          )}
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
  // 危險操作:平常是暗底描邊(看得到但不搶眼),等確認的時候才轉成危險紅。
  danger: {
    alignSelf: 'stretch', paddingVertical: 9, borderRadius: 10, alignItems: 'center',
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#e0505060',
  },
  dangerArmed: { backgroundColor: '#e05050', borderColor: '#e05050' },
  dangerLabel: { color: '#e05050', fontSize: 13, fontWeight: '700' },
  dangerLabelArmed: { color: '#16161c' },
  dangerHint: { color: '#16161c', fontSize: 10 },
});
