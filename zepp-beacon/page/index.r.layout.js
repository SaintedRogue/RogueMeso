import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Round-display layout (480 design width, Active 2 Round renders at 466).
// Design system: OLED black canvas, RogueMeso HERO orange (#ff6a2b) primary CTA,
// slate secondary. Two actions only: Track Workout (primary) + Ping (diagnostic).

const COLOR = {
  primary: 0xff6a2b, // brand orange (matches the web app's --color-accent)
  primaryPress: 0xc2410c,
  onPrimary: 0x1a0f08, // near-black on orange: ~8:1 contrast
  surface: 0x1c2733,
  surfacePress: 0x33475c,
  card: 0x141b24,
  text: 0xf8fafc,
  textDim: 0x9fb0c0,
};

export const ICON_IMG = {
  x: (DEVICE_WIDTH - px(48)) / 2,
  y: px(48),
  src: "icon_sm.png",
};

export const TITLE_TEXT = {
  x: px(90),
  y: px(102),
  w: DEVICE_WIDTH - 2 * px(90),
  h: px(34),
  color: COLOR.textDim,
  text_size: px(24),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_CARD = {
  x: px(72),
  y: px(150),
  w: DEVICE_WIDTH - 2 * px(72),
  h: px(112),
  radius: px(24),
  color: COLOR.card,
};

export const STATUS_TEXT = {
  x: px(88),
  y: px(156),
  w: DEVICE_WIDTH - 2 * px(88),
  h: px(100),
  color: COLOR.text,
  text_size: px(28),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

// The one primary action on the screen: workout HR tracking.
export const TRACK_BUTTON = {
  x: (DEVICE_WIDTH - px(300)) / 2,
  y: px(286),
  w: px(300),
  h: px(72),
  text_size: px(30),
  radius: px(36),
  normal_color: COLOR.primary,
  press_color: COLOR.primaryPress,
  color: COLOR.onPrimary,
  text: "Track Workout",
};

// Diagnostic: connectivity check, visually subordinate, inside the bottom chord.
export const PING_BUTTON = {
  x: (DEVICE_WIDTH - px(180)) / 2,
  y: px(372),
  w: px(180),
  h: px(52),
  text_size: px(24),
  radius: px(26),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Ping",
};
