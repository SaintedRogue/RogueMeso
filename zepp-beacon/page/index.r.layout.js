import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Round-display layout (480 design width). Content stays inside the circle's safe area.

export const TITLE_TEXT = {
  x: px(60),
  y: px(52),
  w: DEVICE_WIDTH - 2 * px(60),
  h: px(56),
  color: 0x3fc6c9,
  text_size: px(32),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_TEXT = {
  x: px(64),
  y: px(114),
  w: DEVICE_WIDTH - 2 * px(64),
  h: px(140),
  color: 0xffffff,
  text_size: px(28),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const SYNC_BUTTON = {
  x: (DEVICE_WIDTH - px(280)) / 2,
  y: px(248),
  w: px(280),
  h: px(72),
  text_size: px(32),
  radius: px(36),
  normal_color: 0x0e7c86,
  press_color: 0x3fc6c9,
  text: "Sync HR",
};

export const RECORD_BUTTON = {
  x: (DEVICE_WIDTH - px(290)) / 2,
  y: px(332),
  w: px(140),
  h: px(56),
  text_size: px(26),
  radius: px(28),
  normal_color: 0x2a3340,
  press_color: 0x3fc6c9,
  text: "Record",
};

export const PING_BUTTON = {
  x: (DEVICE_WIDTH - px(290)) / 2 + px(150),
  y: px(332),
  w: px(140),
  h: px(56),
  text_size: px(26),
  radius: px(28),
  normal_color: 0x2a3340,
  press_color: 0x3fc6c9,
  text: "Ping",
};

// Bottom row hugs the circle's lower safe area — keep it narrower than the rows above.
export const WELLNESS_BUTTON = {
  x: (DEVICE_WIDTH - px(240)) / 2,
  y: px(396),
  w: px(115),
  h: px(52),
  text_size: px(22),
  radius: px(26),
  normal_color: 0x2a3340,
  press_color: 0x3fc6c9,
  text: "Wellness",
};

export const TRACK_BUTTON = {
  x: (DEVICE_WIDTH - px(240)) / 2 + px(125),
  y: px(396),
  w: px(115),
  h: px(52),
  text_size: px(22),
  radius: px(26),
  normal_color: 0x2a3340,
  press_color: 0x3fc6c9,
  text: "Track",
};
