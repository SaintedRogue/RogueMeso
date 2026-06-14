#!/bin/sh
# Print "true" if the commit range $BEFORE..$AFTER contains any feat/fix commit
# subject (the same ^(feat|fix) signal that populates the "What's new" panel),
# else "false". SHAs arrive via env (BEFORE/AFTER) and are never interpolated
# into the script body, so a crafted commit message cannot inject shell.
set -eu

# All-zeros or empty BEFORE (first push / force-push / brand-new branch) has no
# usable range to diff — default to building.
case "${BEFORE:-}" in
  *[!0]*) ;;               # contains a non-zero char -> real ref, fall through
  *) echo true; exit 0 ;;  # empty or all-zeros -> build
esac

if git log --pretty=%s "$BEFORE..$AFTER" 2>/dev/null | grep -qE '^(feat|fix)'; then
  echo true
else
  echo false
fi
