import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Square-display layout (390 design width, 450 tall). Same design system as the
// round layout: OLED black, HERO orange primary, slate secondary, dim diagnostics.

const COLOR = {
  primary: 0xff6a2b,
  primaryPress: 0xc2410c,
  onPrimary: 0x1a0f08,
  surface: 0x1c2733,
  surfacePress: 0x33475c,
  surfaceDim: 0x141b24,
  card: 0x141b24,
  text: 0xf8fafc,
  textDim: 0x9fb0c0,
};

export const ICON_IMG = {
  x: (DEVICE_WIDTH - px(44)) / 2,
  y: px(22),
  src: "icon_sm.png",
};

export const TITLE_TEXT = {
  x: px(60),
  y: px(70),
  w: DEVICE_WIDTH - 2 * px(60),
  h: px(28),
  color: COLOR.textDim,
  text_size: px(20),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_CARD = {
  x: px(28),
  y: px(104),
  w: DEVICE_WIDTH - 2 * px(28),
  h: px(96),
  radius: px(20),
  color: COLOR.card,
};

export const STATUS_TEXT = {
  x: px(40),
  y: px(110),
  w: DEVICE_WIDTH - 2 * px(40),
  h: px(84),
  color: COLOR.text,
  text_size: px(24),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

export const TRACK_BUTTON = {
  x: px(28),
  y: px(210),
  w: DEVICE_WIDTH - 2 * px(28),
  h: px(60),
  text_size: px(28),
  radius: px(30),
  normal_color: COLOR.primary,
  press_color: COLOR.primaryPress,
  color: COLOR.onPrimary,
  text: "Track Workout",
};

export const SYNC_BUTTON = {
  x: px(28),
  y: px(280),
  w: px(162),
  h: px(54),
  text_size: px(24),
  radius: px(27),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.text,
  text: "Sync HR",
};

export const WELLNESS_BUTTON = {
  x: DEVICE_WIDTH - px(28) - px(162),
  y: px(280),
  w: px(162),
  h: px(54),
  text_size: px(24),
  radius: px(27),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.text,
  text: "Wellness",
};

export const RECORD_BUTTON = {
  x: px(28),
  y: px(344),
  w: px(162),
  h: px(44),
  text_size: px(20),
  radius: px(22),
  normal_color: COLOR.surfaceDim,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Record",
};

export const PING_BUTTON = {
  x: DEVICE_WIDTH - px(28) - px(162),
  y: px(344),
  w: px(162),
  h: px(44),
  text_size: px(20),
  radius: px(22),
  normal_color: COLOR.surfaceDim,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Ping",
};
