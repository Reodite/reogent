import { AppProviders } from "@/src/components/providers";
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
  title: "Reogent — AI for your campus",
  description:
    "Courses, prerequisites, tuition, and walking routes — answered instantly from real UBC data, with routes drawn on a live campus map.",
};

export const viewport: Viewport = {
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f7f7f5" },
    { media: "(prefers-color-scheme: dark)", color: "#121214" },
  ],
};

// Runs before first paint: applies stored or system theme.
// Returning users skip the landing page flash.
const AUTH_KEY = "reogent.auth.user";
const BOOTSTRAP =
  `try{var t=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});document.documentElement.dataset.theme=(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}` +
  `try{if(location.pathname==="/"&&localStorage.getItem(${JSON.stringify(AUTH_KEY)}))document.documentElement.dataset.authPending=""}catch(e){}`;

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
