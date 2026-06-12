import {
  createWidget,
  widget,
  align,
  text_style,
  getTextLayout,
} from "@zos/ui";
import { getText } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import { back } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";

const logger = Logger.getLogger("help_qr");

const { width, height } = getDeviceInfo();
const vibrator = new Vibrator();

const UI = {
  titleX: px(24),
  titleY: px(34),
  titleW: width - px(48),
  titleSize: px(30),

  introX: px(28),
  introY: px(92),
  introW: width - px(56),
  introSize: px(20),

  qrSize: px(156),
  qrPad: px(10),
  qrY: px(156),

  domainX: px(24),
  domainSize: px(18),

  textX: px(24),
  textW: width - px(48),
  textSize: px(20),

  backX: px(36),
  backW: width - px(72),
  backH: px(64),
  backY: height - px(94),
};

function t(key) {
  return getText(key);
}

function measureText(text, size, textWidth) {
  return getTextLayout(text, {
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
      url: "https://mandala.garageno9.site",
    },

    onInit(params) {
      if (!params) return;
      try {
        const parsed = JSON.parse(params);
        if (parsed?.url) this.state.url = parsed.url;
      } catch (e) {
        logger.log("params parse failed", e);
      }
    },

    build() {
      const title = t("help_qr_title");
      const intro = t("help_qr_intro");
      const domain = t("help_qr_domain");
      const text = t("help_qr_text");

      const titleLayout = measureText(title, UI.titleSize, UI.titleW);
      const introLayout = measureText(intro, UI.introSize, UI.introW);
      const textLayout = measureText(text, UI.textSize, UI.textW);

      createWidget(widget.TEXT, {
        x: UI.titleX,
        y: UI.titleY,
        w: UI.titleW,
        h: titleLayout.height,
        color: 0xffffff,
        text_size: UI.titleSize,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.TOP,
        text: title,
      });

      createWidget(widget.TEXT, {
        x: UI.introX,
        y: UI.introY,
        w: UI.introW,
        h: introLayout.height,
        color: 0xbdbdbd,
        text_size: UI.introSize,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.TOP,
        text: intro,
      });

      const bgSize = UI.qrSize + UI.qrPad * 2;
      const bgX = (width - bgSize) / 2;
      const bgY = UI.qrY;

      createWidget(widget.QRCODE, {
        content: this.state.url,
        x: bgX + UI.qrPad,
        y: bgY + UI.qrPad,
        w: UI.qrSize,
        h: UI.qrSize,
        bg_x: bgX,
        bg_y: bgY,
        bg_w: bgSize,
        bg_h: bgSize,
        bg_radius: px(14),
      });

      createWidget(widget.TEXT, {
        x: UI.domainX,
        y: bgY + bgSize + px(12),
        w: width - px(48),
        h: px(24),
        color: 0x6f6f6f,
        text_size: UI.domainSize,
        text_style: text_style.NONE,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: domain,
      });

      createWidget(widget.TEXT, {
        x: UI.textX,
        y: bgY + bgSize + px(46),
        w: UI.textW,
        h: textLayout.height,
        color: 0xc7c7c7,
        text_size: UI.textSize,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.TOP,
        text,
      });

      createWidget(widget.BUTTON, {
        x: UI.backX,
        y: UI.backY,
        w: UI.backW,
        h: UI.backH,
        radius: px(32),
        normal_color: 0x2c2c2c,
        press_color: 0x424242,
        text: t("common_back"),
        text_size: px(22),
        color: 0xffffff,
        click_func: () => {
          hapticSoft();
          back();
        },
      });
    },

    onDestroy() {
      vibrator.stop();
    },
  })
);