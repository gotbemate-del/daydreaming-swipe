import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';

import {
  bookBonus, bookLevelOf, describeRunSkill, ELEMENT_COUNTERS, ELEMENT_SET_BONUS, ELEMENTS,
  elementOf, hasCooldown, MAX_RUN_SKILL_SLOTS, MAX_SKILL_BOOK_LEVEL,
  RUN_SKILLS, runSkillSpec, skillCooldownSeconds, skillTier,
  type ElementBooks, type RunSkillId,
} from '../game/laneRunSkills';
import { collectionScales, decodeCollection, elementProgress } from '../game/collection';
import { daysUntilElement, elementOfDay } from '../game/dungeons';
import { elementColor, elementLabel } from './artAssets';
import { SkillIcon } from './SkillIcon';
import { PixelFrame } from './PixelFrame';

// 技能分頁。**這裡什麼都不能點著改** —— 它是一頁「我投資了什麼、還有什麼可以投資」。
//
// ## 為什麼這一頁只能看不能操作
//
// 場內技能是**跑完就沒**的東西(每打完一波三選一,下一場從零開始),所以它沒有
// 「配裝」這個動作可以做。真正跨場留下來的只有技能書等級,而那個是副本產的,
// 不是在這一頁點出來的。給它一顆按鈕會讓玩家以為這裡能決定什麼,而他不能。
//
// 那它為什麼還要存在:**玩家在跑圖之外完全看不到這 18 款長什麼樣**。
// 跑圖中的三選一面板一次只露三個、而且畫面同時在動,他沒有時間讀完描述;
// 技能書等級則藏在裝備圖鑑那一頁的屬性列底下。兩樣東西都需要一個安靜的地方攤開來。
//
// ## 為什麼技能書進度跟技能列在同一頁
//
// 它們是同一件事的兩半:技能書放大的就是這 18 款的效果,而且是**逐屬性**的
// (火的書只放大火系三階)。分成兩頁的話玩家要自己把「我練了火的書」跟
// 「火有這三款」連起來,而那正是這一頁該幫他做的事。
//
// ## 相剋環
//
// 環要畫出來,因為押注要成立就得先看得懂:關卡前會公開整關的屬性順序,
// 而玩家要拿那串順序去對照「我該點哪個元素」。背不起來的話那個資訊等於沒給。

interface Props {
  /** 技能書等級,六個元素各自一份。 */
  books: ElementBooks;
  /** 存檔裡的圖鑑字串。圖鑑的屬性加成跟技能書乘在同一個地方,所以一起顯示。 */
  collected: string;
  onDone: () => void;
}

/** 一階顯示「被動」,二三階顯示冷卻秒數——有倒數的就是主動,這是玩家分辨兩者的唯一依據。 */
function kindLabel(id: RunSkillId, level: number): string {
  if (!hasCooldown(id)) return '被動';
  return `主動 · ${skillCooldownSeconds(id, level).toFixed(0)} 秒`;
}

