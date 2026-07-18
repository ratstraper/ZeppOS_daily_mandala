import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";

import { width, height, screenShape, getDateFormatString } from "../utils/config/device.js";
import { TITLE } from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");

Page(
  BasePage({
    state: {
    },
    widgets: {
      title: null,
      text: null,
      btn: null,
      questionImg: null
    },
    build() {
        logger.log(`SETTINGS.JS`);
        this.layout = this.createLayout();

        this.buildTitle();
    },
    createLayout() {
      const startX = px(40);            // Центрирование (40 пикселей от каждого края)      
      const startY = px(130);           // Отступ сверху (под заголовком)
      const buttonHeight = px(126);     // Высота одной плашки
      const spacing = px(25);           // Расстояние между плашками
      const buttonWidth = width - (2 * startX); // Ширина плашки (экран минус отступы по бокам)

      return {
        startX,
        startY,
        buttonHeight,
        spacing,
        buttonWidth
      };
    },
    buildTitle() {
      this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
        ...TITLE(this.layout, i18n("settings") || "Settings"),
      });
    },
    onDestroy() {},
  })
);