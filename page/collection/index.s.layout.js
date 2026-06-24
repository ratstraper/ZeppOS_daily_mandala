import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";

import {
  DEFAULT_COLOR,
  DEFAULT_COLOR_TRANSPARENT,
} from "../../utils/config/constants";
import { DEVICE_WIDTH } from "../../utils/config/device";

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
