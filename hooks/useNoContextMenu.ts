import { useEffect } from 'react';
import { Platform } from 'react-native';

/**
 * 網頁版:把「右鍵選單」與「長按選單」關掉。
 *
 * ## 為什麼需要
 *
 * 這款唯一的操作是**把勇者按著往左右拖**,而且一排只有一兩秒可以決定。瀏覽器的預設行為
 * 剛好跟它衝突,兩種都會在拖到一半的時候把玩家的手打掉:
 *
 *   - **桌機右鍵**:拖曳中不小心按到右鍵(或用右鍵起手),系統選單直接蓋在跑道上。
 *     選單蓋住的正是前方那一排閘門,而閘門不會等人——玩家關掉選單的時候那一排已經結算完了。
 *   - **手機長按**:拖之前手指會先按住不動一下,Android/iOS 的瀏覽器把它判成長按,
 *     跳出「複製 / 分享 / 搜尋圖片」。跑道整片都是 <img>(底圖、勇者、怪),
 *     所以長按幾乎必中,而且選單一出來,那一次的拖曳就等於沒發生。
 *
 * ## 為什麼掛在 app 層而不是 LaneRunner
 *
 * 跟 useBgm 同一個理由:LaneRunner 每一關都換 key 重新掛載(生存模式是一關接一關),
 * 掛在裡面等於每一關拆一次再裝一次監聽器,而**交棒的那 900ms 之間是沒有防護的**——
 * 玩家在過場的時候按著螢幕不放,選單照樣跳出來。掛在這一層就跨得過主介面 / 跑圖 / 圖鑑。
 *
 * ## 為什麼連 user-select 一起關
 *
 * 光擋 contextmenu 擋不掉「拖過去把畫面上的文字反白」——反白之後手指離開,
 * 瀏覽器會跳出自己的一排「複製 / 全選」按鈕,症狀跟長按選單一模一樣。
 * 而這個畫面上沒有任何一段文字是要給玩家複製的(HUD 的數字每 33ms 就變一次)。
 */
export function useNoContextMenu(): void {
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;

    const block = (e: Event) => e.preventDefault();
    document.addEventListener('contextmenu', block);

    // 用一張 <style> 而不是直接寫 body.style:touch-callout / user-select 都要帶
    // -webkit- 前綴才對 iOS Safari 生效,而 element.style 對不認得的屬性是靜靜地忽略,
    // 寫下去看起來成功、實際沒有任何效果(RNW 的 filter 就是這樣騙過我們一次,見 CLAUDE.md)。
    const style = document.createElement('style');
    style.textContent = `
      html, body, #root {
        -webkit-touch-callout: none;
        -webkit-user-select: none;
        user-select: none;
        -webkit-tap-highlight-color: transparent;
      }
    `;
    document.head.appendChild(style);

    return () => {
      document.removeEventListener('contextmenu', block);
      style.remove();
    };
  }, []);
}
