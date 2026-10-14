import { Icon } from "@/src/components/icons";
import { ButtonLink } from "@/src/components/ui/button";
import { Heading } from "@/src/components/ui/heading";
import { WorkspaceCanvas, WorkspacePage } from "@/src/components/ui/workspace";
import type { Announcement } from "@/src/server/announcements";
import Link from "next/link";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";

const dateFormat = new Intl.DateTimeFormat("en-CA", { dateStyle: "long", timeZone: "UTC" });

function AnnouncementByline({ date, author }: Pick<Announcement, "date" | "author">) {
  return (
    <span className="text-muted inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
      <time dateTime={date}>{dateFormat.format(new Date(date))}</time>
      <span aria-hidden="true">·</span>
      <span>{author}</span>
    </span>
  );
}

/** Renders a newest-first feed of full-card announcement links. */
export function AnnouncementsFeed({ announcements }: { announcements: Announcement[] }) {
  return (
    <WorkspacePage composition="single" title="Announcements" description="Updates from the Reodite developers.">
      <WorkspaceCanvas padding="md" role="region" aria-label="Announcements feed" tabIndex={0}>
        {announcements.length ? (
          <ol className="mx-auto flex w-full max-w-3xl flex-col gap-4">
            {announcements.map((announcement) => (
              <li key={announcement.slug}>
                <Link
                  href={`/app/pulse/announcements/${announcement.slug}`}
                  aria-labelledby={`announcement-${announcement.slug}`}
                  className="neu-raised neu-shadow-on-surface-container-low bg-surface hover:bg-surface-container-high focus-visible:ring-primary/40 block rounded-xl p-4 transition-colors duration-150 focus-visible:ring-2 focus-visible:ring-offset-2 sm:p-6"
                >
                  <Heading id={`announcement-${announcement.slug}`} className="break-words">
                    {announcement.title}
                  </Heading>
                  <p className="mt-1">
                    <AnnouncementByline {...announcement} />
                  </p>
                  <p className="text-on-surface-variant mt-3 text-sm leading-relaxed break-words">
                    {announcement.summary}
                  </p>
                  <span className="text-primary mt-4 inline-flex items-center gap-1.5 text-sm font-medium">
                    Read announcement
                    <Icon name="right" size={16} />
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        ) : (
          <div className="mx-auto w-full max-w-prose py-8 text-center">
            <Heading>No announcements yet</Heading>
            <p className="text-muted mt-2 text-sm">Check back for updates from the Reodite team.</p>
          </div>
        )}
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}

/** Renders a complete announcement with safe Markdown and a stable return destination. */
export function AnnouncementDetails({ announcement }: { announcement: Announcement }) {
  return (
    <WorkspacePage
      composition="single"
      title={announcement.title}
      description={<AnnouncementByline {...announcement} />}
      leading={
        <ButtonLink href="/app/pulse/announcements" variant="ghost" size="fieldIcon" aria-label="Back to Announcements">
          <Icon name="arrowLeft" size={20} />
        </ButtonLink>
      }
    >
      <WorkspaceCanvas padding="md" role="region" aria-label="Announcement details" tabIndex={0}>
        <article className="mx-auto w-full max-w-[70ch] text-sm">
          <p className="text-on-surface-variant mb-6 text-base leading-relaxed break-words">{announcement.summary}</p>
          <div className="assistant-markdown">
            <Markdown
              remarkPlugins={[remarkGfm]}
              skipHtml
              components={{
                h1: ({ children }) => <Heading>{children}</Heading>,
                table: ({ children }) => (
                  // biome-ignore lint/a11y/noNoninteractiveTabindex: Keyboard users scroll wide tables within the article.
                  <section className="markdown-table-wrap" aria-label="Announcement table" tabIndex={0}>
                    <table>{children}</table>
                  </section>
                ),
                pre: ({ children }) => (
                  // biome-ignore lint/a11y/noNoninteractiveTabindex lint/a11y/useSemanticElements: The named pre retains code formatting and supports keyboard scrolling.
                  <pre role="region" aria-label="Code example" tabIndex={0}>
                    {children}
                  </pre>
                ),
              }}
            >
              {announcement.content}
            </Markdown>
          </div>
        </article>
      </WorkspaceCanvas>
    </WorkspacePage>
  );
}
