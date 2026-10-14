"use client";

import { Icon } from "@/src/components/icons";
import { ButtonLink } from "@/src/components/ui/button";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";

function CreatorCard({ name, href }: { name: string; href: string }) {
  return (
    <article
      aria-label={name}
      className="neu-raised neu-shadow-on-surface-container-low bg-surface min-w-0 overflow-hidden rounded-2xl"
    >
      <div aria-hidden="true" className="bg-surface-container flex aspect-square items-center justify-center">
        <div className="bg-surface-container-high text-on-surface-variant flex size-16 items-center justify-center rounded-full text-xl font-medium">
          {name[0]}
        </div>
      </div>
      <footer className="p-2">
        <a
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          className="focus-visible:ring-primary/40 text-primary decoration-primary/40 hover:bg-surface-container-high flex min-h-11 items-center justify-center rounded-lg px-3 text-sm font-medium underline underline-offset-4 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 sm:min-h-9"
        >
          {name}
        </a>
      </footer>
    </article>
  );
}

export default function AboutPage() {
  return (
    <WorkspacePage composition="single" title="About" description="The creators">
      <WorkspaceCanvas padding="md">
        <div className="flex min-h-full flex-col items-center justify-center">
          <div className="grid w-full max-w-md grid-cols-2 gap-4">
            <CreatorCard name="Max" href="https://libo.dev/ai" />
            <CreatorCard name="Chakorn" href="https://chakornk.dev" />
          </div>
          <ButtonLink
            href="https://buymeacoffee.com"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-primary mt-6"
          >
            <Icon name="teacup" size={16} />
            Buy us a coffee
          </ButtonLink>
        </div>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
