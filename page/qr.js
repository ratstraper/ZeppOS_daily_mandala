import {
  setStatusBarVisible,
  createWidget,
  widget,
  align,
  text_style,
  getTextLayout,
} from "@zos/ui";
import {
  setPageBrightTime, resetPageBrightTime,
  pauseDropWristScreenOff, resetDropWristScreenOff
} from '@zos/display'
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import { back } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";
import { WatchApi } from "../utils/watch-api";
import { CTA } from "../utils/config/constants.js";
import { SECONDARY_BUTTON_HEIGHT, WORK_SCREEN as ui } from "zosLoader:./index.[pf].layout.js";
const logger = Logger.getLogger("help_qr");

const { width, height } = getDeviceInfo();
const vibrator = new Vibrator();

const UI = {
  titleX: ui.left, //px(24),
  titleY: px(34),
  titleW: ui.width, //width - px(48),
  titleSize: px(30),

  introX: ui.left, //px(28),
  introY: px(92),
  introW: ui.width, //width - px(56),
  introSize: px(20),

  qrSize: px(156),
  qrPad: px(10),
  qrY: px(156),

  domainX: px(24),
  domainSize: px(18),

  textX: ui.left, //px(24),
  textW: ui.width, //width - px(48),
  textSize: px(20),

  backX: ui.left, //px(36),
  backW: ui.width, //width - px(72),
  backH: SECONDARY_BUTTON_HEIGHT,
  backY: height - px(94),
};


function measureText(text, size, textWidth) {
  const layout = getTextLayout(text, {
    text_size: size,
    text_width: textWidth,
    wrapped: 1,
  });
  // getTextLayout.height перестаёт расти после ~2 строк (известный баг ZeppOS SDK,
  // zepp-health/discussions#347) — подстраховываемся через rows.
  return { ...layout, height: Math.max(layout.height, layout.rows * size * 1.3) };
}

function hapticSoft() {
  vibrator.stop();
  vibrator.start(23);
  setTimeout(() => vibrator.stop(), 80);
}

// Помечает, из какого места приложения открыт QR, чтобы сайт мог
// увидеть источник перехода в своей аналитике.
function withRef(url, ref) {
  if (!ref) return url;
  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}ref=${encodeURIComponent(ref)}`;
}

Page(
  BasePage({
    state: {
      title: i18n("help_qr_title"),
      url: "https://mandala.garageno9.site",
      ref: null,
      cta: CTA.OPEN_QR,
    },

    onInit(params) {
      if (!params) return;
      try {
        const parsed = JSON.parse(params);
        if (parsed?.title) this.state.title = parsed.title;
        if (parsed?.url) this.state.url = parsed.url;
        if (parsed?.ref) this.state.ref = parsed.ref;
        if (parsed?.cta) this.state.cta = parsed.cta;
      } catch (e) {
        logger.log("params parse failed", e);
      }
    },

    build() {
      setStatusBarVisible(false);
      logger.log(`QR.JS`);
      WatchApi.sendCtaEvent(this, this.state.cta).catch(() => {});
      const domain = i18n("help_qr_domain");
      this.showQr(this.state.title, withRef(this.state.url, this.state.ref), domain);
    },

    showQr(title, url, domain) {
      setPageBrightTime({ brightTime: 600000 })       // держим экран, пока висит QR
      pauseDropWristScreenOff({ duration: 600000 })
      const size = Math.floor(Math.min(width, height) * 0.45);
      const titleY = Math.floor(height * 0.05);
      const titleLayout = measureText(title, 28, width);
      createWidget(widget.TEXT, {
        x: 0,
        y: titleY,
        w: width,
        h: Math.max(40, titleLayout.height),
        color: 0xffffff,
        text_size: 28,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.TOP,
        text: title
      });

      const qrPad = px(10)
      const bgX = Math.floor((width - size) / 2);
      // Длинный title (приходит с сервера, длина не ограничена) может
      // перенестись на 2+ строки — тогда QR сдвигается вниз, чтобы не перекрыться.
      let bgY = Math.max(Math.floor(height * 0.17), titleY + titleLayout.height + px(8));
  
      createWidget(widget.QRCODE, {
        content: url,
        x: bgX + qrPad, 
        y: bgY + qrPad, 
        w: size - qrPad * 2, 
        h: size - qrPad * 2,
        bg_x: bgX,
        bg_y: bgY,
        bg_w: size,
        bg_h: size,
        bg_radius: px(14),
      });

      bgY = bgY + qrPad + size; 
      createWidget(widget.TEXT, {
        x: 0, 
        y: bgY, //Math.floor(height * 0.78), 
        w: width, 
        h: UI.backY - bgY,
        color: 0x888888, 
        text_size: 22,
        text_style: text_style.NONE,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: domain
      });

      createWidget(widget.BUTTON, {
        x: UI.backX,
        y: UI.backY,
        w: UI.backW,
        h: UI.backH,
        radius: UI.backH / 2,
        normal_color: 0x2c2c2c,
        press_color: 0x424242,
        text: i18n("common_back"),
        text_size: px(28), //22
        color: 0xffffff,
        click_func: () => {
          hapticSoft();
          back();
        },
      });
    },

    onDestroy() {
      vibrator.stop();
      resetPageBrightTime()
      resetDropWristScreenOff() 
    },
  })
);