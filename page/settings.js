import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { push, replace } from "@zos/router";
import { onKey, offKey, KEY_EVENT_CLICK } from "@zos/interaction";
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from "../utils/config/storage.js";
import { WatchApi } from "../utils/watch-api";
import { STORAGE_KEYS, WEBSITE_URL, NORMAL_COLOR, PRESSED_COLOR } from "../utils/config/constants.js";
import { width } from "../utils/config/device.js";
import { TITLE, SECONDARY_BUTTON_HEIGHT } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");
const vibrator = new Vibrator();

/**
 * Каждое действие — секция "описание сверху, короткая кнопка снизу": описание
 * объясняет что произойдёт, кнопка несёт только сам тап-таргет (1-2 слова).
 * Экран не проверяет STORAGE_KEYS.LINKED — флаг может быть устаревшим, каждое
 * действие ниже безопасно и само себя корректирует независимо от его значения.
 */
const UI = {
  padX: px(28),
  topY: px(120),

  descSize: px(22),

  btnH: SECONDARY_BUTTON_HEIGHT, //px(72),   
  btnRadius: btnH / 2, //px(36),
  btnTextSize: px(28),

  gapDescToBtn: px(16),
  gapBetweenSections: px(40),
  bottomPad: px(80),
};

function measureText(text, size, textWidth) {
  return hmUI.getTextLayout(text, {
    text_size: size,
    text_width: textWidth,
    wrapped: 1,
  });
}

function hapticSoft() {
  vibrator.stop();
  vibrator.start(23);
  setTimeout(() => vibrator.stop(), 80);
}

Page(
  BasePage({
    state: {
      busy: false, // защита от параллельных Unlink (Refresh не делает запрос с этого экрана)
    },
    widgets: {
      title: null,
    },

    build() {
      logger.log(`SETTINGS.JS`);
      this.layout = this.createLayout();
      this.buildTitle();
      this.renderActions();
      this.initKeyNavigation();
    },

    // page/collection.js открывает этот экран через replace() (см. его openSettings()),
    // поэтому под Settings ничего не осталось на паузе — стандартное аппаратное "назад"
    // увело бы мимо Коллекции на то, что было под ней. Перехватываем любую физическую
    // кнопку и сами явно возвращаем на page/collection (без флага обновления — обычный
    // холодный рендер из кеша, тот же результат, что увидел бы пользователь при resume).
    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;
          logger.log("Settings: hardware back, returning to collection");
          replace({ url: "page/collection" });
          return true;
        },
      });
    },

    createLayout() {
      const startX = px(40);
      const startY = px(130);
      const buttonHeight = px(126);
      const spacing = px(25);
      const buttonWidth = width - (2 * startX);

      return { startX, startY, buttonHeight, spacing, buttonWidth };
    },

    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE(this.layout, i18n("settings") || "Settings"),
      });
    },

    renderActions() {
      const contentW = width - UI.padX * 2;

      const actions = [
        {
          descKey: "settings_action_refresh_desc",
          labelKey: "settings_action_refresh_title",
          normalColor: 0x2c2c2c,
          pressColor: 0x424242,
          onActivate: () => this.refreshCollection(),
        },
        {
          descKey: "settings_action_mint_desc",
          labelKey: "settings_action_mint_title",
          normalColor: 0x1f8ed6,
          pressColor: 0x156fa8,
          onActivate: () => this.openMint(),
        },
        {
          descKey: "settings_action_unlink_desc",
          labelKey: "settings_action_unlink_title",
          normalColor: 0x8f2d2d,
          pressColor: 0x6e2222,
          onActivate: () => this.unlinkWallet(),
        },
      ];

      let y = UI.topY;
      actions.forEach((action, index) => {
        y = this.buildActionSection(y, contentW, action, index === actions.length - 1);
      });
    },

    // Описание — сверху (объясняет действие), кнопка — снизу с коротким лейблом.
    buildActionSection(y, contentW, action, isLast) {
      const desc = i18n(action.descKey);
      const label = i18n(action.labelKey);
      const descLayout = measureText(desc, UI.descSize, contentW);

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: UI.padX,
        y,
        w: contentW,
        h: descLayout.height,
        color: 0xc7c7c7,
        text_size: UI.descSize,
        text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.TOP,
        text: desc,
      });
      y += descLayout.height + UI.gapDescToBtn;

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: UI.padX,
        y,
        w: contentW,
        h: UI.btnH,
        radius: UI.btnRadius,
        normal_color: NORMAL_COLOR, //action.normalColor,
        press_color: PRESSED_COLOR, //action.pressColor,
        text: label,
        text_size: UI.btnTextSize,
        color: 0xffffff,
        click_func: () => {
          hapticSoft();
          action.onActivate();
        },
      });
      y += UI.btnH;
      y += isLast ? UI.bottomPad : UI.gapBetweenSections;

      return y;
    },

    // Сеть здесь не трогаем: у ZeppOS Page нет onResume/onPause (см. спеку §6) —
    // возврат через back() к уже живому инстансу page/collection.js не выполнит
    // там вообще никакой код. Поэтому пересоздаём страницу через replace(): это
    // гарантированно прогоняет build() заново, а он видит флаг и сам вызывает
    // getCollection() (настоящий сетевой запрос, не чтение из local storage) —
    // с тем же loading-анимации циклом, что и обычная холодная загрузка.
    refreshCollection() {
      logger.log("Settings: requesting collection refresh");
      AppStorage.setRecord(STORAGE_KEYS.COLLECTION_REFRESH, true);
      replace({ url: "page/collection" });
    },

    openMint() {
      logger.log("Settings: open mint QR");
      push({
        url: "page/qr",
        params: JSON.stringify({ url: WEBSITE_URL }),
      });
    },

    unlinkWallet() {
      if (this.state.busy) return;
      this.state.busy = true;
      logger.log("Settings: sending UNLINK request");

      WatchApi.unlink(this)
        .then((data) => {
          this.state.busy = false;
          if (data && data.status === "OK") {
            logger.log("Wallet unlinked, switching to nolink screen");
            AppStorage.setRecord(STORAGE_KEYS.LINKED, false);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, "");
            replace({ url: "page/nolink" });
          } else {
            logger.log("Unlink error from phone:", data && data.status);
          }
        })
        .catch((err) => {
          this.state.busy = false;
          logger.log("Network/BLE error:", err);
        });
    },

    onDestroy() {
      offKey();
      vibrator.stop();
    },
  })
);
