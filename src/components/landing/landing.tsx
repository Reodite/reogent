"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { FeatureShowcase } from "@/src/components/landing/feature-showcase";
import { TopoTexture } from "@/src/components/landing/topo-texture";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { ButtonLink } from "@/src/components/ui/button";
import { InlineAction } from "@/src/components/ui/inline-action";
import { motion, useInView, useReducedMotion, useScroll, useTransform, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

// --- Shared animation variants ---

const heroLineVariant = {
  hidden: { opacity: 0, y: 8, filter: "blur(12px)" },
  visible: { opacity: 1, y: 0, filter: "blur(0px)" },
};

const heroSublineVariant = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0 },
};

const heroCTAVariant = {
  hidden: { opacity: 0, y: 16 },
  visible: { opacity: 1, y: 0 },
};

const featureItemVariant = {
  hidden: { opacity: 0, y: 24 },
  visible: { opacity: 1, y: 0 },
};

function GuestLink({ className }: { className?: string }) {
  const { status, continueAsGuest } = useAppAuth();
  const router = useRouter();
  return (
    <InlineAction
      className={className}
      disabled={status === "initializing"}
      onClick={() => {
        continueAsGuest();
        router.push("/app");
      }}
    >
      Continue as guest
    </InlineAction>
  );
}

function SectionHeading({ className, ...props }: HTMLMotionProps<"h2">) {
  return (
    <motion.h2
      className={`text-on-surface text-2xl font-medium tracking-[-0.02em] sm:text-3xl ${className ?? ""}`}
      {...props}
    />
  );
}

