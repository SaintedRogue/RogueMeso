import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Square-display layout (390 design width).

export const TITLE_TEXT = {
  x: px(30),
  y: px(30),
  w: DEVICE_WIDTH - 2 * px(30),
  h: px(46),
  color: 0x3fc6c9,
  text_size: px(28),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_TEXT = {
  x: px(26),
  y: px(84),
  w: DEVICE_WIDTH - 2 * px(26),
  h: px(130),
  color: 0xffffff,
  text_size: px(24),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const RECORD_BUTTON = {
  x: (DEVICE_WIDTH - px(250)) / 2,
  y: px(226),
  w: px(250),
  h: px(70),
  text_size: px(30),
  radius: px(35),
  normal_color: 0x0e7c86,
  press_color: 0x3fc6c9,
  text: "Record",
};

export const PING_BUTTON = {
  x: (DEVICE_WIDTH - px(210)) / 2,
  y: px(308),
  w: px(210),
  h: px(52),
  text_size: px(24),
  radius: px(26),
  normal_color: 0x2a3340,
  press_color: 0x3fc6c9,
  text: "Ping server",
};
