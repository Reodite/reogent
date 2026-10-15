"use client";

import { Icon } from "@/src/components/icons";
import { ProductMock, type ProductPreview } from "@/src/components/landing/product-mock";
import { Button } from "@/src/components/ui/button";
import {
  animate,
  motion,
  useMotionValue,
  useReducedMotion,
  useTransform,
  wrap,
  type AnimationPlaybackControls,
  type MotionValue,
} from "motion/react";
import { useCallback, useEffect, useId, useRef, useState } from "react";

type FeatureSlide = {
  id: ProductPreview;
  title: string;
  description: string;
};

const SHOWCASES: { title: string; description: string; slides: FeatureSlide[] }[] = [
  {
    title: "Agent capabilities",
    description: "Ask in your own words, with answers grounded in UBC data.",
    slides: [
      { id: "grounded", title: "Grounded answers", description: "Get answers with UBC sources you can check." },
      { id: "research", title: "Multi-step research", description: "Bring several campus sources into one answer." },
      {
        id: "spatial",
        title: "Answers on the map",
        description: "Turn a campus question into a route you can follow.",
      },
    ],
  },
  {
    title: "Tools",
    description: "Plan your studies and find your way around campus.",
    slides: [
      { id: "map", title: "Campus map", description: "Explore buildings and find your walking route." },
      { id: "course-lookup", title: "Course lookup", description: "Compare courses, sections and past grades." },
      { id: "prereq-tree", title: "Prereq tree", description: "See which courses lead to the one you want." },
      { id: "degree-planner", title: "Degree planner", description: "Build your degree plan, year by year." },
      { id: "schedule", title: "Course schedule", description: "Build a timetable and catch course conflicts." },
      { id: "calendar", title: "Calendar", description: "Keep track of campus events and key dates." },
    ],
  },
  {
    title: "Unity",
    description: "Keep up with Reodite and connect with other students.",
    slides: [
      { id: "announcements", title: "Announcements", description: "Catch up on updates from the Reodite team." },
      { id: "pulse", title: "Pulse", description: "Share your take and see how campus votes." },
      { id: "sharing", title: "Schedule sharing", description: "Share schedules and find time together." },
    ],
  },
];

