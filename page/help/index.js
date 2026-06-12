import { createWidget, widget, align, text_style, getTextLayout } from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { getDeviceInfo } from "@zos/device";
import {
  setScrollMode,
  SCROLL_MODE_SWIPER_HORIZONTAL,
  getSwiperIndex,
  onPageScrollDone,
  offPageScrollDone,
} from "@zos/page";
import { push } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";

const logger = Logger.getLogger("main_help");

const { width, height } = getDeviceInfo();
const vibrator = new Vibrator();

const UI = {
  titleX: px(24),
  titleY: px(42),
  titleW: width - px(48),
  titleSize: px(30),

  dividerW: px(60),
  dividerH: px(2),
  dividerY: px(124),

  textX: px(24),
  textY: px(142),
  textW: width - px(56),
  textSize: px(22),

  actionX: px(28),
  actionW: width - px(56),
  actionH: px(72),
  actionY: height - px(104),
};

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

function hapticStrong() {
  vibrator.stop();
  vibrator.start(25);
  setTimeout(() => vibrator.stop(), 180);
}

Page(
  BasePage({
    state: {
      slides: [],
    },

    onInit(params) {
      if (params) {
        try {
          const parsed = JSON.parse(params);
          if (parsed.slides && Array.isArray(parsed.slides)) {
            this.state.slides = parsed.slides;
          }
        } catch (e) {
          logger.error("Failed to parse params", e);
        }
      }
    },

    build() {
      if (this.state.slides.length === 0) {
        logger.error("No slides provided to help page");
        return;
      }

      setScrollMode({
        mode: SCROLL_MODE_SWIPER_HORIZONTAL,
        options: {
          width,
          count: this.state.slides.length,
        },
      });

      createWidget(widget.PAGE_INDICATOR, {
        x: 0,
        y: px(16),
        w: width,
        h: px(16),
        align_h: align.CENTER_H,
        h_space: px(10),
        select_src: "icons/dot_active.png",
        unselect_src: "icons/dot_inactive.png",
        horizontal: true,
      });

      this.state.slides.forEach((slide, index) => {
        this.buildSlide(slide, index);
      });

      onPageScrollDone(() => {
        const current = getSwiperIndex();
        if (current === this.state.slides.length - 1) {
          hapticStrong();
        } else {
          hapticSoft();
        }
      });
    },

    onDestroy() {
      offPageScrollDone();
      vibrator.stop();
    },

    buildSlide(slide, index) {
      const offsetX = width * index;
      const title = i18n(slide.titleKey);
      const text = i18n(slide.textKey);

      const titleLayout = measureText(title, UI.titleSize, UI.titleW);
      const textLayout = measureText(text, UI.textSize, UI.textW);

      createWidget(widget.TEXT, {
        x: offsetX + UI.titleX,
        y: UI.titleY,
        w: UI.titleW,
        h: px(80), //h: titleLayout.height,
        color: 0xffffff,
        text_size: UI.titleSize,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: title,
      });


      createWidget(widget.FILL_RECT, {
        x: offsetX + (width - UI.dividerW) / 2,
        y: UI.dividerY,
        w: UI.dividerW,
        h: UI.dividerH,
        color: 0x333333,
        radius: px(1),
      });

      createWidget(widget.TEXT, {
        x: offsetX + UI.textX,
        y: UI.textY,
        w: UI.textW,
        h: textLayout.height,
        color: 0xc7c7c7,
        text_size: UI.textSize,
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V, //TOP
        text,
      });

      if (slide.action) {
        createWidget(widget.BUTTON, {
          x: offsetX + UI.actionX,
          y: UI.actionY,
          w: UI.actionW,
          h: UI.actionH,
          radius: px(36),
          normal_color: 0x1f8ed6,
          press_color: 0x156fa8,
          text: i18n(slide.action.labelKey),
          text_size: px(24),
          color: 0xffffff,
          click_func: () => {
            hapticStrong();
            logger.log("open QR page", slide.action.url);
            push({
              url: "page/help_qr/index",
              params: JSON.stringify({
                url: slide.action.url,
              }),
            });
          },
        });
      }
    },
  })
);