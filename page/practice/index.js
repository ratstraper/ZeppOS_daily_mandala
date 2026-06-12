import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { getDeviceInfo } from "@zos/device";
import { Time } from "@zos/sensor";
import { getSystemInfo } from "@zos/settings";
import { push } from '@zos/router';
import { getProfile, GENDER_MALE, GENDER_FEMALE } from "@zos/user";
import AppStorage from "../../utils/config/storage.js";
import LoadingAnimationComponent from "../../utils/components/LoadingAnimationComponent.js";
import * as fs from "@zos/fs";
import {
  setPageBrightTime,
  resetPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from "@zos/display";

import { NORMAL_COLOR, PRESSED_COLOR, SELECTED_COLOR } from "zosLoader:./index.[pf].layout.js";
import { WEBSITE_URL, STORAGE_KEYS } from "../../utils/config/constants";

const logger = Logger.getLogger("practice_screen");

const SCREEN_IDLE = "SCREEN_IDLE";
const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

const deviceInfo = getDeviceInfo();
const systemInfo = getSystemInfo() || {};
const profile = getProfile() || {};

const {
  width,
  height,
  screenShape,
  deviceName = "?",
  productId = 0,
  productVer = 0,
  deviceSource = 0,
} = deviceInfo;

const {
  osVersion = "?",
  firmwareVersion = "?",
  sdkVersion = "?",
  minAPI = "?"
} = systemInfo;

const { age, gender, region } = profile;

const platform = `${deviceName}/${osVersion}/${minAPI}, FV:${firmwareVersion}, SDK:${sdkVersion}, ${productId}.${productVer}.${deviceSource}`;
const squareSize = Math.min(width, height) * 1.0;

const SLIDES_PRACTICE = [
  {
    titleKey: "help_practice_slide1_title",
    textKey: "help_practice_slide1_text",
  },
  {
    titleKey: "help_practice_slide2_title",
    textKey: "help_practice_slide2_text",
  },
  {
    titleKey: "help_practice_slide3_title",
    textKey: "help_practice_slide3_text",
    action: {
      labelKey: "help_practice_slide3_action",
      url: WEBSITE_URL,
    },
  },
];

Page(
  BasePage({
    state: {
      screenState: SCREEN_IDLE,
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
      loadingGroup: null,
      resultGroup: null,

      bgRect: null,
      // heroBtn: null,
      playBtnGroup: null,
      progressText: null,
      statusText: null,
      helpImg: null,

      loadingAnim: null,
      loadingText: null,

      mandalaImg: null,
      errorText: null,
    },

    onInit() {
      const { streak, best, isNextDay, isSameDay } = AppStorage.getPracticeDays(new Time());
      this.state.progress = {
        streak: streak,
        best: best,
        doneToday: isSameDay,
        isNextDay: isNextDay,
      };
      Logger.log(`onInit progress: ${streak} days, best: ${best}, isNextDay: ${isNextDay}, isSameDay: ${isSameDay}`);
    },

    build() {
      this.layout = this.createLayout();

      this.widgets.loadingAnim = new LoadingAnimationComponent(hmUI);

      this.buildTitle();
      this.buildIdleGroup();
      this.buildLoadingGroup();
      this.buildResultGroup();

      this.refreshProgress();
      this.setScreenState(SCREEN_IDLE);
      this.initKeyNavigation();
    },

    createLayout() {
      const titleY = px(38);
      const titleH = px(56);

      const heroX = px(40);
      const heroY = px(138);
      const heroW = width - px(80);
      const heroH = px(160);

      const progressY = heroY + heroH + px(26);
      const statusY = progressY + px(42);
      const helpY = statusY + px(54);

      const loadingAnimSize = px(48);
      const loadingAnimX = (width - loadingAnimSize) / 2;
      const loadingAnimY =
        screenShape === 1 ? (height - loadingAnimSize) / 2 - px(36) : px(140);

      const loadingTextY = loadingAnimY + loadingAnimSize + px(22);

      const resultX = (width - squareSize) / 2;
      const resultY =
        screenShape === 1 ? (height - squareSize) / 2 : px(40);

      return {
        titleY,
        titleH,
        heroX,
        heroY,
        heroW,
        heroH,
        progressY,
        statusY,
        helpY,
        loadingAnimX,
        loadingAnimY,
        loadingAnimSize,
        loadingTextY,
        resultX,
        resultY,
      };
    },

    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: this.layout.titleY,
        w: width,
        h: this.layout.titleH,
        color: 0xffffff,
        text_size: px(40),
        text_style: hmUI.text_style.NONE,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text: i18n("practice"),
      });
    },

    buildIdleGroup() {
      this.widgets.idleGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0,
        y: 0,
        w: width,
        h: height,
      });

      // 1. Создаем кнопку
