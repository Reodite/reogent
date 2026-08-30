// Icons sourced from @iconify-json/mingcute at build time.
// No runtime fetches — paths are bundled statically.

import icons from "@iconify-json/mingcute/icons.json";

// Map of app icon names to mingcute icon IDs
const ICON_MAP = {
  arrowUp: "arrow-up-line",
  stop: "stop-fill",
  add: "add-line",
  chat1: "chat-1-line",
  search: "search-line",
  book2: "book-2-line",
  currencyDollar: "currency-dollar-line",
  walk: "walk-line",
  location: "location-line",
  map: "map-line",
  layer: "layer-line",
  aiming: "aiming-line",
  minimize: "minimize-line",
  alert: "alert-line",
  school: "school-line",
  menu: "menu-line",
  close: "close-line",
  left: "left-line",
  right: "right-line",
  down: "down-line",
  refresh2: "refresh-2-line",
  fullscreen: "fullscreen-2-line",
  route: "route-line",
  exit: "exit-line",
  settings: "settings-3-line",
  wifiOff: "wifi-off-line",
  moon: "moon-line",
  sun: "sun-line",
  building1: "building-1-line",
  bling: "bling-line",
  check: "check-line",
  computer: "computer-line",
  calendar: "calendar-2-line",
  tree: "tree-line",
  pencil: "pencil-line",
  externalLink: "external-link-line",
  group: "group-line",
  teacup: "teacup-line",
  lock: "lock-line",
  zoomIn: "zoom-in-line",
  zoomOut: "zoom-out-line",
  mortarboard: "mortarboard-line",
  undo: "back-line",
  redo: "forward-line",
  trash: "delete-2-line",
  eyeOff: "eye-close-line",
  info: "information-line",
  sparkles: "sparkles-line",
  square: "square-line",
  checkbox: "checkbox-line",
  circle: "round-line",
  file: "file-line",
} as const;

export type IconName = keyof typeof ICON_MAP;

function getBody(name: IconName): string {
  const id = ICON_MAP[name];
  return (icons.icons as Record<string, { body: string }>)[id]?.body ?? "";
}

export function Icon({
  name,
  size = 20,
  className,
  label,
}: {
  name: IconName;
  size?: number;
  className?: string;
  label?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      className={className}
      aria-hidden={label ? undefined : true}
      aria-label={label}
      role={label ? "img" : undefined}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: static icon path from @iconify-json/mingcute
      dangerouslySetInnerHTML={{ __html: getBody(name) }}
    />
  );
}
