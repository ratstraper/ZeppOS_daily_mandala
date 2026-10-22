import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { getDeviceInfo } from "@zos/device";
import { push } from '@zos/router';
import { scrollTo } from '@zos/page';
import AppStorage from "../utils/config/storage.js";
import { WatchApi } from "../utils/watch-api";
import { PRACTICE_NORMAL_COLOR, PRACTICE_PRESSED_COLOR, TITLE } from "zosLoader:./index.[pf].layout.js";
import { WEBSITE_URL, PRACTICE_SHOW, STORAGE_KEYS, CTA } from "../utils/config/constants.js";

const logger = Logger.getLogger("practice_screen");
const { width, height } = getDeviceInfo();

const DEEP_PRACTICE = [
  {
    titleKey: "deep_practice_slide1_title",
    textKey: "deep_practice_slide1_text",
    label: "deep_practice_slide1_action",
  },
  {
    titleKey: "deep_practice_slide2_title",
    textKey: "deep_practice_slide2_text",
    label: "label_next",
  },
  {
    titleKey: "deep_practice_slide3_title",
    textKey: "deep_practice_slide3_text",
    label: "label_next",
  },
  {
    titleKey: "deep_practice_slide4_title",
    textKey: "deep_practice_slide4_text",
    label: "deep_practice_slide4_action",
  },
  {
    titleKey: "deep_practice_slide5_title",
    textKey: "deep_practice_slide5_text",
    action: {
      labelKey: "deep_practice_slide5_action",
      url: WEBSITE_URL,
      full: true,
      ref: "deep_practice",
    },
  },
];

const STROKE_COLOR_FOCUSED = 0x5CBAFF;
const STROKE_COLOR_UNFOCUSED = 0x1F3A52;

