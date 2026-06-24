import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { push } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from '../../utils/config/storage.js';
import LoadingAnimationComponent from '../../utils/components/LoadingAnimationComponent.js';
import { NORMAL_COLOR, PRESSED_COLOR } from "../../utils/config/constants.js";

const logger = Logger.getLogger("mandala_day");

import { width, height, screenShape, platform, getDateFormatString } from "../../utils/config/device.js";

const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

import {
  MENU_BUTTON
} from "zosLoader:./index.[pf].layout.js";
import { TITLE } from "zosLoader:./../index.[pf].layout.js";

function measureText(text, size, textWidth) {
  return hmUI.getTextLayout(text, {
    text_size: size,
    text_width: textWidth,
    wrapped: 1,
  });
}

Page(
  BasePage({
    state: {
      screenState: SCREEN_LOADING,
      selectedIndex: 0,
    },
    widgets: {
      title: null,

      loadingGroup: null,
      errorGroup: null,

      loadingAnim: null,
      loadingText: null,
      errorText: null,

      listItems: [],
      emptyText: null,
      helpImg: null,
    },

    build() {
      this.layout = this.createLayout();
      this.widgets.loadingAnim = new LoadingAnimationComponent(hmUI);

      this.buildTitle();
      // logger.log(`Title: ${this.widgets.title.getProperty(hmUI.prop.H)}, ${this.widgets.title.getProperty(hmUI.prop.W)}`);

      this.buildLoadingGroup();
      this.buildErrorGroup();

      this.setScreenState(SCREEN_LOADING);
      this.getCollection();
    },

    createLayout() {
      const startX = px(40);
      const loadingAnimSize = px(48);
      const loadingAnimX = (width - loadingAnimSize) / 2;
      const loadingAnimY = screenShape === 1 ? (height - loadingAnimSize) / 2 - px(36) : px(140);
      const loadingTextY = loadingAnimY + loadingAnimSize + px(22);
      const buttonWidth = width - (2 * startX);
      const buttonHeight = px(126);

      return {
        startX,
        loadingAnimX,
        loadingAnimY,
        loadingAnimSize,
        loadingTextY,
        buttonWidth,
        buttonHeight
      };
    },

    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE(this.layout, i18n("collection") || "Collection"),
      });
    },


    buildLoadingGroup() {
      this.widgets.loadingGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0, y: 0, w: width, h: height,
      });

      this.widgets.loadingText = this.widgets.loadingGroup.createWidget(
        hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY,
        w: width - px(96), h: px(72),
        color: 0xbdbdbd, text_size: px(24),
        text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text: i18n("loading") || "Loading...",
      }
      );
    },

    buildErrorGroup() {
      this.widgets.errorGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0, y: 0, w: width, h: height,
      });

      this.widgets.errorText = this.widgets.errorGroup.createWidget(
        hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY,
        w: width - px(96), h: px(90),
        color: 0xbdbdbd, text_size: px(24),
        text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text: "",
      }
      );
    },

    setVisible(widget, visible) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.VISIBLE, !!visible);
    },

    setText(widget, text) {
      if (!widget) return;
      widget.setProperty(hmUI.prop.TEXT, String(text ?? ""));
    },

    setScreenState(nextState, payload = {}) {
      this.state.screenState = nextState;

      const isLoading = nextState === SCREEN_LOADING;
      const isResult = nextState === SCREEN_RESULT;
      const isError = nextState === SCREEN_ERROR;

      this.setVisible(this.widgets.loadingGroup, isLoading);
      this.setVisible(this.widgets.errorGroup, isError);

      if (isLoading) {
        this.widgets.loadingAnim.show(
          this.layout.loadingAnimX,
          this.layout.loadingAnimY,
          this.layout.loadingAnimSize,
          this.layout.loadingAnimSize
        );
      } else {
        this.widgets.loadingAnim.delete();
      }

      if (isError) {
        this.setText(this.widgets.errorText, payload.message || i18n("err_connection_to_the_phone"));
      }

      if (isResult) {
        this.renderCollection(payload.collection);
      } else {
        this.clearCollection();
      }
    },

    getCollection() {
      logger.log('Sending GET_COLLECTION request to the phone...');

      const userId = `ZeppOS_${AppStorage.getInstallationId()}`;

      this.request({
        method: "GET_COLLECTION",
        info: platform,
        usr: userId
      })
        .then((data) => {
          const { result = {}, collection = [] } = data; //{ result: "Ok", collection: [{"day":"15011939", "name":"Ivan", "id":15011939}, {"day":"11111111", "name":"Thering", "id":11111111}]}

          if (result === "Ok") {
            logger.log(`Received collection from phone:`, collection);
            this.setScreenState(SCREEN_RESULT, { collection });
          } else {
            logger.log("Error from phone:", result);
            this.setScreenState(SCREEN_ERROR, { message: i18n("err_connection_to_the_phone") || "Error connecting\nto the phone" });
          }
        })
        .catch((err) => {
          logger.log("Network/BLE error:", err);
          this.setScreenState(SCREEN_ERROR, { message: i18n("err_connection_to_the_phone") || "Error connecting\nto the phone" });
        });
    },

    clearCollection() {
      if (this.widgets.listItems && this.widgets.listItems.length > 0) {
        this.widgets.listItems.forEach(widget => {
          hmUI.deleteWidget(widget);
        });
        this.widgets.listItems = [];
      }
      if (this.widgets.emptyText) {
        hmUI.deleteWidget(this.widgets.emptyText);
        this.widgets.emptyText = null;
      }
    },

    renderCollection(collection) {
      this.clearCollection();

      if (!collection || collection.length === 0) {
        this.widgets.emptyText = hmUI.createWidget(hmUI.widget.TEXT, {
          x: px(40),
          y: (height - px(100)) / 2,
          w: width - px(80),
          h: px(100),
          color: 0xffffff, text_size: px(28), text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
          text: i18n("empty_collection") || "Collection is empty",
        });
        return;
      }

      const startY = px(175); // Сместили вниз, чтобы не перекрывать заголовок px(38) + px(56) + margin
      const spacing = px(25);
      const itemWidth = width - (this.layout.startX * 2);

      collection.forEach((item, index) => {
        const yPos = startY + index * (this.layout.buttonHeight + spacing);

        const formattedDate = getDateFormatString(item.day);
        const group = hmUI.createWidget(hmUI.widget.GROUP, {
          x: this.layout.startX, y: yPos, w: itemWidth, h: this.layout.buttonHeight
        });

        const bgRect = group.createWidget(hmUI.widget.FILL_RECT, {
          x: 0, y: 0, w: itemWidth, h: this.layout.buttonHeight,
          color: NORMAL_COLOR, radius: px(63)
        });

        const titleLayout = measureText(item.name || "Unknown", px(36), itemWidth - px(104));


        group.createWidget(hmUI.widget.IMG, {
          x: 24,
          y: (this.layout.buttonHeight - px(60)) / 2,
          w: px(60),
          h: px(60),
          src: 'icons/circle_60.png'
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104),
          y: px(24),
          w: itemWidth - px(104),
          h: titleLayout.height, //this.layout.buttonHeight - px(48),
          color: 0xffffff,
          text_size: px(36),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.TOP,
          text: item.name || "Unknown"
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104),
          y: this.layout.buttonHeight - px(48),
          w: itemWidth - px(104),
          h: px(48),
          color: 0xa0a0a0,
          text_size: px(24),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.TOP,
          text: formattedDate
        });


        group.createWidget(hmUI.widget.IMG, {
          x: this.layout.buttonWidth - px(84),
          y: (this.layout.buttonHeight - px(64)) / 2,
          w: px(64),
          h: px(64),
          src: 'icons/arrow_right.tga'
        });

        // Логика нажатия
        group.addEventListener(hmUI.event.CLICK_DOWN, () => {
          this.state.selectedIndex = index;
          bgRect.setProperty(hmUI.prop.COLOR, PRESSED_COLOR);
        });
        group.addEventListener(hmUI.event.MOVE, () => {
          this.state.selectedIndex = -1;
          thisbgRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR);
        });
        group.addEventListener(hmUI.event.CLICK_UP, () => {
          logger.log(`Clicked on item: ${item.name} (ID: ${item.id})`);
          if (this.state.selectedIndex === index) {
            this.state.selectedIndex = -1;
            bgRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR);

            push({
              url: "page/mandala/index",
              params: JSON.stringify({ id: item.id, day: item.day, name: item.name })
            });
          }
        });

        this.widgets.listItems.push(group);
      });


      const helpY = startY + this.widgets.listItems.length * (this.layout.buttonHeight + spacing) + spacing;

      this.widgets.helpImg = hmUI.createWidget(hmUI.widget.IMG, {
        x: (width - px(64)) / 2,
        y: helpY,
        w: px(64),
        h: px(104),
        src: 'icons/settings_64bw.png'
      });

      // this.widgets.questionImg.addEventListener(hmUI.event.CLICK_DOWN, () => {
      //   this.state.selectedIndex = questionIndex;
      //   updateSelection();
      // });

      // this.widgets.questionImg.addEventListener(hmUI.event.MOVE, () => {
      //   this.state.selectedIndex = -1;
      //   updateSelection();
      // });

      // this.widgets.questionImg.addEventListener(hmUI.event.CLICK_UP, () => {
      //   if (this.state.selectedIndex === questionIndex) {
      //     this.state.selectedIndex = -1;
      //     updateSelection();
      //     // Передаем фейковый объект item для выполнения действия "Помощь"
      //     this.executeAction({
      //       id: 'help/index',
      //       title: 'Справка/Помощь',
      //       params: JSON.stringify({ slides: SLIDES_MAIN })
      //     });
      //   }
      // });
    },

    onDestroy() {
      if (this.widgets.loadingAnim) {
        this.widgets.loadingAnim.delete();
      }
    }
  })
);