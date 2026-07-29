import { useEffect, useState } from 'react';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import { jobTitle, type LaneJob } from '../game/laneJobs';
import { COIN_ICON, HERO_ASPECT, HERO_FRAMES, jobHeroArt, LOCK_ICON, TAB_ICONS } from './artAssets';

// 主介面。每一場闖關的起點與終點——通關或陣亡都回到這裡,再自己按下一次「開始闖關」。
//
// 版面沿用姊妹作的骨架(上方狀態列、中間立繪、下方分頁列),但**只有中間那塊是活的**:
// 分頁列的十個功能(裝備/背包/技能/轉職/寵物/副本/商店/工坊/成就/轉生)目前全部未開放,
// 點下去只回一句提示。這是刻意的——這些系統的資料層雖然都搬進來了(game/equipment.ts 有
// 5668 件裝備),但它們的加成是為掛機設計的(speed 縮短戰鬥時間、exp 給經驗值),
// 直接接上來會違反 CLAUDE.md 的鐵則:speed 對應到跑速就等於「花錢買慢速」,
// 而經驗值系統這一款根本不打算要。要接得先重新定義加成對應到什麼,那是另一件事。
//
// 為什麼分頁列現在就畫出來而不是等功能做好:玩家要看得到「之後還有東西」,
// 而且版面高度先佔住,之後開放時不會整個畫面重排(那是最容易把按鈕擠出畫面的改動)。

/** 立繪高度。要夠大才有「這是我的角色」的份量,但不能大到把開始按鈕擠出畫面。 */
const HERO_HEIGHT = 190;
const HERO_WIDTH = Math.round(HERO_HEIGHT * HERO_ASPECT);

const BLINK_SEQUENCE = [0, 0, 0, 0, 0, 0, 0, 0, 1, 2, 1];
const BLINK_MS = 160;

/** 分頁圖示的邊長。一列五個,390 寬的手機上剛好不擠。 */
const TAB_SIZE = 34;

interface Props {
  stage: number;
  job: LaneJob;
  coins: number;
  /** 上一場的結果。第一次進來是 null,之後回到主介面時顯示「通關了/倒下了」。 */
  lastResult: 'cleared' | 'dead' | null;
  onStart: () => void;
}

