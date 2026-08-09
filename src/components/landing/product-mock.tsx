// Product mock for the landing page. Mirrors the actual app-shell structure:
// neu-panel chat panel + neu-panel map panel, same bubble radii, same composer.
// Accepts motion values from parent for scroll-driven animations:
// - inView: triggers staggered message entrance
// - chatZ/mapZ: drives Z-depth separation

"use client";

import { Icon } from "@/src/components/icons";
import { motion, type MotionValue } from "motion/react";
import Image from "next/image";

interface ProductMockProps {
  inView: boolean;
  chatZ?: MotionValue<number>;
  mapZ?: MotionValue<number>;
}

const msgVariant = {
  hidden: { opacity: 0, y: 20 },
  visible: { opacity: 1, y: 0 },
};

export function ProductMock({ inView, chatZ, mapZ }: ProductMockProps) {
  return (
    <div
      aria-hidden="true"
      className="app-shell-canvas mx-auto flex w-full max-w-[960px] gap-3 rounded-[1.75rem] p-3"
      style={{ perspective: "1200px" }}
    >
      {/* Chat panel */}
      <motion.div
        className="neu-panel flex min-w-0 flex-1 flex-col overflow-hidden rounded-2xl"
        style={chatZ ? { z: chatZ } : undefined}
      >
        {/* Header */}
        <div className="flex shrink-0 items-center justify-between bg-transparent px-4 py-3">
          <span className="text-on-surface text-sm font-medium tracking-[-0.01em]">Walking to the Nest</span>
        </div>

        {/* Message well */}
        <div className="chat-message-well flex min-h-[280px] flex-1 flex-col gap-6 overflow-hidden p-4 sm:min-h-[340px] sm:p-6">
          {/* User message */}
          <motion.div
            className="flex justify-end"
            initial={msgVariant.hidden}
            animate={inView ? msgVariant.visible : msgVariant.hidden}
            transition={{ duration: 0.5, delay: 0.1, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="bg-accent-subtle text-on-surface max-w-[85%] rounded-[16px_16px_5px_16px] px-4 py-3 text-sm leading-relaxed">
              How far is ICCS to the Nest?
            </div>
          </motion.div>

          {/* Assistant message */}
          <motion.div
            initial={msgVariant.hidden}
            animate={inView ? msgVariant.visible : msgVariant.hidden}
            transition={{ duration: 0.5, delay: 0.25, ease: [0.16, 1, 0.3, 1] }}
          >
            <div className="mb-2 flex items-center gap-2">
              <span className="bg-primary-container text-on-primary-container flex size-7 items-center justify-center rounded-lg text-[0.6875rem] font-medium">
                R
              </span>
              <span className="text-muted text-xs font-medium">Reogent</span>
            </div>
            <div className="bg-surface max-w-[88%] rounded-[16px_16px_16px_5px] px-4 py-3">
              <p className="text-on-surface text-sm leading-relaxed">
                ICCS to the AMS Nest is about <span className="font-mono">680 m</span>, roughly a{" "}
                <span className="font-medium">9 minute walk</span> heading north through campus.
              </p>
              {/* Walking distance card */}
              <div className="bg-surface-container-low mt-3 flex items-center gap-3 rounded-lg p-3">
                <span className="bg-secondary-container text-on-secondary-container flex size-9 shrink-0 items-center justify-center rounded-lg">
                  <Icon name="walk" size={18} />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="text-on-surface block text-base font-medium">9 min walk</span>
                  <span className="text-on-surface-variant block truncate text-xs">680 m · ICCS → Nest</span>
                </span>
                <span className="border-primary text-primary shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium">
                  Show on map
                </span>
              </div>
            </div>
          </motion.div>

          {/* Composer */}
          <motion.div
            className="chat-composer neu-inset bg-surface-container-low mt-auto flex items-center rounded-2xl p-1.5"
            initial={msgVariant.hidden}
            animate={inView ? msgVariant.visible : msgVariant.hidden}
            transition={{ duration: 0.5, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
          >
            <span className="text-muted min-w-0 flex-1 truncate px-3 py-2 text-sm">Ask about courses, campus…</span>
            <span className="neu-primary-button bg-primary text-on-primary flex size-9 shrink-0 items-center justify-center rounded-xl">
              <Icon name="arrowUp" size={16} />
            </span>
          </motion.div>
        </div>
      </motion.div>

      {/* Map panel */}
      <motion.div
        className="neu-panel relative hidden flex-1 overflow-hidden rounded-2xl sm:flex"
        style={mapZ ? { z: mapZ } : undefined}
        initial={{ opacity: 0 }}
        animate={inView ? { opacity: 1 } : { opacity: 0 }}
        transition={{ duration: 0.6, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      >
        {/* Map preview — theme-aware */}
        <Image
          src="/map-light.png"
          alt=""
          fill
          className="object-cover dark:hidden"
          sizes="(min-width: 640px) 50vw, 0px"
          draggable={false}
        />
        <Image
          src="/map-dark.png"
          alt=""
          fill
          className="hidden object-cover dark:block"
          sizes="(min-width: 640px) 50vw, 0px"
          draggable={false}
        />

        {/* Collapse button */}
        <span className="neu-panel text-on-surface-variant absolute top-3 left-3 flex size-9 items-center justify-center rounded-xl">
          <Icon name="right" size={15} />
        </span>

        {/* Route info card */}
        <div className="neu-panel absolute top-3 right-3 flex items-center gap-2 rounded-2xl px-3 py-2">
          <span className="bg-secondary-container text-on-secondary-container flex size-8 items-center justify-center rounded-lg">
            <Icon name="walk" size={16} />
          </span>
          <span>
            <span className="text-on-surface block text-base leading-tight font-medium">9 min</span>
            <span className="text-on-surface-variant block text-xs">680 m</span>
          </span>
        </div>
      </motion.div>
    </div>
  );
}
