import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Square-display layout (390 design width).

export const TITLE_TEXT = {
  x: px(30),
  y: px(36),
  w: DEVICE_WIDTH - 2 * px(30),
  h: px(50),
  color: 0x3fc6c9,
  text_size: px(30),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_TEXT = {
  x: px(30),
  y: px(100),
  w: DEVICE_WIDTH - 2 * px(30),
  h: px(140),
  color: 0xffffff,
  text_size: px(26),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const PING_BUTTON = {
  x: (DEVICE_WIDTH - px(260)) / 2,
  y: px(260),
  w: px(260),
  h: px(72),
  text_size: px(30),
  radius: px(36),
  normal_color: 0x0e7c86,
  press_color: 0x3fc6c9,
  text: "Send ping",
};
