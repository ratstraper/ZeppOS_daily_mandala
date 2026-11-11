import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { push, replace } from "@zos/router";
import { scrollTo } from '@zos/page';
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from '../utils/config/storage.js';
import Profile from "../utils/config/profile.js";
import LoadingAnimationComponent from '../utils/components/LoadingAnimationComponent.js';
import { WatchApi } from "../utils/watch-api";
import { NORMAL_COLOR, PRESSED_COLOR, WEBSITE_URL, COLLECTION_SHOW, STORAGE_KEYS, CTA } from "../utils/config/constants.js";

import { width, height, screenShape, getDateFormatString } from "../utils/config/device.js";

import { TITLE, SECONDARY_BUTTON_HEIGHT, WORK_SCREEN as ui } from "zosLoader:./index.[pf].layout.js";

const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";
const SCREEN_NOT_LINKED = "SCREEN_NOT_LINKED";

const HELP_ICON_W = px(64);
const HELP_ICON_H = px(104);
const BTN_H = SECONDARY_BUTTON_HEIGHT;

const logger = Logger.getLogger("mandala_day");
const vibrator = new Vibrator();

/**
 * Единая точка входа в NFT-коллекцию — сама решает, что показать, без
 * отдельных экранов-шлюзов (прежние page/nolink.js и page/linkinfo.js
 * удалены, их роли полностью перешли сюда):
 *  - кошелёк не привязан -> текст no_link_help_title/text + кнопка на QR привязки;
 *  - привязан, в коллекции есть мандалы -> список + кнопка Settings;
 *  - привязан, но коллекция пуста -> empty_collection + кнопка Mint + кнопка Settings.
 */

function measureText(text, size, textWidth) {
  const layout = hmUI.getTextLayout(text, {
    text_size: size,
    text_width: textWidth,
    wrapped: 1,
  });
  // getTextLayout.height перестаёт расти после ~2 строк (известный баг ZeppOS SDK,
  // zepp-health/discussions#347) — подстраховываемся через rows.
  return { ...layout, height: Math.max(layout.height, layout.rows * size * 1.3) };
}

