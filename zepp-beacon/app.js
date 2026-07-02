import { BaseApp } from "@zeppos/zml/base-app";

// Global app shell — zml's BaseApp wires the device <-> side-service message channel
// that page/index.js uses via this.request().
App(
  BaseApp({
    globalData: {},
    onCreate() {},
    onDestroy() {},
  }),
);