// --- Настройки позиционирования нашей кнопки ---
      const btnX = px(20);
      const btnY = px(150);
      const btnWidth = width - px(40);
      const btnHeight = px(160);
      const btnRadius = px(80); // Строго половина высоты для формы капсулы

      const strokeColor = 0x5CBAFF;

      // 2. Имитация обводки (подложка, которая на 8px больше самой кнопки)
      // Это работает в 100% случаев, в отличие от STROKE_RECT
      this.widgets.idleGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: btnX - px(4), 
        y: btnY - px(4), 
        w: btnWidth + px(8), 
        h: btnHeight + px(8),
        color: strokeColor,
        radius: btnRadius + px(4)
      });

      // 3. Основной фон кнопки
      this.widgets.bgRect = this.widgets.idleGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: btnX,
        y: btnY,
        w: btnWidth,
        h: btnHeight,
        color: NORMAL_COLOR,
        radius: btnRadius
      });

      // 4. Иконка
      const iconSize = px(80);
      this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
        x: btnX + px(40), 
        y: btnY + (btnHeight - iconSize) / 2, // Центрируем по вертикали
        w: iconSize, 
        h: iconSize,
        src: 'icons/open.png'
      });

      // 5. Главный текст
      this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: btnX + px(140), 
        y: btnY + px(30), 
        w: btnWidth - px(160), 
        h: px(60),
        color: 0xffffff, 
        text_size: px(48), 
        align_v: hmUI.align.CENTER_V, 
        text: i18n("open")
      });


      // 6. Дополнительный текст
      const time = new Time();
      let subtitle = "";
      switch(time.getSeconds() % 4) {
        case 0: 
          subtitle = i18n("start_subtitle_0");
          break;
        case 1:
          subtitle = i18n("start_subtitle_1");
          break;
        case 2:
          subtitle = i18n("start_subtitle_2");
          break;
        case 3:
          subtitle = i18n("start_subtitle_3");
          break;
      }
      this.widgets.durationText = this.widgets.idleGroup.createWidget(hmUI.widget.TEXT, {
        x: btnX + px(140), 
        y: btnY + px(85), 
        w: btnWidth - px(160), 
        h: px(40),
        color: 0xffffff, 
        text_size: px(30), 
        align_v: hmUI.align.CENTER_V, 
        text: subtitle
      });

      // 7. ПРОЗРАЧНЫЙ ХИТБОКС (для идеального срабатывания кликов)
      // Так как у нас нет группы, мы кладем пустую картинку поверх всей площади кнопки.
      // Она перехватит нажатия пользователя.
      const clickArea = this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
        x: btnX,
        y: btnY,
        w: btnWidth,
        h: btnHeight,
        src: '' 
      });

      // --- Сенсорная логика ---
      clickArea.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, PRESSED_COLOR);
        this.state.selectedIndex = -1;
        this.syncFocus();
      });

      clickArea.addEventListener(hmUI.event.MOVE, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR); // Отмена, если палец съехал
      });

      clickArea.addEventListener(hmUI.event.CLICK_UP, () => {
        this.widgets.bgRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR);
        this.handleOpenClick();
      });
      ///////////////

      this.widgets.progressText = this.widgets.idleGroup.createWidget(
        hmUI.widget.TEXT,
        {
          x: px(40),
          y: this.layout.progressY,
          w: width - px(80),
          h: px(32),
          color: 0xbdbdbd,
          text_size: px(28),
          text_style: hmUI.text_style.NONE,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text: "",
        }
      );

      this.widgets.statusText = this.widgets.idleGroup.createWidget(
        hmUI.widget.TEXT,
        {
          x: px(40),
          y: this.layout.statusY,
          w: width - px(80),
          h: px(32),
          color: 0x8f8f8f,
          text_size: px(24),
          text_style: hmUI.text_style.NONE,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text: "",
        }
      );

      this.widgets.helpImg = this.widgets.idleGroup.createWidget(
        hmUI.widget.IMG,
        {
          x: (width - px(64)) / 2,
          y: this.layout.helpY,
          w: px(64),
          h: px(104),
          src: "icons/question_64bw.png",
        }
      );

      this.widgets.helpImg.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.setHelpSelected(true);
        this.state.selectedIndex = -1;
        this.syncFocus();
      });

      this.widgets.helpImg.addEventListener(hmUI.event.MOVE, () => {
        this.setHelpSelected(false);
      });

      this.widgets.helpImg.addEventListener(hmUI.event.CLICK_UP, () => {
        this.setHelpSelected(false);
        this.openHelp();
      });
    },

    buildLoadingGroup() {
      this.widgets.loadingGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0,
        y: 0,
        w: width,
        h: height,
      });

      this.widgets.loadingText = this.widgets.loadingGroup.createWidget(
        hmUI.widget.TEXT,
        {
          x: px(48),
          y: this.layout.loadingTextY,
          w: width - px(96),
          h: px(72),
          color: 0xbdbdbd,
          text_size: px(24),
          text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text: i18n("loading_mandala"),
        }
      );

      this.setVisible(this.widgets.loadingGroup, false);
    },

    buildResultGroup() {
      this.widgets.resultGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0,
        y: 0,
        w: width,
        h: height,
      });

      this.widgets.mandalaImg = this.widgets.resultGroup.createWidget(
        hmUI.widget.IMG,
        {
          x: this.layout.resultX,
          y: this.layout.resultY,
          w: squareSize,
          h: squareSize,
          src: "",
        }
      );

      this.widgets.errorText = this.widgets.resultGroup.createWidget(
        hmUI.widget.TEXT,
        {
          x: px(48),
          y: this.layout.loadingTextY,
          w: width - px(96),
          h: px(90),
          color: 0xbdbdbd,
          text_size: px(24),
          text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H,
          align_v: hmUI.align.CENTER_V,
          text: "",
        }
      );

      this.setVisible(this.widgets.mandalaImg, false);
      this.setVisible(this.widgets.errorText, false);
      this.setVisible(this.widgets.resultGroup, false);
    },

    setVisible(widget, visible) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.VISIBLE, !!visible);
    },

    setText(widget, text) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.TEXT, String(text ?? ""));
    },

    setImage(widget, src) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.MORE, { src });
    },

    setHelpSelected(selected) {
      this.setImage(
        this.widgets.helpImg,
        selected ? "icons/question_64.png" : "icons/question_64bw.png"
      );
    },

    setButtonSelected(selected) {
      this.widgets.bgRect.setProperty(hmUI.prop.COLOR, selected ? SELECTED_COLOR : NORMAL_COLOR);
    },

    getProgressText() {
      return `${i18n("streak")} ${this.state.progress.streak} · ${i18n("best")} ${this.state.progress.best}`;
    },

    getStatusText() {
      return this.state.progress.doneToday ? i18n("done_today") : i18n("not_yet_today");
    },

    refreshProgress() {
      this.setText(this.widgets.progressText, this.getProgressText());
      this.setText(this.widgets.statusText, this.getStatusText());
    },

    setScreenState(nextState, payload = {}) {
      this.state.screenState = nextState;

      const isIdle = nextState === SCREEN_IDLE;
      const isLoading = nextState === SCREEN_LOADING;
      const isResult = nextState === SCREEN_RESULT;
      const isError = nextState === SCREEN_ERROR;

      this.setVisible(this.widgets.idleGroup, isIdle);
      this.setVisible(this.widgets.loadingGroup, isLoading);
      this.setVisible(this.widgets.resultGroup, isResult || isError);

      if (isLoading) {
        this.setVisible(this.widgets.mandalaImg, false);
        this.setVisible(this.widgets.errorText, false);
        this.setVisible(this.widgets.loadingText, true);

        this.widgets.loadingAnim.show(
          this.layout.loadingAnimX,
          this.layout.loadingAnimY,
          this.layout.loadingAnimSize,
          this.layout.loadingAnimSize
        );
        this.keepScreenAwake(true);
        return;
      }

      this.widgets.loadingAnim.delete();

      if (isResult) {
        this.setVisible(this.widgets.mandalaImg, true);
        this.setVisible(this.widgets.errorText, false);
        this.setVisible(this.widgets.loadingText, false);

        if (payload.filePath) {
          this.setImage(this.widgets.mandalaImg, payload.filePath);
        }
        this.keepScreenAwake(true);
        return;
      }

      if (isError) {
        this.setVisible(this.widgets.mandalaImg, false);
        this.setVisible(this.widgets.errorText, true);
        this.setVisible(this.widgets.loadingText, false);
        this.setText(
          this.widgets.errorText,
          payload.message || i18n("err_connection_to_the_phone")
        );
        this.keepScreenAwake(false);
        return;
      }

      this.setVisible(this.widgets.loadingText, false);
      this.setVisible(this.widgets.mandalaImg, false);
      this.setVisible(this.widgets.errorText, false);
      this.keepScreenAwake(false);
    },

    handleOpenClick() {
      if (this.state.screenState === SCREEN_LOADING) return;
      logger.log("Open clicked");
      this.setScreenState(SCREEN_LOADING);
      this.fetchData();
    },

    fetchData() {
      logger.log("Sending GET_MANDALA request");

      const time = new Time();
      const mandalaDay =
        `${time.getDate()}`.padStart(2, "0") +
        `${time.getMonth()}`.padStart(2, "0") +
        `${time.getFullYear()}`;
      const userId = `ZeppOS_${AppStorage.getInstallationId()}`;

      this.request({
        method: "GET_MANDALA",
        day: mandalaDay,
        info: platform,
        size: squareSize,
        age,
        gender:
          gender === GENDER_MALE
            ? "M"
            : gender === GENDER_FEMALE
              ? "F"
              : "U",
        region,
        usr: userId,
      })
        .then((data) => {
          const { result = {}, isEmulatorMode, filePath, fileData } = data;

          if (result !== "Ok") {
            logger.log("Phone returned error:", result);
            this.setScreenState(SCREEN_ERROR, {
              message: i18n("err_connection_to_the_phone"),
            });
            return;
          }

          // if (isEmulatorMode) {
          //   logger.log("Saving file in emulator mode");
          //   const fd = fs.openSync({
          //     path: filePath,
          //     flag: fs.O_RDWR | fs.O_CREAT | fs.O_TRUNC,
          //   });
          //   fs.writeSync({ fd, buffer: fileData });
          //   fs.closeSync({ fd });
          // } else {
            AppStorage.setMandalaData(mandalaDay, filePath);
          // }


          this.state.progress.streak = this.state.progress.doneToday ? this.state.progress.streak : this.state.progress.streak + 1;
          this.state.progress.best = Math.max(this.state.progress.best, this.state.progress.streak);
          AppStorage.setStreakData(this.state.progress.streak, this.state.progress.best);

          this.state.progress.doneToday = true;

          this.refreshProgress();

          this.setScreenState(SCREEN_RESULT, { filePath });
          logger.log(`Storage: ${this.state.progress.streak} days, best: ${this.state.progress.best}, isNextDay: ${this.state.progress.isNextDay}, doneToday: ${this.state.progress.doneToday}`);
        })
        .catch((err) => {
          logger.log("Network/BLE error:", err);
          this.setScreenState(SCREEN_ERROR, {
            message: i18n("err_connection_to_the_phone"),
          });
        });
    },

    openHelp() {
      logger.log("Open practice help");
      push({
        url: "page/help/index",
        params: JSON.stringify({ slides: SLIDES_PRACTICE }),
      });
    },

    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;

          if (this.state.screenState === SCREEN_LOADING) {
            return true;
          }

          if (this.state.screenState === SCREEN_RESULT || this.state.screenState === SCREEN_ERROR) {
            if (key === KEY_SELECT) {
              this.setScreenState(SCREEN_IDLE);
              return true;
            }
            return false;
          }

          if (key === KEY_DOWN || key === KEY_UP) {
            this.state.selectedIndex = this.state.selectedIndex === 0 ? 1 : 0;
            this.syncFocus();
            return true;
          }

          if (key === KEY_SELECT) {
            if (this.state.selectedIndex === 1) {
              this.openHelp();
            } else {
              this.handleOpenClick();
            }
            return true;
          }

          if (key === KEY_BACK) {
            if (this.state.screenState !== SCREEN_IDLE) {
              this.setScreenState(SCREEN_IDLE);
              return true;
            } else {
              return false;
            }
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

    keepScreenAwake(isAwake) {
      if (isAwake) {
        setPageBrightTime({ brightTime: 0 });
        pauseDropWristScreenOff({ duration: 0 });
      } else {
        resetPageBrightTime();
        resetDropWristScreenOff();
      }
    },

    onDestroy() {
      this.keepScreenAwake(false);
      if (this.widgets.loadingAnim) {
        this.widgets.loadingAnim.delete();
      }
    },
  })
);