import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Square-display layout (390 design width, 450 tall). Same design system as round:
// OLED black, HERO orange primary. Two actions only: Track Workout + Ping.

const COLOR = {
  primary: 0xff6a2b,
  primaryPress: 0xc2410c,
  onPrimary: 0x1a0f08,
  surface: 0x1c2733,
  surfacePress: 0x33475c,
  card: 0x141b24,
  text: 0xf8fafc,
  textDim: 0x9fb0c0,
};

export const ICON_IMG = {
  x: (DEVICE_WIDTH - px(44)) / 2,
  y: px(34),
  src: "icon_sm.png",
};

export const TITLE_TEXT = {
  x: px(60),
  y: px(84),
  w: DEVICE_WIDTH - 2 * px(60),
  h: px(28),
  color: COLOR.textDim,
  text_size: px(20),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_CARD = {
  x: px(28),
  y: px(124),
  w: DEVICE_WIDTH - 2 * px(28),
  h: px(104),
  radius: px(20),
  color: COLOR.card,
};

export const STATUS_TEXT = {
  x: px(40),
  y: px(130),
  w: DEVICE_WIDTH - 2 * px(40),
  h: px(92),
  color: COLOR.text,
  text_size: px(24),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const TRACK_BUTTON = {
  x: px(28),
  y: px(250),
  w: DEVICE_WIDTH - 2 * px(28),
  h: px(64),
  text_size: px(28),
  radius: px(32),
  normal_color: COLOR.primary,
  press_color: COLOR.primaryPress,
  color: COLOR.onPrimary,
  text: "Track Workout",
};

export const PING_BUTTON = {
  x: (DEVICE_WIDTH - px(200)) / 2,
  y: px(330),
  w: px(200),
  h: px(54),
  text_size: px(24),
  radius: px(27),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Ping",
};
