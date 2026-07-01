import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { push } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from '../utils/config/storage.js';
import Profile from "../utils/config/profile.js";
import LoadingAnimationComponent from '../utils/components/LoadingAnimationComponent.js';
import { NORMAL_COLOR, PRESSED_COLOR, COLLECTION_SHOW, STORAGE_KEYS } from "../utils/config/constants.js";
// import { HardcoreResizer } from '../../utils/HardcoreResizer.js';
// import { ImageResizer } from '../../utils/ImageResizer.js'
// import { TgaThumbnail } from "../../utils/TgaThumbnail.js";
// import { IndexedTgaThumbnail } from "../../utils/IndexedTgaThumbnail.js";
import { statSync } from '@zos/fs';


import { width, height, screenShape, getDateFormatString } from "../utils/config/device.js";

const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

import { MENU_BUTTON, TITLE } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");

/**
 * "Первый вход" - нет соединения с кошельком (флаг?)
 *    Уведомление "Нет коллекции" + "вы можете..."
 *    Settings - wallet link on site, FAQ?, 
 * 
 * Есть связь
 * 1. Нет коллекции - Уведомление "Нет коллекции" и кнопка "Синхронизовать" + Settings (remote link)
 *    Если синхронизация не приносит токены - Сообщение о том, что свою мандалу можно сминтить на сайте и линк на сайт
 *    Если есть коллекция - сохранить локально и отобразить ее + Settings
 * 2. Есть коллекция - отобразить + Settings (Синхронизовать, remote link)
 * 
 * 
 * 
 * На сайте по кошельку вывести список сопряженных устройств с датой последнего обращения и кнопки "разорвать связь"
 */

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
      const arr = AppStorage.getRecord(STORAGE_KEYS.COLLECTION_JSON);
      const linked = AppStorage.getRecord(STORAGE_KEYS.LINKED) || false;
      console.log(`collection: ${arr}`);

      this.buildTitle();
      // logger.log(`Title: ${this.widgets.title.getProperty(hmUI.prop.H)}, ${this.widgets.title.getProperty(hmUI.prop.W)}`);

      this.buildLoadingGroup();
      this.buildErrorGroup();

      if (arr) {
        const collection = JSON.parse(arr);
        logger.log(`Loading from phone:`, collection);
        this.setScreenState(SCREEN_RESULT, { collection });
      } else if (linked) {

      } else {
        this.setScreenState(SCREEN_LOADING);
        this.getCollection();
      }
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

      const request = Profile.createRequestData();

      this.request({
        method: "GET_COLLECTION",
        request
      })
        .then((data) => {
          const { result = {}, collection = [] } = data;

          if (result === "Ok") {
            logger.log(`Received collection from phone:`, collection);

            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, JSON.stringify(collection));

            this.setScreenState(SCREEN_RESULT, { collection });
          } else if (result === "NO_LINK") {

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

      const startY = px(175);
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

        const originalFile = AppStorage.getRecord(item.day);
        const thumbnailFile = `${originalFile}_thumb.tga}`
        // if () {
        //   image = originalFile;
        // }
        // const file = statSync({ path: originalFile });
        let image = originalFile ? 'icons/ic_collection.png' : 'icons/ic_not_loaded.png';
        /*
                try {
                  // const thumbnailCreator = new TgaThumbnail({
                  //   scale: 8,
                  //   filter: "box",
                  // });
        
                  const success = HardcoreResizer.createThumb(originalFile, thumbnailFile, 4);
                  // const success = ImageResizer.createThumb(originalFile, thumbnailFile, 8);
                  // 
                  // {
                  // width: 60,
                  // height: 60,
                  // filter: "box",
                  // }
                  // );
                  // const thumbnailCreator =
                  // new IndexedTgaThumbnail({
                  // scale: 8,
                  // });
        
                  // const success = thumbnailCreator.create(originalFile, thumbnailFile);
                  // console.log(
                  //   `${success.sourceWidth}x${success.sourceHeight}` +
                  //   ` -> ` +
                  //   `${success.targetWidth}x${success.targetHeight}`
                  // );
        
                  if (success) {
                    image = thumbnailFile;
                    console.log(JSON.stringify(success));
                  } else {
                    logger.log(`Failed to create thumbnail for ${originalFile}`);
                  }
                } catch (err) {
                  logger.log(`Error occurred while creating thumbnail for ${originalFile}:`, err);
                }
        */
        // const stat = statSync({ path: originalFile });
        // if (stat) {
        // image = originalFile;
        // }

        group.createWidget(hmUI.widget.IMG, {
          x: 24,
          y: (this.layout.buttonHeight - px(60)) / 2,
          w: px(60),
          h: px(60),
          src: image,
          // auto_scale: true,
          // auto_scale_obj_fit: false
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104),
          y: px(24),
          w: itemWidth - px(104),
          h: titleLayout.height,
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
              url: "page/show",
              params: JSON.stringify({
                id: item.id,
                day: item.day,
                title: item.name,
                fromLocalStorage: true,
                type: COLLECTION_SHOW
              }),
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