function FeatureCard({
  id,
  slide,
  index,
  count,
  position,
}: {
  id: string;
  slide: FeatureSlide;
  index: number;
  count: number;
  position: MotionValue<number>;
}) {
  const offset = useTransform(position, (value) => wrap(-count / 2, count / 2, index - value));
  const transform = useTransform(offset, (value) => {
    const distance = Math.min(Math.abs(value), 2);
    return `translateX(${value * 64}%) translateZ(${-distance * 200}px) rotateY(${-value * 12}deg) scale(${1 - distance * 0.12})`;
  });
  const zIndex = useTransform(offset, (value) => count - Math.round(Math.abs(value)));
  // Keep the foreground opaque and hide distant cards before they wrap, including three-card carousels.
  const opacity = useTransform(offset, [-1.5, -1, -0.5, 0.5, 1, 1.5], [0, 0.45, 1, 1, 0.45, 0]);

  return (
    <motion.article
      id={`${id}-${slide.id}`}
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${count}: ${slide.title}`}
      className="neu-panel neu-shadow-on-background pointer-events-none col-start-1 row-start-1 flex w-[calc(100%-2rem)] max-w-xl min-w-0 flex-col justify-self-center overflow-hidden rounded-2xl"
      style={{ transform, opacity, zIndex }}
    >
      <div aria-hidden="true" className="bg-surface-container-low h-80 overflow-hidden">
        <ProductMock feature={slide.id} />
      </div>
      <footer className="flex flex-1 flex-col gap-1 px-4 py-5 sm:px-6">
        <h3 className="text-on-surface text-base font-medium">{slide.title}</h3>
        <p className="text-on-surface-variant text-sm leading-relaxed">{slide.description}</p>
      </footer>
    </motion.article>
  );
}

function FeatureCarousel({ title, description, slides }: (typeof SHOWCASES)[number]) {
  const id = useId();
  const viewportRef = useRef<HTMLElement>(null);
  const animation = useRef<AnimationPlaybackControls | null>(null);
  const panStart = useRef({ position: 0, width: 1 });
  // Keep travel continuous across either end; only the selected index wraps.
  const [cursor, setCursor] = useState(0);
  const activeIndex = wrap(0, slides.length, cursor);
  const position = useMotionValue(0);
  const reducedMotion = useReducedMotion();
  const settle = useCallback(
    (target: number) => {
      animation.current?.stop();
      animation.current = animate(position, target, {
        duration: reducedMotion ? 0 : 0.45,
        ease: [0.16, 1, 0.3, 1],
      });
    },
    [position, reducedMotion],
  );

  useEffect(() => {
    settle(cursor);
    return () => animation.current?.stop();
  }, [cursor, settle]);

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    let distance = 0;
    let lastEvent = 0;
    let committed = false;
    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || Math.abs(event.deltaX) <= Math.abs(event.deltaY)) return;
      event.preventDefault();
      const now = performance.now();
      if (now - lastEvent > 180) {
        distance = 0;
        committed = false;
      }
      lastEvent = now;
      if (committed) return;
      const unit = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? viewport.clientWidth : 1;
      distance += event.deltaX * unit;
      if (Math.abs(distance) < 48) return;
      committed = true;
      const direction = Math.sign(distance);
      setCursor((current) => current + direction);
    };
    viewport.addEventListener("wheel", onWheel, { passive: false });
    return () => viewport.removeEventListener("wheel", onWheel);
  }, []);

  function goTo(index: number) {
    setCursor(
      (current) => current + wrap(-slides.length / 2, slides.length / 2, index - wrap(0, slides.length, current)),
    );
  }

  return (
    <section aria-roledescription="carousel" aria-labelledby={`${id}-title`}>
      <div className="mb-6 text-center sm:mb-8">
        <h2 id={`${id}-title`} className="text-on-surface text-2xl font-medium tracking-[-0.02em] sm:text-3xl">
          {title}
        </h2>
        <p className="text-on-surface-variant mx-auto mt-3 max-w-lg text-sm leading-relaxed sm:text-base">
          {description}
        </p>
      </div>
      <motion.section
        ref={viewportRef}
        id={`${id}-slides`}
        aria-label={`Browse ${title}`}
        aria-describedby={`${id}-instructions`}
        tabIndex={0}
        className="relative grid min-w-0 cursor-grab overflow-clip rounded-2xl py-3 outline-offset-[-2px] select-none active:cursor-grabbing"
        style={{ perspective: "1200px", touchAction: "pan-y pinch-zoom" }}
        onPanStart={() => {
          animation.current?.stop();
          panStart.current = {
            position: position.get(),
            width: Math.max(1, (viewportRef.current?.querySelector("article")?.offsetWidth ?? 1) * 0.64),
          };
        }}
        onPan={(_, info) => {
          if (reducedMotion || Math.abs(info.offset.x) <= Math.abs(info.offset.y)) return;
          position.set(panStart.current.position - Math.max(-1, Math.min(1, info.offset.x / panStart.current.width)));
        }}
        onPanEnd={(event, info) => {
          const delta =
            Math.abs(info.offset.x) > 48 ? info.offset.x : Math.abs(info.velocity.x) > 500 ? info.velocity.x : 0;
          if (event.type !== "pointercancel" && Math.abs(info.offset.x) > Math.abs(info.offset.y) && delta) {
            setCursor((current) => current - Math.sign(delta));
          } else {
            settle(cursor);
          }
        }}
        onKeyDown={(event) => {
          if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
          event.preventDefault();
          if (event.key === "Home" || event.key === "End") {
            goTo(event.key === "Home" ? 0 : slides.length - 1);
          } else {
            setCursor((current) => current + (event.key === "ArrowRight" ? 1 : -1));
          }
        }}
      >
        {slides.map((slide, index) => (
          <FeatureCard key={slide.id} id={id} slide={slide} index={index} count={slides.length} position={position} />
        ))}
      </motion.section>
      <div className="mt-3 flex items-center justify-center gap-1 sm:gap-3">
        <Button
          variant="secondary"
          size="fieldIcon"
          shadowOn="background"
          aria-label={`Previous ${title} card`}
          aria-controls={`${id}-slides`}
          onClick={() => setCursor((current) => current - 1)}
        >
          <Icon name="left" size={20} />
        </Button>
        <fieldset className="flex min-w-0 flex-wrap justify-center" aria-label={`${title} progress`}>
          {slides.map((slide, index) => (
            <button
              key={slide.id}
              type="button"
              aria-label={`Show ${slide.title} (${index + 1} of ${slides.length})`}
              aria-current={activeIndex === index ? "true" : undefined}
              aria-controls={`${id}-${slide.id}`}
              onClick={() => goTo(index)}
              className="group flex size-8 items-center justify-center rounded-lg"
            >
              <span
                className={`h-1.5 rounded-full transition-[width,background-color] duration-200 ${
                  activeIndex === index ? "bg-primary w-5" : "bg-outline group-hover:bg-muted w-1.5"
                }`}
              />
            </button>
          ))}
        </fieldset>
        <Button
          variant="secondary"
          size="fieldIcon"
          shadowOn="background"
          aria-label={`Next ${title} card`}
          aria-controls={`${id}-slides`}
          onClick={() => setCursor((current) => current + 1)}
        >
          <Icon name="right" size={20} />
        </Button>
      </div>
      <p id={`${id}-instructions`} className="sr-only">
        Use the left and right arrow keys to browse. Navigation loops. Home shows the first card; End shows the last.
      </p>
      <p role="status" aria-atomic="true" className="sr-only">
        {activeIndex + 1} of {slides.length}: {slides[activeIndex].title}
      </p>
    </section>
  );
}

/** Shows agent examples, the Tools catalog, and Unity pages without loading live workspaces. */
export function FeatureShowcase() {
  return (
    <div className="px-4 py-16 sm:px-6 sm:py-24">
      <div className="mx-auto flex max-w-5xl flex-col gap-20 sm:gap-24">
        {SHOWCASES.map((showcase) => (
          <FeatureCarousel key={showcase.title} {...showcase} />
        ))}
      </div>
    </div>
  );
}
