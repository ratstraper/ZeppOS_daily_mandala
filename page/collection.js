import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { push } from "@zos/router";
import { scrollTo } from '@zos/page';
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from '../utils/config/storage.js';
import Profile from "../utils/config/profile.js";
import LoadingAnimationComponent from '../utils/components/LoadingAnimationComponent.js';
import { NORMAL_COLOR, PRESSED_COLOR, COLLECTION_SHOW, STORAGE_KEYS } from "../utils/config/constants.js";

import { width, height, screenShape, getDateFormatString } from "../utils/config/device.js";

const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

const HELP_ICON_W = px(64);
const HELP_ICON_H = px(104);

import { TITLE } from "zosLoader:./index.[pf].layout.js";

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
      selectedIndex: -1,   // -1 = ничего не выделено
      prevSelectedIndex: -1,
      bgRects: [],         // фоны кнопок списка коллекции, для управления цветом
      collectionItems: [],
      helpY: 0,            // фактическая позиция helpImg (нужна scrollToItem)
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
      this.buildLoadingGroup();
      this.buildErrorGroup();
      this.initKeyNavigation();

      const collection = this.loadStoredCollection();
      const linked = AppStorage.getRecord(STORAGE_KEYS.LINKED) || false;

      if (collection) {
        logger.log('Loading collection from local storage');
        this.setScreenState(SCREEN_RESULT, { collection });
      } else if (linked) {
        // Кошелёк привязан, но локальной копии нет — тянем с телефона
        this.setScreenState(SCREEN_LOADING);
        this.getCollection();
      } else {
        this.setScreenState(SCREEN_LOADING);
        this.getCollection();
      }
    },

    // Безопасное чтение коллекции: битый JSON не должен ронять страницу
    loadStoredCollection() {
      const raw = AppStorage.getRecord(STORAGE_KEYS.COLLECTION_JSON);
      if (!raw) return null;
      try {
        return JSON.parse(raw);
      } catch (e) {
        logger.log('Corrupted collection JSON in storage, dropping it:', e);
        if (typeof AppStorage.removeRecord === 'function') {
          AppStorage.removeRecord(STORAGE_KEYS.COLLECTION_JSON);
        } else {
          AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, '');
        }
        return null;
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
      const startY = px(130);
      const spacing = px(25);

      return {
        startX,
        loadingAnimX,
        loadingAnimY,
        loadingAnimSize,
        loadingTextY,
        buttonWidth,
        buttonHeight,
        startY,
        spacing,
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

      this.widgets.loadingText = this.widgets.loadingGroup.createWidget(hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY,
        w: width - px(96), h: px(72),
        color: 0xbdbdbd, text_size: px(24),
        text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text: i18n("loading") || "Loading...",
      });
    },

    buildErrorGroup() {
      this.widgets.errorGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0, y: 0, w: width, h: height,
      });

      this.widgets.errorText = this.widgets.errorGroup.createWidget(hmUI.widget.TEXT, {
        x: px(48), y: this.layout.loadingTextY,
        w: width - px(96), h: px(90),
        color: 0xbdbdbd, text_size: px(24),
        text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text: "",
      });
    },

    // --- Навигация физическими кнопками ---

    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;

          // helpImg всегда идет последним элементом фокуса, после элементов списка
          const totalElements = this.state.bgRects.length + (this.widgets.helpImg ? 1 : 0);
          if (totalElements === 0) return false;

          if (key === KEY_DOWN) {
            this.setSelectedIndex(this.state.selectedIndex === -1
              ? 0
              : (this.state.selectedIndex + 1) % totalElements);
            this.scrollToItem(this.state.selectedIndex);
            return true;
          }
          if (key === KEY_UP) {
            this.setSelectedIndex(this.state.selectedIndex <= 0
              ? totalElements - 1
              : this.state.selectedIndex - 1);
            this.scrollToItem(this.state.selectedIndex);
            return true;
          }
          if (key === KEY_SELECT) {
            if (this.state.selectedIndex === -1) return false;

            const helpIndex = this.state.bgRects.length;
            const index = this.state.selectedIndex;
            this.setSelectedIndex(-1);

            if (index === helpIndex) {
              this.openSettings();
            } else {
              this.openCollectionItem(this.state.collectionItems[index]);
            }
            return true;
          }
          return false;
        },
      });
    },

    setSelectedIndex(index) {
      this.state.selectedIndex = index;
      this.updateSelection();
    },

    // Перекрашиваем только изменившиеся элементы, а не весь список
    updateSelection() {
      const prev = this.state.prevSelectedIndex;
      const cur = this.state.selectedIndex;
      if (prev === cur) return;

      const prevRect = this.state.bgRects[prev];
      const curRect = this.state.bgRects[cur];
      if (prevRect) prevRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR);
      if (curRect) curRect.setProperty(hmUI.prop.COLOR, PRESSED_COLOR);

      if (this.widgets.helpImg) {
        const helpIndex = this.state.bgRects.length;
        const wasHelp = prev === helpIndex;
        const isHelp = cur === helpIndex;
        if (wasHelp !== isHelp) {
          this.widgets.helpImg.setProperty(
            hmUI.prop.SRC,
            isHelp ? 'icons/settings_64.png' : 'icons/settings_64bw.png'
          );
        }
      }

      this.state.prevSelectedIndex = cur;
    },

    scrollToItem(index) {
      if (index === -1) return;

      const helpIndex = this.state.bgRects.length;
      let itemY, itemH;

      if (index < helpIndex) {
        itemY = this.layout.startY + index * (this.layout.buttonHeight + this.layout.spacing);
        itemH = this.layout.buttonHeight;
      } else {
        itemY = this.state.helpY;
        itemH = HELP_ICON_H;
      }

      let targetY = itemY + (itemH / 2) - (height / 2);
      if (targetY < 0) targetY = 0;

      scrollTo({
        y: -targetY,
        animConfig: { anim_duration: 250 },
      });
    },

    // Единый паттерн "нажатие с подсветкой" для сенсорного ввода,
    // синхронизирован с общим selectedIndex кнопочной навигации
    attachSelectable(widget, index, onActivate) {
      widget.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.setSelectedIndex(index);
      });
      widget.addEventListener(hmUI.event.MOVE, () => {
        this.setSelectedIndex(-1);
      });
      widget.addEventListener(hmUI.event.CLICK_UP, () => {
        if (this.state.selectedIndex !== index) return;
        this.setSelectedIndex(-1);
        onActivate();
      });
    },

    openCollectionItem(item) {
      if (!item) return;
      logger.log(`Opening item: ${item.name} (ID: ${item.id})`);
      push({
        url: "page/show",
        params: JSON.stringify({
          id: item.id,
          day: item.day,
          title: item.name,
          fromLocalStorage: true,
          type: COLLECTION_SHOW,
        }),
      });
    },

    openSettings() {
      logger.log("Open settings screen");
      push({ url: "page/settings" });
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
        this.renderCollection(payload.collection, payload.emptyMessage);
      } else {
        this.clearCollection();
      }
    },

    getCollection() {
      logger.log('Sending GET_COLLECTION request to the phone...');

      const request = Profile.createRequestData();

      this.request({
        method: "GET_COLLECTION",
        request,
      })
        .then((data) => {
          const { status = "", collection = [] } = data;

          if (status === "OK") {
            logger.log('Received collection from phone, items:', collection.length);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, JSON.stringify(collection));
            this.setScreenState(SCREEN_RESULT, { collection });
          } else if (status === "NO_LINK") {
            // Кошелёк не привязан: показываем пустой экран с подсказкой,
            // настройки при этом остаются доступны (helpImg рисуется всегда)
            logger.log('Wallet is not linked');
            this.setScreenState(SCREEN_RESULT, {
              collection: [],
              emptyMessage: i18n("no_wallet_link") || "Wallet is not linked.\nLink it on the website\nvia Settings",
            });
          } else {
            logger.log("Error from phone:", result);
            this.setScreenState(SCREEN_ERROR, {
              message: i18n("err_internet_connection") || "Error connecting\nto the phone",
            });
          }
        })
        .catch((err) => {
          logger.log("Network/BLE error:", err);
          this.setScreenState(SCREEN_ERROR, {
            message: i18n("err_connection_to_the_phone") || "Error connecting\nto the phone",
          });
        });
    },

    clearCollection() {
      this.widgets.listItems.forEach((widget) => hmUI.deleteWidget(widget));
      this.widgets.listItems = [];

      if (this.widgets.emptyText) {
        hmUI.deleteWidget(this.widgets.emptyText);
        this.widgets.emptyText = null;
      }
      if (this.widgets.helpImg) {
        hmUI.deleteWidget(this.widgets.helpImg);
        this.widgets.helpImg = null;
      }
      this.state.bgRects = [];
      this.state.collectionItems = [];
      this.state.selectedIndex = -1;
      this.state.prevSelectedIndex = -1;
    },

    renderCollection(collection, emptyMessage) {
      this.clearCollection();
      this.state.collectionItems = collection || [];

      const { startX, startY, spacing, buttonWidth, buttonHeight } = this.layout;
      const isEmpty = this.state.collectionItems.length === 0;

      if (isEmpty) {
        const emptyH = px(140);
        const emptyY = (height - emptyH) / 2 - px(40);
        this.widgets.emptyText = hmUI.createWidget(hmUI.widget.TEXT, {
          x: px(40),
          y: emptyY,
          w: width - px(80),
          h: emptyH,
          color: 0xffffff, text_size: px(28), text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
          text: emptyMessage || i18n("empty_collection") || "Collection is empty",
        });

        // Настройки должны быть доступны и при пустой коллекции
        this.buildHelpIcon(emptyY + emptyH + spacing);
        return;
      }

      this.state.collectionItems.forEach((item, index) => {
        const yPos = startY + index * (buttonHeight + spacing);
        const formattedDate = getDateFormatString(item.day);

        const group = hmUI.createWidget(hmUI.widget.GROUP, {
          x: startX, y: yPos, w: buttonWidth, h: buttonHeight,
        });

        const bgRect = group.createWidget(hmUI.widget.FILL_RECT, {
          x: 0, y: 0, w: buttonWidth, h: buttonHeight,
          color: NORMAL_COLOR, radius: px(63),
        });
        this.state.bgRects.push(bgRect);

        const titleLayout = measureText(item.name || "Unknown", px(36), buttonWidth - px(104));

        const originalFile = AppStorage.getRecord(item.day);
        const image = originalFile ? 'icons/ic_collection.png' : 'icons/ic_not_loaded.png';

        group.createWidget(hmUI.widget.IMG, {
          x: px(24),
          y: (buttonHeight - px(60)) / 2,
          w: px(60),
          h: px(60),
          src: image,
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104),
          y: px(24),
          w: buttonWidth - px(104),
          h: titleLayout.height,
          color: 0xffffff,
          text_size: px(36),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.TOP,
          text: item.name || "Unknown",
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104),
          y: buttonHeight - px(48),
          w: buttonWidth - px(104),
          h: px(48),
          color: 0xa0a0a0,
          text_size: px(24),
          align_h: hmUI.align.LEFT,
          align_v: hmUI.align.TOP,
          text: formattedDate,
        });

        group.createWidget(hmUI.widget.IMG, {
          x: buttonWidth - px(84),
          y: (buttonHeight - px(64)) / 2,
          w: px(64),
          h: px(64),
          src: 'icons/arrow_right.tga',
        });

        this.attachSelectable(group, index, () => this.openCollectionItem(item));

        this.widgets.listItems.push(group);
      });

      const helpY = startY
        + this.widgets.listItems.length * (buttonHeight + spacing)
        + spacing;
      this.buildHelpIcon(helpY);
    },

    buildHelpIcon(helpY) {
      const helpIndex = this.state.bgRects.length;
      this.state.helpY = helpY;

      this.widgets.helpImg = hmUI.createWidget(hmUI.widget.IMG, {
        x: (width - HELP_ICON_W) / 2,
        y: helpY,
        w: HELP_ICON_W,
        h: HELP_ICON_H,
        src: 'icons/settings_64bw.png',
      });

      this.attachSelectable(this.widgets.helpImg, helpIndex, () => this.openSettings());
    },

    onDestroy() {
      offKey();
      if (this.widgets.loadingAnim) {
        this.widgets.loadingAnim.delete();
      }
    },
  })
);