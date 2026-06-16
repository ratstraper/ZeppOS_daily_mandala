import * as hmUI from "@zos/ui";
import { getText as i18n} from "@zos/i18n";
import { px } from "@zos/utils";

import {
  DEFAULT_COLOR,
  DEFAULT_COLOR_TRANSPARENT,
} from "../../utils/config/constants";
import { DEVICE_WIDTH } from "../../utils/config/device";

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
