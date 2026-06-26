import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { onKey, offKey } from '@zos/interaction';
import { getDeviceInfo } from "@zos/device";
import { getProfile, GENDER_MALE, GENDER_FEMALE } from "@zos/user";
import AppStorage from "../../utils/config/storage.js";
import LoadingAnimationComponent from "../../utils/components/LoadingAnimationComponent.js";
import {
  setPageBrightTime,
  resetPageBrightTime,
  pauseDropWristScreenOff,
  resetDropWristScreenOff,
} from "@zos/display";
import { TITLE } from "zosLoader:./../index.[pf].layout.js";
import {
  PRACTICE_SHOW,
  COLLECTION_SHOW,
} from "../../utils/config/constants";
const logger = Logger.getLogger("show_mandala_screen");

const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

const { width, height, screenShape, platform } = getDeviceInfo();
const profile = getProfile() || {};
const { age, gender, region } = profile;
const squareSize = Math.min(width, height) * 1.0;

Page(
  BasePage({
    state: {
      screenState: SCREEN_LOADING,
      day: null,
      title: "Mandala",
      fromLocalStorage: false,
      type: PRACTICE_SHOW,
    },

    widgets: {
      title: null,
      loadingGroup: null,
      resultGroup: null,
      loadingAnim: null,
      loadingText: null,
      mandalaImg: null,
      errorText: null,
    },

    onInit(params) {
      logger.log("onInit with params:", params);
      try {
        const parsedParams = JSON.parse(params);
        this.state.day = parsedParams.day;
        this.state.title = parsedParams.title || this.state.title;
        this.state.fromLocalStorage = parsedParams.fromLocalStorage !== undefined ? parsedParams.fromLocalStorage : false;
        this.state.type = parsedParams.type || PRACTICE_SHOW;
      } catch (e) {
        logger.log("Error parsing params or no params provided", e);
        this.state.day = AppStorage.getMandalaDayString();
      }
    },

    build() {
      this.layout = this.createLayout();
      this.widgets.loadingAnim = new LoadingAnimationComponent(hmUI);

      this.buildTitle();
      this.buildLoadingGroup();
      this.buildResultGroup();

      this.setScreenState(SCREEN_LOADING);

      if (this.state.type === PRACTICE_SHOW) {
        this.fetchData();
      } else if (this.state.type === COLLECTION_SHOW) {
        const localPath = AppStorage.getRecord(this.state.day);
        if (localPath) {
          this.setScreenState(SCREEN_RESULT, { filePath: localPath });
        } else {
          logger.log("No local file found for day:", this.state.day);
          this.fetchData();
        }
      }
      // } else {
      // Future logic to load from storage
      // const localPath = AppStorage.getRecord(STORAGE_KEYS.MANDALA_PATH);
      // if (localPath) {
      // this.setScreenState(SCREEN_RESULT, { filePath: localPath });
      // } else {
      // this.fetchData();
      // this.setScreenState(SCREEN_ERROR, { message: "Error: No local file found." });
      // }
      // }

      this.initKeyNavigation();
    },

    createLayout() {
      const loadingAnimSize = px(48);
      const loadingAnimX = (width - loadingAnimSize) / 2;
      const loadingAnimY =
        screenShape === 1 ? (height - loadingAnimSize) / 2 - px(36) : px(140);
      const loadingTextY = loadingAnimY + loadingAnimSize + px(22);
      const resultX = (width - squareSize) / 2;
      const resultY = screenShape === 1 ? (height - squareSize) / 2 : px(40);
      return { loadingAnimX, loadingAnimY, loadingAnimSize, loadingTextY, resultX, resultY };
    },

    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE(this.layout, this.state.title),
      });
    },

    buildLoadingGroup() {
      this.widgets.loadingGroup = hmUI.createWidget(hmUI.widget.GROUP, { x: 0, y: 0, w: width, h: height });
      this.widgets.loadingText = this.widgets.loadingGroup.createWidget(hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY, w: width - px(96), h: px(72),
        color: 0xbdbdbd, text_size: px(24), text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text: i18n("loading_mandala"),
      });
      this.setVisible(this.widgets.loadingGroup, false);
    },

    buildResultGroup() {
      this.widgets.resultGroup = hmUI.createWidget(hmUI.widget.GROUP, { x: 0, y: 0, w: width, h: height });
      this.widgets.mandalaImg = this.widgets.resultGroup.createWidget(hmUI.widget.IMG, {
        x: this.layout.resultX, y: this.layout.resultY, w: squareSize, h: squareSize, src: "",
      });
      this.widgets.errorText = this.widgets.resultGroup.createWidget(hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY, w: width - px(96), h: px(90),
        color: 0xbdbdbd, text_size: px(24), text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V, text: "",
      });
      this.setVisible(this.widgets.mandalaImg, false);
      this.setVisible(this.widgets.errorText, false);
      this.setVisible(this.widgets.resultGroup, false);
    },

    setScreenState(nextState, payload = {}) {
      this.state.screenState = nextState;
      const isLoading = nextState === SCREEN_LOADING;
      const isResult = nextState === SCREEN_RESULT;
      const isError = nextState === SCREEN_ERROR;

      this.setVisible(this.widgets.loadingGroup, isLoading);
      this.setVisible(this.widgets.resultGroup, isResult || isError);
      this.setVisible(this.widgets.title, isLoading || isError);


      if (isLoading) {
        this.widgets.loadingAnim.show(this.layout.loadingAnimX, this.layout.loadingAnimY, this.layout.loadingAnimSize, this.layout.loadingAnimSize);
        this.keepScreenAwake(true);
      } else {
        this.widgets.loadingAnim.delete();
        if (isResult) {
          this.setVisible(this.widgets.mandalaImg, true);
          this.setVisible(this.widgets.errorText, false);
          if (payload.filePath) {
            this.widgets.mandalaImg.setProperty(hmUI.prop.SRC, payload.filePath);
          }
          this.keepScreenAwake(true);
        } else if (isError) {
          this.setVisible(this.widgets.mandalaImg, false);
          this.setVisible(this.widgets.errorText, true);
          this.widgets.errorText.setProperty(hmUI.prop.TEXT, payload.message || i18n("err_connection_to_the_phone"));
          this.keepScreenAwake(false);
        } else {
          this.keepScreenAwake(false);
        }
      }
    },

    fetchData() {
      const mandalaDay = this.state.day;
      if (!mandalaDay) {
        this.setScreenState(SCREEN_ERROR, { message: "Error: No day provided." });
        return;
      }

      const userId = `ZeppOS_${AppStorage.getInstallationId()}`;

      this.request({
        method: "GET_MANDALA",
        day: mandalaDay,
        info: platform,
        size: squareSize,
        age,
        gender: gender === GENDER_MALE ? "M" : gender === GENDER_FEMALE ? "F" : "U",
        region,
        usr: userId,
      })
        .then((data) => {
          const { result, filePath } = data;
          if (result === "Ok") {
            if (this.state.type === PRACTICE_SHOW) {
              AppStorage.setMandalaData(mandalaDay, filePath);
              this.setScreenState(SCREEN_RESULT, { filePath });
            } else if (this.state.type === COLLECTION_SHOW) {
              AppStorage.setRecord(mandalaDay, filePath);
              this.setScreenState(SCREEN_RESULT, { filePath });
            }
          } else {
            logger.log("Phone returned error:", result);
            this.setScreenState(SCREEN_ERROR, { message: i18n("err_connection_to_the_phone") });
          }
        })
        .catch((err) => {
          logger.log("Network/BLE error:", err);
          this.setScreenState(SCREEN_ERROR, { message: i18n("err_connection_to_the_phone") });
        });
    },

    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          hmUI.gotoBack();
          return true;
        },
      });
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

    setVisible(widget, visible) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.VISIBLE, !!visible);
    },

    onDestroy() {
      this.keepScreenAwake(false);
      if (this.widgets.loadingAnim) {
        this.widgets.loadingAnim.delete();
      }
      offKey();
    },
  })
);
