-- Wearables: live Bluetooth HR becomes an opt-in profile setting (default OFF). The
-- watch-sync ("via watch") display is unaffected — this gates only the Web Bluetooth
-- connect UI, which most sessions don't use now that the watch syncs on demand.

-- AlterTable
ALTER TABLE "User" ADD COLUMN "bleHrEnabled" BOOLEAN NOT NULL DEFAULT false;
