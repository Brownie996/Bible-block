
import { Language } from '../types';

export const lang_en = {
  menu_title: "Bible Blocks",
  menu_subtitle: "Verses Puzzle Challenge",
  menu_record: "Eternal Record",
  btn_continue: "CONTINUE",
  btn_new_game: "NEW GAME",
  hud_high: "High",
  hud_score: "Score",
  hud_combo: "Combo",
  victory_title: "Scripture Revealed!",
  game_over_title: "Faith Tested",
  game_over_final_score: "Final Score",
  game_over_new_record: "New Personal Record!",
  btn_try_again: "TRY AGAIN",
  btn_main_menu: "Main Menu",
  btn_rotate: "Rotate Block",
  btn_confirm: "Confirm Place",
  btn_home: "Home Menu",
};

export const lang_zh = {
  menu_title: "聖經方塊",
  menu_subtitle: "經文拼圖挑戰",
  menu_record: "最高紀錄",
  btn_continue: "繼續遊戲",
  btn_new_game: "開始新局",
  hud_high: "最高",
  hud_score: "分數",
  hud_combo: "連擊",
  victory_title: "經文已顯現！",
  game_over_title: "信心考驗",
  game_over_final_score: "最終分數",
  game_over_new_record: "創下個人新紀錄！",
  btn_try_again: "再試一次",
  btn_main_menu: "返回主選單",
  btn_rotate: "旋轉方塊",
  btn_confirm: "確認放置",
  btn_home: "主選單",
};

export const getTranslation = (lang: Language) => {
  return lang === 'en' ? lang_en : lang_zh;
};
