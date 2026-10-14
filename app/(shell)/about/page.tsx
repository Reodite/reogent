"use client";

import { Icon } from "@/src/components/icons";
import { ButtonLink } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";

function CreatorAvatar({ name }: { name: string }) {
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        aria-hidden="true"
        className="bg-surface-container-high text-on-surface-variant flex size-16 items-center justify-center rounded-full text-xl font-medium"
      >
        {name[0]}
      </div>
      <span className="text-on-surface text-sm font-medium">{name}</span>
    </div>
  );
}

export default function AboutPage() {
  return (
    <WorkspacePage composition="single" title="About" description="UBC's website and advising sucks.">
      <WorkspaceCanvas padding="md">
        <div className="flex min-h-full flex-col items-center justify-center">
          <Heading as="h2" size="section" className="mb-6 text-center">
            The people building Reodite.
          </Heading>
          <div className="flex items-center justify-center gap-8">
            <CreatorAvatar name="Max" />
            <CreatorAvatar name="Chakorn" />
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
