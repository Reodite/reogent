import { AppProviders } from "@/src/components/providers";
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
  `try{var t=localStorage.getItem("campus.theme");document.documentElement.dataset.theme=(t==="dark"||(t!=="light"&&matchMedia("(prefers-color-scheme: dark)").matches))?"dark":"light"}catch(e){document.documentElement.dataset.theme="light"}` +
  `try{if(location.pathname==="/"&&localStorage.getItem(${JSON.stringify(AUTH_KEY)}))document.documentElement.dataset.authPending=""}catch(e){}`;

const DIRECTION_CONTRACT = `impeccable direction contract
THESIS: one conversational surface that proves its answers — the map lights up with the exact route the assistant just computed; refuses the generic chatbot-in-a-box with decorative sidebar.
OWN-WORLD: precision neumorphism on warm linen (#F7F7F5) with muted indigo primary (#4A4E7A); tight crisp shadows, inputs recess; Aspekta + Commit Mono for data.
STORY: a student asks about courses, tuition, or a walk; sees which tool grounded the answer; watches the route draw on the real campus.
FIRST VIEWPORT: landing — "Know your campus." over a radial accent halo and 3–4% topographic contours; app — sidebar (recessed), chat card, map card side-by-side.
FORM: established world per DESIGN.md + UX_SPEC.md; precisely specified brief, no concept roll.
FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, and DESIGN.md`;

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${aspekta.variable} ${commitMono.variable}`} suppressHydrationWarning>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static pre-paint bootstrap built from build-time env only */}
        <script dangerouslySetInnerHTML={{ __html: BOOTSTRAP }} />
      </head>
      <body>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: static build-time direction contract */}
        <div hidden dangerouslySetInnerHTML={{ __html: `<!-- ${DIRECTION_CONTRACT} -->` }} />
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
}