Page(
  BasePage({
    state: {
      selectedIndex: 0,
      progress: {
        streak: 0,
        best: 0,
        doneToday: false,
        isNextDay: false,
      },
    },

    widgets: {
      title: null,
      idleGroup: null,
      bgRect: null,
      btnBorder: null,
      progressText: null,
      statusText: null,
      helpImg: null,
    },

    onInit() {
      this.refreshState();
    },

    build() {
      logger.log(`PRACTICE.JS`);
      this.layout = this.createLayout();
      this.buildTitle();
      this.buildIdleGroup();

      this.refreshProgress();
      this.initKeyNavigation();
    },

    refreshState() {
      const { streak, best, isNextDay, isSameDay } = AppStorage.getPracticeDays();
      this.state.progress = {
        streak: streak,
        best: best,
        doneToday: isSameDay,
        isNextDay: isNextDay,
      };
      logger.log(`Refreshed progress: ${streak} days, best: ${best}, doneToday: ${isSameDay}`);
    },

    createLayout() {
      const btnY = px(150);
      const btnHeight = px(160);
      const helpHeight = px(104);
      const progressY = btnY + btnHeight + px(26);
      const statusY = progressY + px(42);
      const helpY = statusY + px(54);
      return { btnY, btnHeight, progressY, statusY, helpY, helpHeight };
    },

    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE(this.layout, i18n("practice") || "Practice"),
      });
    },

    buildIdleGroup() {
      this.widgets.idleGroup = hmUI.createWidget(hmUI.widget.GROUP, { x: 0, y: 0, w: width, h: height });

      const { btnY, btnHeight } = this.layout;
      const btnX = px(20), btnWidth = width - px(40), btnRadius = px(80);

      this.widgets.btnBorder = this.widgets.idleGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: btnX - px(4), y: btnY - px(4), w: btnWidth + px(8), h: btnHeight + px(8),
        color: STROKE_COLOR_UNFOCUSED, radius: btnRadius + px(4)
      });

      this.widgets.bgRect = this.widgets.idleGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: btnX, y: btnY, w: btnWidth, h: btnHeight,
        color: PRACTICE_NORMAL_COLOR, radius: btnRadius
      });

      const iconSize = px(80);
      this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
        x: btnX + px(40), y: btnY + (btnHeight - iconSize) / 2,
        w: iconSize, h: iconSize, src: 'icons/open.png'
      });

      this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: btnX + px(140), y: btnY + px(30), w: btnWidth - px(160), h: px(60),
        color: 0xffffff, text_size: px(48), align_v: hmUI.align.CENTER_V, text: i18n("open")
      });

      this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: btnX + px(140), y: btnY + px(85), w: btnWidth - px(160), h: px(40),
        color: 0xffffff, text_size: px(30), align_v: hmUI.align.CENTER_V, text: i18n("practice_subtitle")
      });

      const clickArea = this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
        x: btnX, y: btnY, w: btnWidth, h: btnHeight, src: ''
      });

      clickArea.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, PRACTICE_PRESSED_COLOR);
        this.state.selectedIndex = -1; this.syncFocus();
      });
      clickArea.addEventListener(hmUI.event.MOVE, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, PRACTICE_NORMAL_COLOR);
      });
      clickArea.addEventListener(hmUI.event.CLICK_UP, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, PRACTICE_NORMAL_COLOR);
        this.handleOpenClick();
      });

      this.widgets.progressText = this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: px(40), y: this.layout.progressY, w: width - px(80), h: px(32), color: 0xbdbdbd,
        text_size: px(28), align_h: hmUI.align.CENTER_H, text: "",
      });

      this.widgets.statusText = this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: px(40), y: this.layout.statusY, w: width - px(80), h: px(32), color: 0x8f8f8f,
        text_size: px(24), align_h: hmUI.align.CENTER_H, text: "",
      });

      // Кнопка всегда отображается как Help (иконка question_64*), но по
      // смыслу теперь ведёт в DEEP_PRACTICE — счётчик открытий для этого
      // больше не нужен, кнопка Go deeper как отдельный виджет удалена.
      this.widgets.helpImg = this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
        x: (width - px(64)) / 2, y: this.layout.helpY, w: px(64), h: px(104), src: "icons/question_64bw.png",
      });

      this.widgets.helpImg.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.state.selectedIndex = 1; this.syncFocus();
      });
      this.widgets.helpImg.addEventListener(hmUI.event.MOVE, () => {
        this.state.selectedIndex = -1; this.syncFocus();
      });
      this.widgets.helpImg.addEventListener(hmUI.event.CLICK_UP, () => {
        this.state.selectedIndex = -1; this.syncFocus(); this.openDeep();
      });
    },

    setHelpSelected(selected) {
      this.widgets.helpImg.setProperty(hmUI.prop.SRC, selected ? "icons/question_64.png" : "icons/question_64bw.png");
    },

    setButtonSelected(selected) {
      this.widgets.btnBorder.setProperty(hmUI.prop.COLOR, selected ? STROKE_COLOR_FOCUSED : STROKE_COLOR_UNFOCUSED);
    },

    getProgressText() {
      return `${i18n("streak")} ${this.state.progress.streak} · ${i18n("best")} ${this.state.progress.best}`;
    },

    getStatusText() {
      return this.state.progress.doneToday ? i18n("done_today") : i18n("not_yet_today");
    },

    refreshProgress() {
      this.widgets.progressText.setProperty(hmUI.prop.TEXT, this.getProgressText());
      this.widgets.statusText.setProperty(hmUI.prop.TEXT, this.getStatusText());
    },

    handleOpenClick() {
      logger.log("Open clicked, navigating to show screen");
      const mandalaDay = AppStorage.getMandalaDayString();
      const local = AppStorage.getRecord(STORAGE_KEYS.MANDALA_DAY) == mandalaDay;
      push({
        url: "page/show",
        params: JSON.stringify({
          day: mandalaDay,
          title: i18n("practice"),
          fromLocalStorage: local,
          type: PRACTICE_SHOW,
        }),
      });
    },

    openDeep() {
      logger.log("Open deep practice help");
      WatchApi.sendCtaEvent(this, CTA.OPEN_DEEPER).catch(() => {});
      push({
        url: "page/help",
        params: JSON.stringify({ slides: DEEP_PRACTICE }),
      });
    },

    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;
          if (key === KEY_DOWN) {
            this.state.selectedIndex = this.state.selectedIndex <= 0 ? 1 : this.state.selectedIndex - 1;
            this.syncFocus();
            this.scrollToSelected();
            return true;
          }
          if (key === KEY_UP) {
            this.state.selectedIndex = this.state.selectedIndex >= 1 ? 0 : this.state.selectedIndex + 1;
            this.syncFocus();
            this.scrollToSelected();
            return true;
          }
          if (key === KEY_SELECT) {
            if (this.state.selectedIndex === 1) {
              this.openDeep();
            } else {
              this.handleOpenClick();
            }
            return true;
          }
          return false;
        },
      });
      this.syncFocus();
    },

    syncFocus() {
      this.setButtonSelected(this.state.selectedIndex === 0);
      this.setHelpSelected(this.state.selectedIndex === 1);
    },

    scrollToSelected() {
      let itemY, itemH;
      if (this.state.selectedIndex === 0) {
        itemY = this.layout.btnY; itemH = this.layout.btnHeight;
      } else {
        itemY = this.layout.helpY; itemH = this.layout.helpHeight;
      }

      let targetY = itemY + itemH / 2 - height / 2;
      if (targetY < 0) targetY = 0;

      scrollTo({ y: -targetY, animConfig: { anim_duration: 250 } });
    },

    onDestroy() {
      offKey();
    },
  })
);