export function Skills({ books, collected, onDone }: Props) {
  const bits = useMemo(() => decodeCollection(collected), [collected]);
  const scales = useMemo(() => collectionScales(bits), [bits]);
  const today = elementOfDay();
  /** 展開哪一族。收起來的時候一頁看得到六族,展開才讀細節。 */
  const [open, setOpen] = useState<RunSkillId | null>(today);

  /**
   * 相剋環的實際順序。**照 ELEMENT_COUNTERS 一路走出來,不能直接用 ELEMENTS。**
   *
   * ELEMENTS 的順序是給別的地方用的(火金雷冰木土),照它排出來會變成
   * 「火 → 金 → 雷 …」,而火剋的其實是雷——畫面等於在教玩家一張錯的相剋表,
   * 而相剋是他每一關開跑前都要拿來對照屬性順序的東西。
   */
  const ring = useMemo(() => {
    const out: RunSkillId[] = [ELEMENTS[0]];
    for (let i = 1; i < ELEMENTS.length; i++) {
      const next = ELEMENT_COUNTERS[out[out.length - 1]];
      if (next === undefined || out.includes(next)) break;
      out.push(next);
    }
    return out;
  }, []);

  return (
    <View style={styles.wrapper}>
      <View style={styles.topBar}>
        <View style={styles.titleBox}>
          <Text style={styles.title}>技能</Text>
          <Text style={styles.subtitle}>
            六元素 x 三階 · 一場最多帶 {MAX_RUN_SKILL_SLOTS} 格,等級沒有上限
          </Text>
        </View>
        <Pressable accessibilityLabel="關閉技能" style={styles.closeButton} onPress={onDone}>
          <Text style={styles.closeLabel}>✕</Text>
        </Pressable>
      </View>

      {/*
        相剋環。**單一閉環**,所以每個元素剛好剋一個、也剛好被一個剋——
        沒有萬用元素也沒有廢元素。畫成一行箭頭而不是六邊形:一行讀得完,
        而玩家真正要回答的問題是「今天這波是土,我該點什麼」,那是查一次表的事。
      */}
      <View style={styles.ringRow}>
        {ring.map((id, i) => (
          <View key={id} style={styles.ringItem}>
            <Text style={[styles.ringText, { color: elementColor(id) }]}>{elementLabel(id)}</Text>
            {/* 最後一個也要有箭頭:它接回開頭,那正是「閉環」的意思。
                少畫這一個的話看起來是一條有頭有尾的鏈,而鏈的兩端會被讀成
                「最強」與「最弱」——那跟「沒有萬用元素也沒有廢元素」正好相反。 */}
            <Text style={styles.ringArrow}>→</Text>
            {i === ring.length - 1 && (
              <Text style={[styles.ringText, { color: elementColor(ring[0]) }]}>{elementLabel(ring[0])}</Text>
            )}
          </View>
        ))}
      </View>

      <ScrollView style={styles.list} contentContainerStyle={styles.listContent}>
        {ELEMENTS.map((el) => {
          const fam = RUN_SKILLS.filter((s) => elementOf(s.id) === el)
            .sort((a, b) => skillTier(a.id) - skillTier(b.id));
          const book = bookLevelOf(books, el);
          const codex = Math.round(((scales[el] ?? 1) - 1) * 100);
          const frag = elementProgress(bits, el);
          const wait = daysUntilElement(el);
          const expanded = open === el;
          // elementColor 對未知 id 回 undefined,而 SkillIcon 要一個確定的顏色。
          // 六個元素都在表裡,所以這個 fallback 只是型別上的保險。
          const color = elementColor(el) ?? '#e0a95c';
          return (
            <PixelFrame key={el} style={styles.card} padding={10}>
              <View style={styles.cardBody}>
                <Pressable
                  accessibilityLabel={`技能族 ${elementLabel(el)}`}
                  onPress={() => setOpen(expanded ? null : el)}
                >
                  <View style={styles.famHead}>
                    <Text style={[styles.famName, { color }]}>{elementLabel(el)}</Text>
                    <Text style={styles.famCounter}>
                      剋 {elementLabel(ELEMENT_COUNTERS[el]!)}
                    </Text>
                    {/* 今天能不能練這一族的書。這是玩家每天回來第一個要找的資訊。 */}
                    <Text style={wait === 0 ? styles.famToday : styles.famWait}>
                      {wait === 0 ? '今天可練' : `${wait} 天後`}
                    </Text>
                  </View>

                  {/*
                    兩條進度都畫出來:技能書與圖鑑是**乘在同一個地方**的兩層,
                    只寫其中一條的話玩家會以為另一條沒有用。
                  */}
                  <View style={styles.barRow}>
                    <Text style={styles.barLabel}>技能書</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[styles.barFill, { width: `${(book / MAX_SKILL_BOOK_LEVEL) * 100}%`, backgroundColor: color }]}
                      />
                    </View>
                    <Text style={styles.barValue}>
                      {book}/{MAX_SKILL_BOOK_LEVEL} · +{Math.round(bookBonus(book) * 100)}%
                    </Text>
                  </View>
                  <View style={styles.barRow}>
                    <Text style={styles.barLabel}>圖鑑</Text>
                    <View style={styles.barTrack}>
                      <View
                        style={[styles.barFill, { width: `${Math.min(100, (frag.got / Math.max(1, frag.total)) * 100)}%`, backgroundColor: '#5ec26a' }]}
                      />
                    </View>
                    <Text style={styles.barValue}>{frag.got}/{frag.total} · +{codex}%</Text>
                  </View>
                </Pressable>

                {expanded && (
                  <View style={styles.famBody}>
                    {fam.map((spec) => (
                      <View key={spec.id} style={styles.skillRow}>
                        <SkillIcon id={spec.id} color={color} size={30} />
                        <View style={styles.skillText}>
                          <Text style={styles.skillName}>
                            {spec.name}
                            <Text style={styles.skillKind}>  {kindLabel(spec.id, 1)}</Text>
                          </Text>
                          {/* 描述用 1 級的,不是滿級的:玩家在跑圖裡第一次看到它就是 1 級,
                              兩邊寫的不一樣會讓他以為自己記錯了。 */}
                          <Text style={styles.skillDesc}>{describeRunSkill({ id: spec.id, level: 1 })}</Text>
                        </View>
                      </View>
                    ))}
                    <Text style={styles.setBonus}>
                      集齊這一族的三階 → 主動傷害 +{Math.round(ELEMENT_SET_BONUS * 100)}%
                    </Text>
                  </View>
                )}
              </View>
            </PixelFrame>
          );
        })}

        <Text style={styles.footer}>
          場內技能跑完就沒:每打完一波三選一,只在那一場有效。
          跨場留下來的是技能書與圖鑑,它們放大這 18 款的效果。
        </Text>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: { width: '100%', maxWidth: 520, flex: 1, gap: 6 },
  topBar: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  titleBox: { flexShrink: 1 },
  title: { color: '#e0a95c', fontSize: 18, fontWeight: '700' },
  subtitle: { color: '#8a8a95', fontSize: 11 },
  closeButton: {
    paddingHorizontal: 10, paddingVertical: 5, borderRadius: 6,
    backgroundColor: '#2a2a35', borderWidth: 1, borderColor: '#3a3448',
  },
  closeLabel: { color: '#f2f2f2', fontSize: 14, fontWeight: '700' },

  // 相剋環一行。字做小,六個元素 + 五個箭頭要在 375 寬的手機上排得下。
  ringRow: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', flexWrap: 'wrap',
    gap: 2, paddingVertical: 2,
  },
  ringItem: { flexDirection: 'row', alignItems: 'center', gap: 2 },
  ringText: { fontSize: 12, fontWeight: '700' },
  ringArrow: { color: '#5a5a66', fontSize: 11 },
  ringNote: { color: '#8a8a95', fontSize: 10, marginLeft: 4 },

  list: { flex: 1, width: '100%' },
  listContent: { gap: 6, paddingBottom: 12 },
  card: { width: '100%' },
  cardBody: { gap: 4 },

  famHead: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  famName: { fontSize: 15, fontWeight: '700' },
  famCounter: { color: '#8a8a95', fontSize: 11, flex: 1 },
  famToday: { color: '#5ec26a', fontSize: 11, fontWeight: '700' },
  famWait: { color: '#5a5a66', fontSize: 11 },

  barRow: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  barLabel: { color: '#8a8a95', fontSize: 10, width: 36 },
  barTrack: { flex: 1, height: 5, borderRadius: 3, backgroundColor: '#2a2a35', overflow: 'hidden' },
  barFill: { height: '100%' },
  barValue: { color: '#9691a5', fontSize: 10, minWidth: 92, textAlign: 'right' },

  famBody: { gap: 6, marginTop: 4, borderTopWidth: 1, borderTopColor: '#3a3448', paddingTop: 6 },
  skillRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 8 },
  skillText: { flex: 1 },
  skillName: { color: '#f2f2f2', fontSize: 13, fontWeight: '700' },
  skillKind: { color: '#8a8a95', fontSize: 10, fontWeight: '400' },
  skillDesc: { color: '#9691a5', fontSize: 11, lineHeight: 15 },
  setBonus: { color: '#e0a95c', fontSize: 11, marginTop: 2 },

  footer: { color: '#5a5a66', fontSize: 11, lineHeight: 16, paddingHorizontal: 4, paddingTop: 4 },
});
