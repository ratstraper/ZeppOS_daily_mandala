import { createWidget, widget, align, text_style, event } from "@zos/ui";
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

const logger = Logger.getLogger("help_screen");

const { width, height } = getDeviceInfo();

// ─── Vibrator ────────────────────────────────────────────────────────────────
const vibrator = new Vibrator();

function hapticTick() {
  vibrator.stop();
  vibrator.start(23); // лёгкий одиночный tick
  setTimeout(() => vibrator.stop(), 80);
}

function hapticCta() {
  vibrator.stop();
  vibrator.start(25); // двойной акцент — "важный момент"
  setTimeout(() => vibrator.stop(), 200);
}

// ─── Тексты слайдов ──────────────────────────────────────────────────────────
const WEBSITE_URL = "https://mandala.garageno9.site"; // замени на свой URL

const SLIDES = [
  {
    title: i18n("help_practice_slide1_title"),
    lines: [
      i18n("help_practice_slide1_line1"),
    ],
    qr: null,
    cta: null,
  },
  {
    title: "One date.\nOne mandala.",
    lines: [
      "Every calendar date has",
      "exactly one mandala.",
      "",
      "Only one person",
      "can ever own it.",
      "",
      "Your birthday.",
      "A day that changed your life.",
      "It may still be unclaimed.",
    ],
    qr: null,
    cta: null,
  },
  {
    title: "Claim yours",
    lines: [
      "See your personal mandala",
      "and check if your date",
      "is still available.",
      "",
      "Once taken —",
      "it is gone forever.",
    ],
    qr: WEBSITE_URL,   // ← QR-код на слайде 3
    cta: {
      label: "Visit website →",
      url: WEBSITE_URL,
    },
  },
];

// ─── Page ─────────────────────────────────────────────────────────────────────

Page(
  BasePage({
    build() {
      const slideCount = SLIDES.length;

      // Горизонтальный swiper
      setScrollMode({
        mode: SCROLL_MODE_SWIPER_HORIZONTAL,
        options: {
          width,
          count: slideCount,
        },
      });

      // Dot-индикатор сверху
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

      // Строим слайды
      SLIDES.forEach((slide, index) => {
        this.buildSlide(slide, index);
      });

      // ── Haptic при свайпе ──────────────────────────────────────────
      onPageScrollDone(() => {
        const idx = getSwiperIndex(); // 0-based
        if (idx === 2) {
          // Пришли на CTA-слайд — двойной haptic
          hapticCta();
        } else {
          // Обычный переход между слайдами — лёгкий tick
          hapticTick();
        }
      });
    },

    onDestroy() {
      offPageScrollDone();
      vibrator.stop();
    },

    // ─── Построение одного слайда ──────────────────────────────────────
    buildSlide(slide, index) {
      const offsetX = width * index;
      const isCtaSlide = slide.qr !== null;

      // ── Заголовок
      createWidget(widget.TEXT, {
        x: offsetX + px(24),
        y: px(42),
        w: width - px(48),
        h: px(80),
        color: 0xffffff,
        text_size: px(30),
        text_style: text_style.WRAP,
        align_h: align.CENTER_H,
        align_v: align.CENTER_V,
        text: slide.title,
      });

      // ── Разделитель
      createWidget(widget.FILL_RECT, {
        x: offsetX + (width - px(60)) / 2,
        y: px(124),
        w: px(60),
        h: px(2),
        color: 0x333333,
        radius: px(1),
      });

      if (!isCtaSlide) {
        // ── Слайды 1–2: только текстовые строки ─────────────────────────
        const lineStartY = px(138);
        const lineH = px(32);

        slide.lines.forEach((line, lineIndex) => {
          createWidget(widget.TEXT, {
            x: offsetX + px(24),
            y: lineStartY + lineIndex * lineH,
            w: width - px(48),
            h: lineH,
            color: line === "" ? 0x000000 : 0xbbbbbb,
            text_size: px(22),
            text_style: text_style.WRAP,
            align_h: align.CENTER_H,
            align_v: align.CENTER_V,
            text: line,
          });
        });
      } else {
        // ── Слайд 3: 2 строки текста + QR-код + кнопка ───────────────────
        const textLines = slide.lines.slice(0, 3);
        const lineStartY = px(136);
        const lineH = px(30);

        textLines.forEach((line, lineIndex) => {
          createWidget(widget.TEXT, {
            x: offsetX + px(24),
            y: lineStartY + lineIndex * lineH,
            w: width - px(48),
            h: lineH,
            color: line === "" ? 0x000000 : 0xbbbbbb,
            text_size: px(22),
            text_style: text_style.WRAP,
            align_h: align.CENTER_H,
            align_v: align.CENTER_V,
            text: line,
          });
        });

        // ── QR-код ────────────────────────────────────────────────────────
        // Белый фон обязателен — QRCODE виджет рендерит чёрный QR на белом
        const qrSize  = px(140);
        const bgPad   = px(10);
        const bgSize  = qrSize + bgPad * 2;
        const bgX     = offsetX + (width - bgSize) / 2;
        const bgY     = px(232);

        createWidget(widget.QRCODE, {
          content: slide.qr,
          x: bgX + bgPad,   // QR чуть внутрь от белого фона
          y: bgY + bgPad,
          w: qrSize,
          h: qrSize,
          bg_x: bgX,        // белый фон с отступом
          bg_y: bgY,
          bg_w: bgSize,
          bg_h: bgSize,
          bg_radius: px(12),
        });

        // ── Подпись под QR ─────────────────────────────────────────────────
        createWidget(widget.TEXT, {
          x: offsetX + px(24),
          y: bgY + bgSize + px(8),
          w: width - px(48),
          h: px(28),
          color: 0x666666,
          text_size: px(20),
          text_style: text_style.NONE,
          align_h: align.CENTER_H,
          align_v: align.CENTER_V,
          text: "https://mandala.garageno9.site",
        });

        // ── CTA-кнопка ─────────────────────────────────────────────────────
        /*
        const ctaBtnH  = px(72);
        const ctaBtnW  = width - px(64);
        const ctaBtnX  = offsetX + px(32);
        const ctaBtnY  = height - px(100);

        createWidget(widget.BUTTON, {
          x: ctaBtnX,
          y: ctaBtnY,
          w: ctaBtnW,
          h: ctaBtnH,
          radius: px(36),
          normal_color: 0x1F8ED6,
          press_color: 0x156FA8,
          text: slide.cta.label,
          text_size: px(24),
          color: 0xffffff,
          click_func: () => {
            logger.log("CTA clicked →", slide.cta.url);
            hapticTick();
            push({
              url: "page/webview/index",
              params: JSON.stringify({ url: slide.cta.url }),
            });
          },
        });
        */
      }
    },
  })
);