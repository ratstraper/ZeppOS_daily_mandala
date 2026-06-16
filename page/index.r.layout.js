import * as hmUI from "@zos/ui";
import { getText as i18n} from "@zos/i18n";
import { px } from "@zos/utils";

import {
  DEFAULT_COLOR,
  DEFAULT_COLOR_TRANSPARENT,
} from "../utils/config/constants";
import { DEVICE_WIDTH } from "../utils/config/device";


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