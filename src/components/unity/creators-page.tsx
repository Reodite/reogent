"use client";

import { Icon } from "@/src/components/icons";
import { ButtonLink } from "@/src/components/ui/button";

function CreatorAvatar({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div className="bg-surface-container-high text-on-surface-variant flex size-16 items-center justify-center rounded-full text-xl font-medium">
        {name[0]}
      </div>
      <span className="text-on-surface text-sm font-medium">{name}</span>
    </div>
  );
}

export function CreatorsPage() {
  return (
    <section aria-label="Creators" className="flex min-h-0 w-full flex-col p-4 sm:p-6">
      <h1 className="text-on-surface text-base font-medium tracking-[-0.01em]">Creators</h1>
      <div className="mt-6 flex items-center justify-center gap-8">
        <CreatorAvatar name="Max" />
        <CreatorAvatar name="Chakorn" />
      </div>
      <ButtonLink
        href="https://buymeacoffee.com"
        target="_blank"
        rel="noopener noreferrer"
        className="hover:text-primary mt-6 self-center"
      >
        <Icon name="teacup" size={16} />
        Buy us a coffee
      </ButtonLink>
    </section>
  );
}
