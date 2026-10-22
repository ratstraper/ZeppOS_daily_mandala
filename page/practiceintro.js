import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { Vibrator } from "@zos/sensor";
import { replace } from "@zos/router";
import { BasePage } from "@zeppos/zml/base-page";
import AppStorage from "../utils/config/storage.js";
import { WatchApi } from "../utils/watch-api";
import { STORAGE_KEYS, CTA } from "../utils/config/constants.js";
import { width } from "../utils/config/device.js";

const logger = Logger.getLogger("mandala_day");
const vibrator = new Vibrator();

/**
 * «Мягкая» справка перед входом в Практику: вертикальный скролл
 * (SCROLL_MODE_FREE по умолчанию), слайды DAILY_PRACTICE собраны один за
 * другим, затем чекбокс "не показывать снова" и кнопка [Начать практику →].
 * Открывается из page/index.js, пока флаг STORAGE_KEYS.PRACTICE_INTRO_SEEN
 * не выставлен — то есть может показываться многократно, до тех пор пока
 * пользователь сам не отметит чекбокс.
 */

const SLIDES = [
  { titleKey: "help_practice_slide1_title", textKey: "help_practice_slide1_text" },
  { titleKey: "help_practice_slide2_title", textKey: "help_practice_slide2_text" },
  { titleKey: "help_practice_slide3_title", textKey: "help_practice_slide3_text" },
];

const UI = {
  padX: px(28),
  topY: px(42),

  titleSize: px(30),
  textSize: px(24),

  dividerW: px(60),
  dividerH: px(2),

  gapAfterTitle: px(14),
  gapAfterText: px(32),
  gapAfterLastText: px(40),

  checkboxSize: px(36),
  checkboxInnerPad: px(7),
  checkTextSize: px(24),
  checkRowGap: px(16),
  gapAfterCheckbox: px(36),

  btnH: px(72),
  btnRadius: px(36),
  btnTextSize: px(28),

  bottomPad: px(80),
};

function measureText(text, size, textWidth) {
  return hmUI.getTextLayout(text, {
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
      dontShowAgain: false,
    },
    widgets: {
      checkboxInner: null,
    },

    build() {
      logger.log(`PRACTICEINTRO.JS`);
      WatchApi.sendCtaEvent(this, CTA.OPEN_DAILY_HELP).catch(() => {});

      const contentW = width - UI.padX * 2;
      let y = UI.topY;

      SLIDES.forEach((slide, index) => {
        const title = i18n(slide.titleKey);
        const text = i18n(slide.textKey);

        const titleLayout = measureText(title, UI.titleSize, contentW);
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: UI.padX, y, w: contentW, h: titleLayout.height,
          color: 0xffffff, text_size: UI.titleSize, text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.TOP,
          text: title,
        });
        y += titleLayout.height + UI.gapAfterTitle;

        const textLayout = measureText(text, UI.textSize, contentW);
        hmUI.createWidget(hmUI.widget.TEXT, {
          x: UI.padX, y, w: contentW, h: textLayout.height,
          color: 0xc7c7c7, text_size: UI.textSize, text_style: hmUI.text_style.WRAP,
          align_h: hmUI.align.CENTER_H, align_v: hmUI.align.TOP,
          text,
        });
        y += textLayout.height;

        if (index < SLIDES.length - 1) {
          y += UI.gapAfterText;
          hmUI.createWidget(hmUI.widget.FILL_RECT, {
            x: (width - UI.dividerW) / 2, y,
            w: UI.dividerW, h: UI.dividerH,
            color: 0x333333, radius: px(1),
          });
          y += UI.dividerH + UI.gapAfterText;
        } else {
          y += UI.gapAfterLastText;
        }
      });

      y = this.buildDontShowCheckbox(y, contentW) + UI.gapAfterCheckbox;

      hmUI.createWidget(hmUI.widget.BUTTON, {
        x: UI.padX, y, w: contentW, h: UI.btnH, radius: UI.btnRadius,
        normal_color: 0x1f8ed6, press_color: 0x156fa8,
        text: i18n("help_practice_slide3_action"),
        text_size: UI.btnTextSize, color: 0xffffff,
        click_func: () => {
          hapticStrong();
          this.finishIntro();
        },
      });
      y += UI.btnH;

      hmUI.createWidget(hmUI.widget.FILL_RECT, {
        x: 0, y, w: width, h: UI.bottomPad, color: 0x000000,
      });
    },

    // Квадрат-рамка + внутренний квадрат, который переключает цвет —
    // тот же приём, что уже используется для фокуса кнопок на
    // page/practice.js, просто без обводки фокуса, а как чекбокс.
    buildDontShowCheckbox(y, contentW) {
      const labelW = contentW - UI.checkboxSize - UI.checkRowGap;
      const label = i18n("practice_intro_dont_show_again");
      const labelLayout = measureText(label, UI.checkTextSize, labelW);
      const rowH = Math.max(UI.checkboxSize, labelLayout.height);

      const row = hmUI.createWidget(hmUI.widget.GROUP, {
        x: 0, y, w: width, h: rowH,
      });

      const boxY = (rowH - UI.checkboxSize) / 2;
      row.createWidget(hmUI.widget.FILL_RECT, {
        x: UI.padX, y: boxY, w: UI.checkboxSize, h: UI.checkboxSize,
        color: 0x5a5a5a, radius: px(6),
      });

      this.widgets.checkboxInner = row.createWidget(hmUI.widget.FILL_RECT, {
        x: UI.padX + UI.checkboxInnerPad, y: boxY + UI.checkboxInnerPad,
        w: UI.checkboxSize - UI.checkboxInnerPad * 2,
        h: UI.checkboxSize - UI.checkboxInnerPad * 2,
        color: 0x000000, radius: px(3),
      });

      row.createWidget(hmUI.widget.TEXT, {
        x: UI.padX + UI.checkboxSize + UI.checkRowGap, y: 0, w: labelW, h: rowH,
        color: 0xc7c7c7, text_size: UI.checkTextSize, text_style: hmUI.text_style.WRAP,
        align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V,
        text: label,
      });

      row.addEventListener(hmUI.event.CLICK_UP, () => {
        hapticSoft();
        this.state.dontShowAgain = !this.state.dontShowAgain;
        this.widgets.checkboxInner.setProperty(
          hmUI.prop.COLOR,
          this.state.dontShowAgain ? 0x1f8ed6 : 0x000000
        );
      });

      return y + rowH;
    },

    finishIntro() {
      if (this.state.dontShowAgain) {
        logger.log("Practice intro: dismissed for good");
        AppStorage.setRecord(STORAGE_KEYS.PRACTICE_INTRO_SEEN, true);
      }
      replace({ url: "page/practice" });
    },

    onDestroy() {
      vibrator.stop();
    },
  })
);
