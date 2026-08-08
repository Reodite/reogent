// Topographic contour texture for the landing hero and closing CTA — felt more
// than seen (3–4% opacity), evoking "this is about a place" without being literal.

import { memo } from "react";

export const TopoTexture = memo(function TopoTexture({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 1400 900"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1"
    >
      {/* Western contour family */}
      <path d="M 180 240 C 120 180 200 90 320 110 C 440 130 500 230 460 330 C 420 430 260 300 180 240 Z" />
      <path d="M 140 280 C 60 190 170 40 340 60 C 510 80 580 250 520 380 C 460 510 220 370 140 280 Z" />
      <path d="M 100 320 C 0 200 140 -10 360 10 C 580 30 660 270 580 430 C 500 590 200 440 100 320 Z" />
      <path d="M 60 360 C -60 210 110 -60 380 -40 C 650 -20 740 290 640 480 C 540 670 180 510 60 360 Z" />
      <path d="M 20 400 C -120 220 80 -110 400 -90 C 720 -70 820 310 700 530 C 580 750 160 580 20 400 Z" />
      {/* Eastern contour family */}
      <path d="M 1060 560 C 1020 500 1090 430 1180 450 C 1270 470 1300 560 1250 620 C 1200 680 1100 620 1060 560 Z" />
      <path d="M 1020 600 C 960 510 1060 390 1200 410 C 1340 430 1390 570 1320 670 C 1250 770 1080 690 1020 600 Z" />
      <path d="M 980 640 C 900 520 1030 350 1220 370 C 1410 390 1480 580 1390 720 C 1300 860 1060 760 980 640 Z" />
      <path d="M 940 680 C 840 530 1000 310 1240 330 C 1480 350 1570 590 1460 770 C 1350 950 1040 830 940 680 Z" />
      <path d="M 900 720 C 780 540 970 270 1260 290 C 1550 310 1660 600 1530 820 C 1400 1040 1020 900 900 720 Z" />
      {/* Connecting ridge lines */}
      <path d="M 420 620 C 560 540 760 560 880 660" />
      <path d="M 400 680 C 560 580 780 600 920 720" />
      <path d="M 520 160 C 680 200 820 320 860 460" />
      <path d="M 600 120 C 780 170 930 310 960 470" />
    </svg>
  );
});
