import { AppProviders } from "@/src/components/providers";
import { SHELL_MODE_STORAGE_KEY } from "@/src/lib/shell-mode";
import { SIDEBAR_COLLAPSED_STORAGE_KEY } from "@/src/lib/sidebar";
import { THEME_STORAGE_KEY } from "@/src/lib/theme";
import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";

const aspekta = localFont({
  src: "../src/fonts/AspektaVF.woff2",
  weight: "100 900",
  display: "swap",
  variable: "--font-aspekta",
});

const commitMono = localFont({
  src: "../src/fonts/CommitMonoVF.woff2",
  weight: "400 700",
  display: "swap",
  variable: "--font-commit-mono",
});

export const metadata: Metadata = {
  title: "Reodite — AI for your campus",
  description:
    "Ask Reodite about courses, tuition and walking routes, plan your studies, and connect with other UBC students.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

// Applies theme and routed shell mode before paint. Utility routes retain the
// stored mode so their sidebar matches the workspace the user came from.
const BOOTSTRAP =
  `var t;try{t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)})}catch(e){}t=t==="light"||t==="dark"?t:(matchMedia("(prefers-color-scheme: dark)").matches?"dark":"light");document.documentElement.dataset.theme=t;try{localStorage.setItem(${JSON.stringify(THEME_STORAGE_KEY)},t)}catch(e){}` +
  `try{var p=location.pathname||"";var m=p.indexOf("/app/tools")===0?"tools":(p.indexOf("/app/pulse")===0?"unity":(p==="/app"||p.indexOf("/app/chat")===0?"ai":(localStorage.getItem(${JSON.stringify(SHELL_MODE_STORAGE_KEY)})||"ai")));document.documentElement.dataset.shellMode=(m==="tools"||m==="unity")?m:"ai"}catch(e){document.documentElement.dataset.shellMode="ai"}` +
  `try{document.documentElement.dataset.sidebarCollapsed=localStorage.getItem(${JSON.stringify(SIDEBAR_COLLAPSED_STORAGE_KEY)})==="1"?"true":"false"}catch(e){document.documentElement.dataset.sidebarCollapsed="false"}`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${aspekta.variable} ${commitMono.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-paint bootstrap built from build-time env only */}
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
