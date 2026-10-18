import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { px } from "@zos/utils";

import {
  ERROR_COLOR
} from "../utils/config/constants";
import { DEVICE_WIDTH } from "../utils/config/device";

export const PRACTICE_NORMAL_COLOR = 0x0E8CE6;
export const PRACTICE_PRESSED_COLOR = 0x0B72BD;
export const PRACTICE_SELECTED_COLOR = 0x3397de;

export const SECONDARY_BUTTON_HEIGHT = px(100);

export const FETCH_RESULT_TEXT = {
  x: px(50),
  y: px(100),
  w: DEVICE_WIDTH - 2 * px(50),
  h: px(160),
  color: 0xffffff,
  text_size: px(36),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const TITLE = (layout, text) => {
  return {
    x: 0,
    y: px(38),
    w: DEVICE_WIDTH,
    h: px(56),
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