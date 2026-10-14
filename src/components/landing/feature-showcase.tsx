"use client";

import { Icon } from "@/src/components/icons";
import { ProductMock, type ProductPreview } from "@/src/components/landing/product-mock";
import { Button } from "@/src/components/ui/button";
import { useReducedMotion } from "motion/react";
import { useEffect, useId, useRef, useState } from "react";

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

function scrollToSlide(viewport: HTMLElement, index: number, behavior: ScrollBehavior) {
  const slide = viewport.children[index] as HTMLElement | undefined;
  if (!slide) return;
  viewport.scrollTo({
    left: slide.offsetLeft - (viewport.clientWidth - slide.offsetWidth) / 2,
    behavior,
  });
}

function FeatureCarousel({ title, description, slides }: (typeof SHOWCASES)[number]) {
  const id = useId();
  const viewportRef = useRef<HTMLElement>(null);
  const currentIndex = useRef(0);
  const [activeIndex, setActiveIndex] = useState(0);
  const reducedMotion = useReducedMotion();

  useEffect(() => {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const observer = new ResizeObserver(() => scrollToSlide(viewport, currentIndex.current, "instant"));
    observer.observe(viewport);
    return () => observer.disconnect();
  }, []);

  function goTo(index: number) {
    const viewport = viewportRef.current;
    if (viewport) {
      scrollToSlide(viewport, Math.max(0, Math.min(index, slides.length - 1)), reducedMotion ? "instant" : "smooth");
    }
  }

  function syncPosition() {
    const viewport = viewportRef.current;
    if (!viewport) return;
    const center = viewport.scrollLeft + viewport.clientWidth / 2;
    let closest = 0;
    let distance = Infinity;
    for (const [index, child] of Array.from(viewport.children).entries()) {
      const slide = child as HTMLElement;
      const nextDistance = Math.abs(slide.offsetLeft + slide.offsetWidth / 2 - center);
      if (nextDistance < distance) {
        distance = nextDistance;
        closest = index;
      }
    }
    currentIndex.current = closest;
    setActiveIndex(closest);
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
      <div className="grid grid-cols-[2.75rem_minmax(0,1fr)_2.75rem] items-center gap-x-1 gap-y-3 sm:gap-x-4">
        <Button
          variant="secondary"
          size="fieldIcon"
          shadowOn="background"
          className="col-start-1 row-start-2 sm:row-start-1"
          aria-label={`Previous ${title} card`}
          aria-controls={`${id}-slides`}
          disabled={activeIndex === 0}
          onClick={() => goTo(activeIndex - 1)}
        >
          <Icon name="left" size={20} />
        </Button>
        <section
          ref={viewportRef}
          id={`${id}-slides`}
          aria-label={`Browse ${title}`}
          aria-describedby={`${id}-instructions`}
          // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users navigate the scrollable card strip.
          tabIndex={0}
          className="relative col-span-3 col-start-1 row-start-1 flex min-w-0 snap-x snap-mandatory [scrollbar-width:none] gap-4 overflow-x-auto overscroll-x-contain rounded-2xl py-3 outline-offset-[-2px] sm:col-span-1 sm:col-start-2 sm:gap-6 [&::-webkit-scrollbar]:hidden"
          style={{ paddingInline: "max(0.25rem, calc((100% - 36rem) / 2))" }}
          onScroll={syncPosition}
          onKeyDown={(event) => {
            const destinations: Record<string, number> = {
              ArrowLeft: activeIndex - 1,
              ArrowRight: activeIndex + 1,
              Home: 0,
              End: slides.length - 1,
            };
            if (!Object.hasOwn(destinations, event.key)) return;
            event.preventDefault();
            goTo(destinations[event.key]);
          }}
        >
          {slides.map((slide, index) => (
            <article
              key={slide.id}
              id={`${id}-${slide.id}`}
              aria-roledescription="slide"
              aria-label={`${index + 1} of ${slides.length}: ${slide.title}`}
              className="neu-panel neu-shadow-on-background flex w-full shrink-0 snap-center snap-always flex-col overflow-hidden rounded-2xl"
            >
              <div
                aria-hidden="true"
                className="bg-surface-container-low pointer-events-none h-80 overflow-hidden select-none"
              >
                <ProductMock feature={slide.id} />
              </div>
              <footer className="flex flex-1 flex-col gap-1 px-4 py-5 sm:px-6">
                <h3 className="text-on-surface text-base font-medium">{slide.title}</h3>
                <p className="text-on-surface-variant text-sm leading-relaxed">{slide.description}</p>
              </footer>
            </article>
          ))}
        </section>
        <Button
          variant="secondary"
          size="fieldIcon"
          shadowOn="background"
          className="col-start-3 row-start-2 sm:row-start-1"
          aria-label={`Next ${title} card`}
          aria-controls={`${id}-slides`}
          disabled={activeIndex === slides.length - 1}
          onClick={() => goTo(activeIndex + 1)}
        >
          <Icon name="right" size={20} />
        </Button>
        <fieldset
          className="col-start-2 row-start-2 flex min-w-0 flex-wrap justify-center"
          aria-label={`${title} progress`}
        >
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
      </div>
      <p id={`${id}-instructions`} className="sr-only">
        Use the left and right arrow keys to browse. Home shows the first card; End shows the last.
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
