"use client";

import { useAppAuth } from "@/src/components/auth/app-auth";
import { Icon } from "@/src/components/icons";
import { ProductMock } from "@/src/components/landing/product-mock";
import { TopoTexture } from "@/src/components/landing/topo-texture";
import { ThemeToggle } from "@/src/components/theme-toggle";
import { motion, useInView, useReducedMotion, useScroll, useTransform } from "motion/react";
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

// --- Entry point: handles auth state, renders content only when signed out ---

export function Landing() {
  const { status } = useAppAuth();
  const router = useRouter();

  useEffect(() => {
    if (status === "signedIn") router.replace("/chat");
  }, [status, router]);

  useEffect(() => {
    if (status === "signedOut") delete document.documentElement.dataset.authPending;
  }, [status]);

  if (status === "initializing" || status === "signedIn") {
    return (
      <div className="auth-splash bg-background fixed inset-0 z-50 flex items-center justify-center">
        <div className="neu-panel bg-surface flex items-center gap-3 rounded-2xl px-6 py-4">
          <span className="bg-primary-container text-on-primary-container shadow-inset flex size-9 items-center justify-center rounded-xl">
            <Icon name="school" size={18} />
          </span>
          <span className="text-primary animate-pulse text-xl font-medium tracking-[-0.02em]">Reodite</span>
        </div>
      </div>
    );
  }

  return <LandingContent />;
}

// --- Animated landing content (only mounts when signed out, refs are safe) ---

