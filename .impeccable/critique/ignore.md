# Detector Ignore List

These findings are intentional design decisions, not drift.

## Font sizes below caption (0.75rem)

- `0.6875rem` (11px) — Single-character avatar badges in size-7 (28px) containers. Caption (12px) is too large for the container geometry.
- `0.625rem` (10px) — Avatar badge in size-6 (24px) container in the product mockup.

## Border radius

- `2px)` — The `calc(1rem + 2px)` value on `.chat-composer[data-thinking]::before` is a mask inset calculation, not a surface radius.

## Colors

- `#000` — Used exclusively in `linear-gradient(#000 0 0)` for CSS mask composition. Not a visible surface color.