export function MainMenu({ stage, job, coins, lastResult, onStart }: Props) {
  const [blinkStep, setBlinkStep] = useState(0);
  const [notice, setNotice] = useState<string | null>(null);
  const heroArt = job === null ? HERO_FRAMES[BLINK_SEQUENCE[blinkStep]] : jobHeroArt(job.archetype, job.branch, job.tier);

  useEffect(() => {
    const id = setInterval(() => setBlinkStep((s) => (s + 1) % BLINK_SEQUENCE.length), BLINK_MS);
    return () => clearInterval(id);
  }, []);

  // 提示自己消失。不做的話玩家連點幾個分頁,最後一句會一直留在畫面上像壞掉了。
  useEffect(() => {
    if (notice === null) return;
    const id = setTimeout(() => setNotice(null), 1600);
    return () => clearTimeout(id);
  }, [notice]);

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <Text style={styles.title}>滑動勇者</Text>
        <View style={styles.coinBox}>
          <Image source={COIN_ICON} resizeMode="contain" style={styles.coinIcon} />
          <Text style={styles.coinText}>{coins}</Text>
        </View>
      </View>

      <Text style={styles.jobLine}>{jobTitle(job)}</Text>

      {/* 中間:勇者站在正中央。這裡刻意什麼都不做——沒有跑道、沒有敵人,
          就是一個站著的角色 + 一顆開始闖關。戰鬥全部發生在跑道畫面裡。 */}
      <View style={styles.stage}>
        <View style={styles.ground} />
        <Image
          source={heroArt}
          resizeMode="contain"
          style={[styles.hero, { width: HERO_WIDTH, height: HERO_HEIGHT }]}
        />
      </View>

      <View style={styles.resultRow}>
        {lastResult !== null && (
          <Text style={lastResult === 'cleared' ? styles.resultWin : styles.resultLose}>
            {lastResult === 'cleared' ? `第 ${stage - 1} 關通關` : `第 ${stage} 關失敗,再挑戰一次`}
          </Text>
        )}
      </View>

      <Pressable style={styles.startButton} accessibilityLabel="開始闖關" onPress={onStart}>
        <Text style={styles.startLabel}>開始闖關</Text>
        <Text style={styles.startSub}>第 {stage} 關</Text>
      </Pressable>

      {/* 提示列的高度固定佔著,有沒有訊息都一樣高——不然點分頁時整個版面會上下跳。 */}
      <View style={styles.noticeRow}>
        {notice !== null && <Text style={styles.noticeText}>{notice}</Text>}
      </View>

      {/* style 與 contentContainerStyle 是兩回事,這裡兩個都要給:
          - style 沒有 width:'100%' 的話,ScrollView 會撐成內容寬(10 個分頁約 640),
            再被外層的 alignItems:'center' 置中 → 頭尾各溢出螢幕一段,而且是**捲不到**的
            (捲動範圍是內容 vs 容器,容器本身就已經比螢幕寬了)。實測 375 寬只看得到第 3~8 個。
          - flexGrow:0 是因為它在 column flex 裡會把剩下的高度全部吃掉,
            畫面下方就多出一大塊點不到的空白。 */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.tabBarScroll}
        contentContainerStyle={styles.tabBar}
      >
        {TAB_ICONS.map((tab) => (
          <Pressable
            key={tab.id}
            style={styles.tab}
            accessibilityLabel={`${tab.label}(未開放)`}
            onPress={() => setNotice(`${tab.label}尚未開放`)}
          >
            <View style={styles.tabIconBox}>
              <Image source={tab.art} resizeMode="contain" style={styles.tabIcon} />
              <Image source={LOCK_ICON} resizeMode="contain" style={styles.tabLock} />
            </View>
            <Text style={styles.tabLabel}>{tab.label}</Text>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, alignItems: 'center', gap: 6 },
  topBar: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  title: { color: '#e0a95c', fontSize: 20, fontWeight: '700' },
  coinBox: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  coinIcon: { width: 16, height: 16 },
  coinText: { color: '#f2f2f2', fontSize: 14, fontWeight: '600' },
  jobLine: { color: '#8a8a95', fontSize: 13 },

  // 立繪區吃掉剩下的高度。用 flex 而不是固定高:小螢幕自己縮,不會把下面的按鈕頂出畫面——
  // 這是這個專案踩過最痛的一個坑(見 CLAUDE.md「版面」那段)。
  stage: {
    width: '100%',
    flex: 1,
    minHeight: 150,
    alignItems: 'center',
    justifyContent: 'flex-end',
    backgroundColor: '#1d1d26',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2a2a35',
    overflow: 'hidden',
  },
  ground: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 34,
    backgroundColor: '#22301f',
    borderTopWidth: 1,
    borderTopColor: '#3d4a33',
  },
  hero: { marginBottom: 10 },
  // 像素圖不做平滑,放大之後才是硬邊的像素而不是糊掉的插值
  pixelArt: {},

  resultRow: { height: 18, justifyContent: 'center' },
  resultWin: { color: '#5ec26a', fontSize: 13, fontWeight: '600' },
  resultLose: { color: '#e05050', fontSize: 13, fontWeight: '600' },

  startButton: {
    width: '100%',
    backgroundColor: '#e0a95c',
    borderRadius: 10,
    paddingVertical: 12,
    alignItems: 'center',
  },
  startLabel: { color: '#16161c', fontSize: 18, fontWeight: '700' },
  startSub: { color: '#4a3a20', fontSize: 12, marginTop: 2 },

  noticeRow: { height: 18, justifyContent: 'center' },
  noticeText: { color: '#9691a5', fontSize: 12 },

  tabBarScroll: { width: '100%', flexGrow: 0 },
  tabBar: { flexDirection: 'row', gap: 12, paddingHorizontal: 4, alignItems: 'flex-start' },
  tab: { alignItems: 'center', width: 52, gap: 2 },
  tabIconBox: { width: TAB_SIZE, height: TAB_SIZE, opacity: 0.45 },
  tabIcon: { width: TAB_SIZE, height: TAB_SIZE },
  // 鎖頭壓在圖示右下角。不用 opacity 壓掉,鎖頭本身要看得清楚才讀得出「這是鎖住的」。
  tabLock: { position: 'absolute', right: -2, bottom: -2, width: 15, height: 15, opacity: 1 },
  tabLabel: { color: '#8a8a95', fontSize: 10 },
});