function LandingContent() {
  const prefersReducedMotion = useReducedMotion();
  const skipAnim = !!prefersReducedMotion;
  const [scrolled, setScrolled] = useState(false);

  // Scroll-driven refs
  const productSectionRef = useRef<HTMLElement>(null);
  const ctaSectionRef = useRef<HTMLElement>(null);
  const featuresRef = useRef<HTMLDivElement>(null);
  const productMockRef = useRef<HTMLDivElement>(null);

  const featuresInView = useInView(featuresRef, { once: true, amount: 0.3 });
  const mockInView = useInView(productMockRef, { once: true, amount: 0.15 });
  const ctaInView = useInView(ctaSectionRef, { once: true, amount: 0.4 });

  // Scroll progress for product mock panel depth
  const { scrollYProgress: productProgress } = useScroll({
    target: productSectionRef,
    offset: ["start end", "end start"],
  });

  // Z-depth separation on panels
  const chatZ = useTransform(productProgress, [0.1, 0.5], [0, 20]);
  const mapZ = useTransform(productProgress, [0.1, 0.5], [0, -10]);

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
    <div className="landing-root bg-background text-on-surface overflow-hidden">
      <a
        href="#main"
        className="bg-primary text-on-primary fixed top-2 left-2 z-[60] rounded-lg px-4 py-2 text-sm font-medium opacity-0 focus:opacity-100"
      >
        Skip to content
      </a>

      {/* Header */}
      <header className="pointer-events-none fixed inset-x-0 top-0 z-40">
        <div
          className="pointer-events-none absolute inset-x-0 top-0 h-48"
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
            className={`pointer-events-auto mx-auto flex h-14 max-w-5xl items-center justify-between rounded-2xl px-4 transition-[background-color,box-shadow] duration-200 ${
              scrolled ? "neu-panel" : ""
            }`}
          >
            <Link href="/" className="flex items-center gap-2" aria-label="Reodite home">
              <span className="bg-primary-container text-on-primary-container flex size-8 items-center justify-center rounded-xl">
                <Icon name="school" size={16} />
              </span>
              <span className="text-on-surface text-sm font-medium tracking-[-0.02em]">Reodite</span>
            </Link>
            <div className="flex items-center gap-2">
              <ThemeToggle />
              <Link
                href="/login"
                className="neu-button bg-surface text-on-surface-variant hover:text-on-surface flex h-9 items-center rounded-xl px-4 text-sm font-medium"
              >
                Sign in
              </Link>
            </div>
          </motion.nav>
        </div>
      </header>

      <main id="main">
        {/* Hero */}
        <section className="relative flex min-h-[100dvh] flex-col items-center justify-center px-4 sm:px-6">
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
                  Ask UBC anything.
                </motion.span>
                <br />
                <motion.span
                  className="text-primary inline-block"
                  initial={skipAnim ? false : heroLineVariant.hidden}
                  animate={heroLineVariant.visible}
                  transition={{ duration: 0.6, delay: 0.13, ease: [0.16, 1, 0.3, 1] }}
                >
                  Get a real answer.
                </motion.span>
              </h1>
              <motion.p
                className="text-on-surface-variant mx-auto mt-6 max-w-md text-base leading-relaxed sm:text-lg"
                initial={skipAnim ? false : heroSublineVariant.hidden}
                animate={heroSublineVariant.visible}
                transition={{ duration: 0.5, delay: 0.22, ease: [0.16, 1, 0.3, 1] }}
              >
                Courses, tuition, walking routes, deadlines. Reodite searches indexed campus data and responds with
                facts you can trust.
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
                  <Link
                    href="/signup"
                    className="neu-primary-button bg-primary text-on-primary flex h-12 items-center rounded-xl px-8 text-base font-medium"
                  >
                    Get started
                  </Link>
                </motion.div>
                <motion.div
                  initial={skipAnim ? false : heroCTAVariant.hidden}
                  animate={heroCTAVariant.visible}
                  transition={{ type: "spring", stiffness: 80, damping: 18, delay: 0.36 }}
                >
                  <Link
                    href="/login"
                    className="neu-button bg-surface text-on-surface flex h-12 items-center rounded-xl px-8 text-base font-medium"
                  >
                    Sign in
                  </Link>
                </motion.div>
              </motion.div>
            </div>
          </div>
        </section>

        {/* Product proof — scroll-driven route + inView messages */}
        <section className="px-4 py-16 sm:px-6 sm:py-24" ref={productSectionRef}>
          <div className="mx-auto max-w-5xl">
            <div className="mx-auto mb-10 max-w-lg text-center sm:mb-12">
              <h2 className="text-on-surface text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
                You ask. It finds. The map shows.
              </h2>
              <p className="text-on-surface-variant mt-3 text-sm leading-relaxed sm:text-base">
                The agent calls real UBC data tools. If the answer involves a place, you see the route.
              </p>
            </div>
            <div ref={productMockRef}>
              <ProductMock
                inView={mockInView || skipAnim}
                chatZ={skipAnim ? undefined : chatZ}
                mapZ={skipAnim ? undefined : mapZ}
              />
            </div>
          </div>
        </section>

        {/* Features — staggered entrance */}
        <section className="px-4 py-24 sm:px-6 sm:py-32">
          <div ref={featuresRef} className="mx-auto max-w-3xl">
            <motion.h2
              className="text-on-surface text-center text-2xl font-medium tracking-[-0.02em] sm:text-3xl"
              initial={skipAnim ? false : { opacity: 0, y: 16 }}
              animate={featuresInView || skipAnim ? { opacity: 1, y: 0 } : { opacity: 0, y: 16 }}
              transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            >
              Backed by real data. Drawn on a real map.
            </motion.h2>

            <div className="mt-16 grid gap-12 sm:grid-cols-3 sm:gap-8">
              {(
                [
                  {
                    icon: "search" as const,
                    title: "Grounded answers",
                    desc: "Traces back to official UBC sources. Course catalogs, fee schedules, academic calendars.",
                  },
                  {
                    icon: "route" as const,
                    title: "Campus-aware",
                    desc: "Ask how to get somewhere and see the walking route drawn on the map. The real path, computed.",
                  },
                  {
                    icon: "chat1" as const,
                    title: "One conversation",
                    desc: "No portals, no five-tab searches. Type your question like you would text a friend.",
                  },
                ] as const
              ).map((feature, i) => (
                <motion.div
                  key={feature.title}
                  className="text-center sm:text-left"
                  initial={skipAnim ? false : featureItemVariant.hidden}
                  animate={featuresInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
                  transition={{
                    duration: 0.5,
                    delay: 0.1 + i * 0.1,
                    ease: [0.16, 1, 0.3, 1],
                  }}
                >
                  <Icon name={feature.icon} size={24} className="text-primary mx-auto sm:mx-0" />
                  <p className="text-on-surface mt-3 text-sm font-medium">{feature.title}</p>
                  <p className="text-on-surface-variant mt-1 text-sm leading-relaxed">{feature.desc}</p>
                </motion.div>
              ))}
            </div>
          </div>
        </section>

        {/* Final CTA — parallax + staggered entrance */}
        <motion.section
          ref={ctaSectionRef}
          className="px-4 pt-24 pb-12 text-center sm:px-6 sm:pt-32 sm:pb-16"
          style={skipAnim ? undefined : { y: ctaParallaxY }}
        >
          <motion.h2
            className="text-on-surface text-2xl font-medium tracking-[-0.02em] sm:text-3xl"
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            Stop guessing. Start asking.
          </motion.h2>
          <motion.p
            className="text-on-surface-variant mx-auto mt-4 max-w-xs text-base leading-relaxed"
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.2, ease: [0.16, 1, 0.3, 1] }}
          >
            Courses, buildings, deadlines. One conversation away.
          </motion.p>
          <motion.div
            className="mt-8 flex flex-wrap items-center justify-center gap-3"
            initial={skipAnim ? false : featureItemVariant.hidden}
            animate={ctaInView || skipAnim ? featureItemVariant.visible : featureItemVariant.hidden}
            transition={{ duration: 0.5, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
          >
            <Link
              href="/signup"
              className="neu-primary-button bg-primary text-on-primary flex h-12 items-center rounded-xl px-8 text-base font-medium"
            >
              Get started free
            </Link>
            <Link
              href="/login"
              className="neu-button bg-surface text-on-surface flex h-12 items-center rounded-xl px-8 text-base font-medium"
            >
              Sign in
            </Link>
          </motion.div>
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
