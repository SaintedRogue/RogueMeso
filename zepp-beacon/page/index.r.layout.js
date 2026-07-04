import * as hmUI from "@zos/ui";
import { px } from "@zos/utils";
import { DEVICE_WIDTH } from "../utils/device";

// Round-display layout (480 design width, Active 2 Round renders at 466).
// Design system: OLED black canvas, RogueMeso HERO orange (#ff6a2b) as the single
// primary CTA, slate surfaces for secondary actions, dimmer row for diagnostics.
// Hierarchy: brand → status card → Track (primary) → Sync/Wellness → Record/Ping.

const COLOR = {
  primary: 0xff6a2b, // brand orange (matches the web app's --color-accent)
  primaryPress: 0xc2410c,
  onPrimary: 0x1a0f08, // near-black on orange: ~8:1 contrast
  surface: 0x1c2733,
  surfacePress: 0x33475c,
  surfaceDim: 0x141b24,
  card: 0x141b24,
  text: 0xf8fafc,
  textDim: 0x9fb0c0,
};

export const ICON_IMG = {
  x: (DEVICE_WIDTH - px(48)) / 2,
  y: px(34),
  src: "icon_sm.png",
};

export const TITLE_TEXT = {
  x: px(90),
  y: px(86),
  w: DEVICE_WIDTH - 2 * px(90),
  h: px(34),
  color: COLOR.textDim,
  text_size: px(24),
  align_h: hmUI.align.CENTER_H,
  text: "ROGUEMESO",
};

export const STATUS_CARD = {
  x: px(78),
  y: px(128),
  w: DEVICE_WIDTH - 2 * px(78),
  h: px(108),
  radius: px(24),
  color: COLOR.card,
};

export const STATUS_TEXT = {
  x: px(94),
  y: px(134),
  w: DEVICE_WIDTH - 2 * px(94),
  h: px(96),
  color: COLOR.text,
  text_size: px(26),
  align_h: hmUI.align.CENTER_H,
  align_v: hmUI.align.CENTER_V,
  text_style: hmUI.text_style.WRAP,
};

// The one primary action on the screen: workout HR tracking.
export const TRACK_BUTTON = {
  x: (DEVICE_WIDTH - px(300)) / 2,
  y: px(248),
  w: px(300),
  h: px(68),
  text_size: px(30),
  radius: px(34),
  normal_color: COLOR.primary,
  press_color: COLOR.primaryPress,
  color: COLOR.onPrimary,
  text: "Track Workout",
};

export const SYNC_BUTTON = {
  x: px(90),
  y: px(328),
  w: px(146),
  h: px(56),
  text_size: px(24),
  radius: px(28),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.text,
  text: "Sync HR",
};

export const WELLNESS_BUTTON = {
  x: DEVICE_WIDTH - px(90) - px(146),
  y: px(328),
  w: px(146),
  h: px(56),
  text_size: px(24),
  radius: px(28),
  normal_color: COLOR.surface,
  press_color: COLOR.surfacePress,
  color: COLOR.text,
  text: "Wellness",
};

// Diagnostics row, visually subordinate, inside the circle's bottom chord.
export const RECORD_BUTTON = {
  x: px(117),
  y: px(396),
  w: px(118),
  h: px(46),
  text_size: px(20),
  radius: px(23),
  normal_color: COLOR.surfaceDim,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Record",
};

export const PING_BUTTON = {
  x: DEVICE_WIDTH - px(117) - px(118),
  y: px(396),
  w: px(118),
  h: px(46),
  text_size: px(20),
  radius: px(23),
  normal_color: COLOR.surfaceDim,
  press_color: COLOR.surfacePress,
  color: COLOR.textDim,
  text: "Ping",
};
