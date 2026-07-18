import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { push, replace } from "@zos/router";
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from '../utils/config/storage.js';
import Profile from "../utils/config/profile.js";
import { NORMAL_COLOR, PRESSED_COLOR, STORAGE_KEYS } from "../utils/config/constants.js";
import { width } from "../utils/config/device.js";

import { TITLE } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");

/**
 * Экран "Нет связи с NFT коллекцией".
 * Открывается вместо page/collection, пока часы не связаны с кошельком
 * (флаг STORAGE_KEYS.LINKED). Роутинг уже есть в index.executeAction().
 *
 * Кнопки:
 *  - "Подробнее" -> page/nolink_help (что/зачем/как + QR)
 *  - "Связать"   -> page/qr со ссылкой на страницу привязки
 *
 * При открытии и при возврате на экран в фоне выполняется GET_COLLECTION:
 * если телефон отвечает "Ok", значит привязка уже сделана на сайте —
 * ставим флаг, сохраняем коллекцию и молча заменяем экран на page/collection.
 */

Page(
  BasePage({
    state: {
      selectedIndex: -1,   // -1 = ничего не выделено
      prevSelectedIndex: -1,
      bgRects: [],
      menuItems: [],
      visible: false,      // страница на переднем плане (для replace из промиса)
      checking: false,     // защита от параллельных GET_COLLECTION
    },
    widgets: {
      title: null,
      listItems: [],
    },

    build() {
      logger.log(`NOLINK.JS`);
      this.layout = this.createLayout();
      this.buildTitle();

      this.state.menuItems = [
        {
          id: 'details',
          title: i18n("no_link_details"),
          icon: 'icons/question_64.png',
          iconSize: px(64),
          action: () => this.openDetails(),
        },
        {
          id: 'link',
          title: i18n("no_link_link"),
          icon: 'icons/ic_link.png',
          iconSize: px(60),
          action: () => this.openLinkQr(),
        },
      ];

      this.renderMenu();
      this.initKeyNavigation();

      this.state.visible = true;
      // Привязка могла быть сделана на сайте раньше, чем часы об этом узнали
      this.checkLinkInBackground();
    },

    onResume() {
      this.state.visible = true;

      // Возврат с QR-экрана: пользователь мог только что привязать кошелёк
      if (AppStorage.getRecord(STORAGE_KEYS.LINKED)) {
        logger.log(`replace to collection`);
        replace({ url: "page/collection" });
        return;
      }
      this.checkLinkInBackground();
    },

    onPause() {
      this.state.visible = false;
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
        ...TITLE(this.layout, i18n("no_link_title"))
      });
    },

    renderMenu() {
      const { startX, startY, buttonHeight, spacing, buttonWidth } = this.layout;

      this.state.menuItems.forEach((item, index) => {
        const yPos = startY + index * (buttonHeight + spacing);

        const group = hmUI.createWidget(hmUI.widget.GROUP, {
          x: startX, y: yPos, w: buttonWidth, h: buttonHeight,
        });

        const bgRect = group.createWidget(hmUI.widget.FILL_RECT, {
          x: 0, y: 0, w: buttonWidth, h: buttonHeight,
          color: NORMAL_COLOR, radius: px(63),
        });
        this.state.bgRects.push(bgRect);

        group.createWidget(hmUI.widget.IMG, {
          x: px(24),
          y: (buttonHeight - item.iconSize) / 2,
          w: item.iconSize,
          h: item.iconSize,
          src: item.icon,
        });

        group.createWidget(hmUI.widget.TEXT, {
          x: px(104), y: 0,
          w: buttonWidth - px(140), h: buttonHeight,
          color: 0xffffff, text_size: px(36),
          align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V,
          text: item.title,
        });

        group.createWidget(hmUI.widget.IMG, {
          x: buttonWidth - px(84),
          y: (buttonHeight - px(64)) / 2,
          w: px(64), h: px(64),
          src: 'icons/arrow_right.tga',
        });

        this.attachSelectable(group, index, () => item.action());
        this.widgets.listItems.push(group);
      });

      hmUI.createWidget(hmUI.widget.TEXT, {
        x: px(0), y: yPos = startY + 2 * (buttonHeight + spacing),
        w: (1), h: 3 * spacing,
        color: 0x000000, text_size: px(36),
        text: "",
      });
    },

    initKeyNavigation() {
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;

          const total = this.state.menuItems.length;
          if (total === 0) return false;

          if (key === KEY_DOWN) {
            this.setSelectedIndex(this.state.selectedIndex === -1
              ? 0
              : (this.state.selectedIndex + 1) % total);
            return true;
          }
          if (key === KEY_UP) {
            this.setSelectedIndex(this.state.selectedIndex <= 0
              ? total - 1
              : this.state.selectedIndex - 1);
            return true;
          }
          if (key === KEY_SELECT) {
            if (this.state.selectedIndex === -1) return false;
            const item = this.state.menuItems[this.state.selectedIndex];
            this.setSelectedIndex(-1);
            item.action();
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

    updateSelection() {
      const prev = this.state.prevSelectedIndex;
      const cur = this.state.selectedIndex;
      if (prev === cur) return;

      const prevRect = this.state.bgRects[prev];
      const curRect = this.state.bgRects[cur];
      if (prevRect) prevRect.setProperty(hmUI.prop.COLOR, NORMAL_COLOR);
      if (curRect) curRect.setProperty(hmUI.prop.COLOR, PRESSED_COLOR);

      this.state.prevSelectedIndex = cur;
    },

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

    openDetails() {
      logger.log("Open nolink help screen");
      replace({ url: "page/linkinfo" });
    },

    openLinkQr() {
      const url = AppStorage.getLinkUrl();
      logger.log("Open link QR:", url);
      replace({
        url: "page/link",
        params: JSON.stringify({ url }),
      });
    },

    checkLinkInBackground() {
      if (this.state.checking) return;
      this.state.checking = true;

      const request = Profile.createRequestData();

      this.request({
        method: "GET_COLLECTION",
        request,
      })
        .then((data) => {
          this.state.checking = false;
          const { result = "", collection = [] } = data;

          if (result === "Ok") {
            logger.log('Link confirmed by phone, switching to collection');
            AppStorage.setRecord(STORAGE_KEYS.LINKED, true);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, JSON.stringify(collection));
            // Не дёргаем экран, если пользователь уже ушёл на QR/справку
            if (this.state.visible) {
              replace({ url: "page/collection" });
            }
          } else if (result === "NO_LINK") {
            AppStorage.setRecord(STORAGE_KEYS.LINKED, false);
          }
          // Любой другой ответ молча игнорируем — экран самодостаточен
        })
        .catch((err) => {
          this.state.checking = false;
          // Телефон недоступен — просто остаёмся на экране, кнопки работают
          logger.log("Background link check skipped:", err);
        });
    },

    onDestroy() {
      offKey();
    },
  })
);