function hapticStrong() {
  vibrator.stop();
  vibrator.start(23);
  setTimeout(() => vibrator.stop(), 80);
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
      checking: false,     // защита от параллельных фоновых GET_COLLECTION
    },
    widgets: {
      title: null,

      loadingGroup: null,
      errorGroup: null,
      notLinkedGroup: null,
      notLinkedMintBtn: null,
      notLinkedLinkBtn: null,

      loadingAnim: null,
      loadingText: null,
      errorText: null,

      listItems: [],
      emptyText: null,
      mintButton: null,
      helpImg: null,
    },

    build() {
      hmUI.setStatusBarVisible(false);
      this.widgets.loadingAnim = new LoadingAnimationComponent(hmUI);
      this.layout = this.createLayout();

      this.buildTitle();
      this.buildLoadingGroup();
      this.buildErrorGroup();
      this.buildNotLinkedGroup();
      this.initKeyNavigation();

      // Сигнал от page/settings.js ("Обновить"): проверяем и потребляем его
      // раньше обычной cache-first логики - build() это единственный хук,
      // который ZeppOS Page действительно вызывает на каждое новое открытие
      // страницы (у устройства-страницы нет onResume/onPause в принципе, см.
      // .claude/specifications.md §6).
      if (this.consumeRefreshRequest()) return;

      const linked = AppStorage.getRecord(STORAGE_KEYS.LINKED) || false;

      if (!linked) {
        // Мгновенно показываем экран привязки, не дожидаясь сети, а в фоне
        // тихо проверяем - вдруг привязка уже сделана на сайте, а флаг
        // на часах просто не успел обновиться (как раньше делал nolink.js).
        this.setScreenState(SCREEN_NOT_LINKED);
        this.checkLinkInBackground();
        return;
      }

      const collection = this.loadStoredCollection();
      if (collection) {
        logger.log('Loading collection from local storage');
        this.setScreenState(SCREEN_RESULT, { collection });
      } else {
        this.setScreenState(SCREEN_LOADING);
        this.getCollection();
      }
    },

    consumeRefreshRequest() {
      if (!AppStorage.getRecord(STORAGE_KEYS.COLLECTION_REFRESH)) return false;
      AppStorage.setRecord(STORAGE_KEYS.COLLECTION_REFRESH, false);
      logger.log('Collection refresh requested via settings, checking link status first');
      this.setScreenState(SCREEN_LOADING);
      this.refreshWithLinkCheck();
      return true;
    },

    // Explicit "Обновить" может быть единственным моментом, когда часы узнают,
    // что линк был разорван на сайте (не через page/settings.js Unlink) - сам
    // GET_COLLECTION не обязательно отражает это сразу. Проверяем LINK_STATUS
    // первым и только при d.link === 'linked' тянем коллекцию; backend-ошибку
    // или сетевой сбой не считаем за "не привязан" - откатываемся на обычный
    // getCollection(), который сам покажет ошибку при необходимости.
    refreshWithLinkCheck() {
      WatchApi.linkStatus(this)
        .then((d) => {
          if (d && d.status === 'ERROR') {
            logger.log('Refresh: link-status check failed on the backend, falling back to collection check');
            this.getCollection();
            return;
          }
          if (d && d.link === 'linked') {
            this.getCollection();
          } else {
            logger.log('Refresh: link no longer exists on the site, unlinking locally');
            AppStorage.setRecord(STORAGE_KEYS.LINKED, false);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, "");
            this.setScreenState(SCREEN_NOT_LINKED);
          }
        })
        .catch((err) => {
          logger.log("Refresh: link-status request failed outright, falling back to collection check", err);
          this.getCollection();
        });
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
      const startX = ui.left; // px(40);
      // const loadingAnimSize = px(48);
      const loadingAnimSize = this.widgets.loadingAnim.getloadingAnimSize(); //px(48);
      const loadingAnimX = (width - loadingAnimSize) / 2;
      const loadingAnimY = screenShape === 1 ? (height - loadingAnimSize) / 2 - px(36) : px(140);
      const loadingTextY = loadingAnimY + loadingAnimSize + px(22);
      const buttonWidth = ui.width; // width - (2 * startX);
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

    // Статичный контент - строится один раз и просто скрывается/показывается,
    // как loadingGroup/errorGroup. Два CTA рядом: слева - QR перехода на сайт
    // (page/qr), справа - реальный QR привязки (page/link), без
    // промежуточного "подробнее" экрана.
    buildNotLinkedGroup() {
      this.widgets.notLinkedGroup = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0, y: 0, w: width, h: height,
      });

      const padX = px(28);
      const contentW = width - padX * 2;
      let y = this.layout.startY;

      const title = i18n("no_link_help_title");
      const titleLayout = measureText(title, px(32), contentW);
      this.widgets.notLinkedGroup.createWidget(hmUI.widget.TEXT, {
        x: padX, y, w: contentW, h: titleLayout.height,
        color: 0xffffff, text_size: px(32), text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.TOP,
        text: title,
      });
      y += titleLayout.height + px(20);

      const text = i18n("no_link_help_text");
      const textLayout = measureText(text, px(24), contentW);
      this.widgets.notLinkedGroup.createWidget(hmUI.widget.TEXT, {
        x: padX, y, w: contentW, h: textLayout.height,
        color: 0xc7c7c7, text_size: px(24), text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.TOP,
        text,
      });
      y += textLayout.height + px(32);

      // Пара кнопок-половинок одной "капсулы": скругление только с внешней
      // стороны (левая - слева, правая - справа), между ними небольшой
      // отступ вместо общей прямой границы. Это ДВА отдельных top-level
      // GROUP-виджета страницы (сиблинги notLinkedGroup), а не вложенные
      // внутрь него GROUP - вложенность GROUP-в-GROUP где-то в движке не
      // работает (кнопки не появлялись, а build() обрывался до
      // setScreenState, из-за чего оставались видны дефолтно-видимые
      // loadingGroup/notLinkedGroup). Видимость переключается вручную в
      // setScreenState() вместе с notLinkedGroup.
      const pairGap = px(8);
      const halfW = (contentW - pairGap) / 2;

      this.widgets.notLinkedMintBtn = this.buildSplitButton({
        x: padX, y, w: halfW, h: BTN_H, side: "left",
        normalColor: 0x00a86b, pressColor: 0x007a4d,
        text: i18n("go_website"),
        onActivate: () => {
          hapticStrong();
          push({
            url: "page/qr",
            params: JSON.stringify({ title: i18n("collection_go_site"), url: WEBSITE_URL, ref: "collection_home", cta: CTA.OPEN_COLLECTION_QR }),
          });
        },
      });

      this.widgets.notLinkedLinkBtn = this.buildSplitButton({
        x: padX + halfW + pairGap, y, w: halfW, h: BTN_H, side: "right",
        normalColor: 0x1f8ed6, pressColor: 0x156fa8,
        text: i18n("no_link_link"),
        onActivate: () => {
          hapticStrong();
          WatchApi.sendCtaEvent(this, CTA.OPEN_LINK_QR).catch(() => {});
          const url = AppStorage.getLinkUrl();
          push({ url: "page/link", params: JSON.stringify({ url }) });
        },
      });
      y += BTN_H;

      // Запас под кнопками: при прокрутке до упора пара кнопок должна
      // оказаться на середине экрана, а не просто у нижнего края контента.
      const spacerH = (height - BTN_H) / 2;
      this.widgets.notLinkedGroup.createWidget(hmUI.widget.FILL_RECT, {
        x: 0, y, w: width, h: spacerH, color: 0x000000,
      });

      // Текст тут длиннее экрана - сигнализируем, что можно скроллить вниз
      this.widgets.notLinkedGroup.createWidget(hmUI.widget.PAGE_SCROLLBAR, {});

      this.setVisible(this.widgets.notLinkedGroup, false);
      this.setVisible(this.widgets.notLinkedMintBtn, false);
      this.setVisible(this.widgets.notLinkedLinkBtn, false);
    },

    // Половинка "разрезанной капсулы": полный скруглённый прямоугольник
    // (radius = h/2) + прямоугольник того же цвета без скругления, который
    // перекрывает внутренний угол (обращённый к соседней кнопке) и делает
    // его прямым. Клик обрабатывается на GROUP, как у строк коллекции
    // (attachSelectable) - такой же cancel-on-move, но локальный флаг
    // вместо общего selectedIndex, поскольку эта пара не участвует в
    // клавиатурной навигации (как и прежняя одиночная кнопка). Top-level
    // GROUP (hmUI.createWidget), не вложенный в другой GROUP - см. комментарий
    // в buildNotLinkedGroup().
    buildSplitButton({ x, y, w, h, side, normalColor, pressColor, text, onActivate }) {
      const group = hmUI.createWidget(hmUI.widget.GROUP, { x, y, w, h });
      const radius = h / 2;

      const body = group.createWidget(hmUI.widget.FILL_RECT, {
        x: 0, y: 0, w, h, radius, color: normalColor,
      });
      const squareX = side === "left" ? w - radius : 0;
      const squareOff = group.createWidget(hmUI.widget.FILL_RECT, {
        x: squareX, y: 0, w: radius, h, radius: 0, color: normalColor,
      });

      group.createWidget(hmUI.widget.TEXT, {
        x: 0, y: 0, w, h, color: 0xffffff, text_size: px(28),
        align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
        text,
      });

      const paint = (color) => {
        body.setProperty(hmUI.prop.COLOR, color);
        squareOff.setProperty(hmUI.prop.COLOR, color);
      };

      let pressed = false;
      group.addEventListener(hmUI.event.CLICK_DOWN, () => {
        pressed = true;
        paint(pressColor);
      });
      group.addEventListener(hmUI.event.MOVE, () => {
        pressed = false;
        paint(normalColor);
      });
      group.addEventListener(hmUI.event.CLICK_UP, () => {
        paint(normalColor);
        if (!pressed) return;
        pressed = false;
        onActivate();
      });

      return group;
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
            isHelp ? 'icons/tools_64.png' : 'icons/tools_64bw.png'
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

    // replace(), не push(): если бы этот экран оставался на паузе под Settings,
    // "Обновить" там не смог бы получить ровно один экран Коллекции обратно
    // (устройство-страница не умеет перевыполнить build() у уже живого инстанса —
    // см. .claude/specifications.md §6). page/settings.js сам перехватывает
    // аппаратную кнопку "назад" и явно возвращает на page/collection, поэтому
    // выход без нажатия кнопок на Settings всё равно не пропускает эту страницу.
    openSettings() {
      logger.log("Open settings screen");
      replace({ url: "page/settings" });
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
      const isNotLinked = nextState === SCREEN_NOT_LINKED;

      this.setVisible(this.widgets.loadingGroup, isLoading);
      this.setVisible(this.widgets.errorGroup, isError);
      this.setVisible(this.widgets.notLinkedGroup, isNotLinked);
      // Top-level, не вложены в notLinkedGroup (см. buildNotLinkedGroup) -
      // переключаем отдельно той же меркой.
      this.setVisible(this.widgets.notLinkedMintBtn, isNotLinked);
      this.setVisible(this.widgets.notLinkedLinkBtn, isNotLinked);

      if (isLoading) {
        this.widgets.loadingAnim.show(
          this.layout.loadingAnimX,
          this.layout.loadingAnimY,
          // this.layout.loadingAnimSize,
          // this.layout.loadingAnimSize
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
        request,
      })
        .then((data) => {
          const { status = "", collection = [] } = data;

          if (status === "OK") {
            logger.log('Received collection from phone, items:', collection.length);
            AppStorage.setRecord(STORAGE_KEYS.LINKED, true);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, JSON.stringify(collection));
            this.setScreenState(SCREEN_RESULT, { collection });
          } else if (status === "NO_LINK") {
            logger.log('Wallet is not linked');
            AppStorage.setRecord(STORAGE_KEYS.LINKED, false);
            this.setScreenState(SCREEN_NOT_LINKED);
          } else {
            logger.log("Error from phone:", status);
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

    // Фоновая проверка из состояния "не привязан": привязка могла случиться
    // на сайте, пока эти часы об этом не знают (перенесено из page/nolink.js).
    // Ошибки/NO_LINK игнорируем молча - экран уже показывает всё нужное.
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
          const { status = "", collection = [] } = data;

          if (status === "OK") {
            logger.log('Link confirmed by phone, showing collection');
            WatchApi.sendCtaEvent(this, CTA.LINKED).catch(() => {});
            AppStorage.setRecord(STORAGE_KEYS.LINKED, true);
            AppStorage.setRecord(STORAGE_KEYS.COLLECTION_JSON, JSON.stringify(collection));
            this.setScreenState(SCREEN_RESULT, { collection });
          }
        })
        .catch((err) => {
          this.state.checking = false;
          logger.log("Background link check skipped:", err);
        });
    },

    clearCollection() {
      this.widgets.listItems.forEach((widget) => hmUI.deleteWidget(widget));
      this.widgets.listItems = [];

      if (this.widgets.emptyText) {
        hmUI.deleteWidget(this.widgets.emptyText);
        this.widgets.emptyText = null;
      }
      if (this.widgets.mintButton) {
        hmUI.deleteWidget(this.widgets.mintButton);
        this.widgets.mintButton = null;
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

    renderCollection(collection) {
      this.clearCollection();
      this.state.collectionItems = collection || [];

      const { startX, startY, spacing, buttonWidth, buttonHeight } = this.layout;
      const isEmpty = this.state.collectionItems.length === 0;

      if (isEmpty) {
        const emptyH = px(140);
        const emptyY = startY + px(40);
        this.widgets.emptyText = hmUI.createWidget(hmUI.widget.TEXT, {
          x: px(40),
          y: emptyY,
          w: width - px(80),
          h: emptyH,
          color: 0xffffff, text_size: px(28), text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.CENTER_V,
          text: i18n("empty_collection") || "Collection is empty",
        });

        // Пустая коллекция - лучший момент предложить минт, а не только Settings
        const mintY = emptyY + emptyH + spacing;
        this.buildHelpIcon(mintY + spacing);
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
        src: 'icons/tools_64bw.png',
      });

      this.attachSelectable(this.widgets.helpImg, helpIndex, () => this.openSettings());
    },

    onDestroy() {
      offKey();
      vibrator.stop();
      if (this.widgets.loadingAnim) {
        this.widgets.loadingAnim.delete();
      }
    },
  })
);