export function Landing() {
  const { status } = useAppAuth();
  const signedIn = status === "signedIn";
  const prefersReducedMotion = useReducedMotion();
  const skipAnim = !!prefersReducedMotion;
  const [scrolled, setScrolled] = useState(false);

  const ctaSectionRef = useRef<HTMLElement>(null);
  const ctaInView = useInView(ctaSectionRef, { once: true, amount: 0.4 });

  // Parallax for final CTA
  const { scrollYProgress: ctaProgress } = useScroll({
    target: ctaSectionRef,
    offset: ["start end", "end start"],
  });
  const ctaParallaxY = useTransform(ctaProgress, [0, 1], [40, -15]);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 16);
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <div className="landing-root bg-background text-on-surface overflow-x-clip">
      <a
        href="#main"
        className="bg-primary text-on-primary pointer-events-none fixed top-2 left-2 z-[60] rounded-lg px-4 py-2 text-sm font-medium opacity-0 focus:pointer-events-auto focus:opacity-100"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="pointer-events-none sticky top-0 z-40">
        <div
          className={`pointer-events-none absolute inset-x-0 top-0 h-48 ${scrolled ? "opacity-100" : "opacity-0"}`}
          style={{
            background:
              "linear-gradient(to bottom in oklch, var(--background) 0%, var(--background) 40%, color-mix(in oklch, var(--background) 70%, transparent) 65%, color-mix(in oklch, var(--background) 30%, transparent) 85%, transparent 100%)",
          }}
        />
        <div className="relative px-3 pt-3 sm:px-6">
          <motion.nav
            initial={skipAnim ? false : { opacity: 0, y: -20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 120, damping: 20 }}
            className={`pointer-events-auto mx-auto flex min-h-14 max-w-5xl flex-wrap items-center justify-between gap-2 rounded-2xl px-4 py-0.5 transition-[background-color,box-shadow] duration-200 ${
              scrolled ? "neu-panel" : ""
            }`}
          >
            <Link
              href="/"
              className="flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap"
              aria-label="Reodite home"
            >
              <span className="bg-primary-container text-on-primary-container flex size-8 shrink-0 items-center justify-center rounded-xl">
                <Icon name="school" size={16} />
              </span>
              <span className="text-on-surface text-sm font-medium tracking-[-0.02em]">Reodite</span>
            </Link>
            <div className="ml-auto flex max-w-full flex-wrap items-center gap-2">
              <ThemeToggle />
              <ButtonLink href={signedIn ? "/app" : "/login"} shadowOn={scrolled ? "surface" : "background"}>
                {signedIn ? "Open app" : "Sign in"}
              </ButtonLink>
            </div>
          </motion.nav>
        </div>
      </header>

      <main id="main" className="scroll-mt-48">
        {/* Hero */}
        <section className="relative flex min-h-[calc(100dvh-4.25rem)] flex-col items-center justify-center px-4 py-8 sm:px-6">
          {/* Topo texture with drift + fade-in + gradient mask */}
          <motion.div
            initial={skipAnim ? false : { opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 1.2, delay: 0.8, ease: "easeOut" }}
            className="pointer-events-none absolute inset-0"
            style={{
              maskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)",
              WebkitMaskImage: "radial-gradient(ellipse 80% 70% at 50% 40%, black 30%, transparent 100%)",
            }}
          >
            <TopoTexture className="text-on-surface animate-topo-drift h-full w-full opacity-[0.03]" />
          </motion.div>

          <div className="relative z-10 mx-auto max-w-5xl">
            <div className="mx-auto max-w-2xl text-center">
              <h1 className="text-4xl leading-[1.05] font-medium tracking-[-0.035em] sm:text-5xl lg:text-6xl">
                <motion.span
                  className="inline-block"
                  initial={skipAnim ? false : heroLineVariant.hidden}
                  animate={heroLineVariant.visible}
                  transition={{ duration: 0.6, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
                >
                  Make your way through UBC
                </motion.span>
                <br />
                <motion.span
                  className="text-primary inline-block"
                  initial={skipAnim ? false : heroLineVariant.hidden}
                  animate={heroLineVariant.visible}
                  transition={{ duration: 0.6, delay: 0.13, ease: [0.16, 1, 0.3, 1] }}
                >
                  with Reodite and your classmates.
                </motion.span>
              </h1>
              <motion.p
                className="text-on-surface-variant mx-auto mt-6 max-w-md text-base leading-relaxed sm:text-lg"
                initial={skipAnim ? false : heroSublineVariant.hidden}
                animate={heroSublineVariant.visible}
                transition={{ duration: 0.5, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                Reodite answers your questions and draws them on the campus map. When you want to dig in yourself, the
                course and degree planners sit one tap away. Compare timetables with friends and see what campus thinks.
              </motion.p>
              <motion.div
                className="mt-8 flex flex-wrap items-center justify-center gap-3 sm:mt-10"
                initial={skipAnim ? false : { opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.32 }}
              >
                <motion.div
                  initial={skipAnim ? false : heroCTAVariant.hidden}
                  animate={heroCTAVariant.visible}
                  transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.32 }}
                >
                  <ButtonLink href={signedIn ? "/app" : "/signup"} variant="primary" size="large" shadowOn="background">
                    {signedIn ? "Open app" : "Get started"}
                  </ButtonLink>
                </motion.div>
                {!signedIn && (
                  <motion.div
                    initial={skipAnim ? false : heroCTAVariant.hidden}
                    animate={heroCTAVariant.visible}
                    transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.36 }}
                  >
                    <ButtonLink href="/login" size="large" shadowOn="background">
                      Sign in
                    </ButtonLink>
                  </motion.div>
                )}
              </motion.div>
              {!signedIn && (
                <motion.div
                  initial={skipAnim ? false : { opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                  className="mt-3"
                >
                  <GuestLink className="text-muted hover:text-on-surface text-sm underline underline-offset-4 transition-colors" />
                </motion.div>
              )}
            </div>
          </div>
        </section>

        <FeatureShowcase />

        {/* Final CTA — parallax + staggered entrance */}
        <motion.section
          ref={ctaSectionRef}
          className="px-4 pt-24 pb-12 text-center sm:px-6 sm:pt-32 sm:pb-16"
          style={skipAnim ? undefined : { y: ctaParallaxY }}
        >
          <SectionHeading
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            What do you want to know?
          </SectionHeading>
          <motion.p
            className="text-on-surface-variant mx-auto mt-4 max-w-xs text-base leading-relaxed"
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            Start with a question. Reodite will point you to the right tool.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <ButtonLink href={signedIn ? "/app" : "/signup"} variant="primary" size="large" shadowOn="background">
              {signedIn ? "Open app" : "Get started free"}
            </ButtonLink>
            {!signedIn && (
              <ButtonLink href="/login" size="large" shadowOn="background">
                Sign in
              </ButtonLink>
            )}
          </motion.div>
          {!signedIn && (
            <motion.div
              initial={skipAnim ? false : featureItemVariant.hidden}
              animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
              transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
              className="mt-3"
            >
              <GuestLink className="text-muted hover:text-on-surface text-sm underline underline-offset-4 transition-colors" />
            </motion.div>
          )}
        </motion.section>
      </main>

      <footer className="mt-32 px-4 pb-4 text-center">
        <p className="text-muted text-sm">
          Built for UBC students. Not affiliated with the University of British Columbia.
        </p>
      </footer>
    </div>
  );
}
