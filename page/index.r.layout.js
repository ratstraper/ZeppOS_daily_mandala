import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { px } from "@zos/utils";

import {
  DEFAULT_COLOR,
  DEFAULT_COLOR_TRANSPARENT,
} from "../utils/config/constants";
import { DEVICE_WIDTH } from "../utils/config/device";

export const NORMAL_COLOR = 0x0E8CE6;
export const PRESSED_COLOR = 0x0B72BD;
export const SELECTED_COLOR = 0x3397de;

export const FETCH_RESULT_TEXT = {
  x: px(56),
  y: px(74),
  w: DEVICE_WIDTH - 2 * px(56),
  h: px(200),
  color: 0xffffff,
  text_size: px(36),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const TITLE = (layout, text) => {
  return {
    x: 0,
    y: px(38),      //layout.titleY, 40
    w: DEVICE_WIDTH,
    h: px(56),      //layout.titleH, 60
    color: 0xffffff,
    text_size: px(40),
    text_style: hmUI.text_style.NONE,
    align_h: hmUI.align.CENTER_H,
    align_v: hmUI.align.CENTER_V,
    text: text,
  };
};

export const MENU_BUTTON = (startX, yPos, itemWidth, itemHeight, name, formattedDate) => {
  const group = hmUI.createWidget(hmUI.widget.GROUP, {
    x: startX, y: yPos, w: itemWidth, h: itemHeight
  });

  const bgRect = group.createWidget(hmUI.widget.FILL_RECT, {
    x: 0, y: 0, w: itemWidth, h: itemHeight,
    color: NORMAL_COLOR, radius: px(63)
  });

  group.createWidget(hmUI.widget.TEXT, {
    x: px(24), y: px(15), w: itemWidth - px(48), h: px(40),
    color: 0xffffff, text_size: px(32), align_v: hmUI.align.CENTER_V,
    text: name || "Unknown"
  });

  group.createWidget(hmUI.widget.TEXT, {
    x: px(24), y: px(55), w: itemWidth - px(48), h: px(40),
    color: 0xa0a0a0, text_size: px(24), align_v: hmUI.align.CENTER_V,
    text: formattedDate
  });

  return group;
};