"use client";

import { Icon } from "@/src/components/icons";
import type { Schedule } from "@/src/lib/schedule/types";
import { useRef, useState } from "react";
import { useToast } from "./toast";

interface Props {
  onParsed: (schedule: Schedule, fileName: string) => void;
  hero?: boolean;
  presentation?: "dropzone" | "button";
  label?: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Drop target + file picker for the Workday .xlsx export. */
export function UploadDropzone({
  onParsed,
  hero,
  presentation = "dropzone",
  label = "Import Workday schedule",
}: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);
  const toast = useToast();

  async function handleFile(file: File | undefined) {
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name)) {
      toast("That needs to be the .xlsx file exported from Workday.", "error");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      toast("That file is over 10 MB. Export a fresh schedule from Workday and try again.", "error");
      return;
    }
    try {
      const [{ parseScheduleXlsx }, buffer] = await Promise.all([
        import("@/src/lib/schedule/parse/scheduleParser"),
        file.arrayBuffer(),
      ]);
      const schedule = parseScheduleXlsx(buffer, file.name);
      onParsed(schedule, file.name);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not parse that file.", "error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setOver(true);
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(e) => {
          e.preventDefault();
          setOver(false);
          void handleFile(e.dataTransfer.files[0]);
        }}
        className={
          presentation === "button"
            ? "neu-button text-on-surface focus-visible:ring-primary/40 flex min-h-11 w-full items-center gap-2 rounded-xl px-3 text-left text-sm font-medium focus-visible:ring-2"
            : `flex w-full items-center justify-center rounded-lg border border-dashed text-center text-sm transition-colors ${
                over
                  ? "border-primary bg-primary/5 text-on-surface"
                  : "border-border text-on-surface-variant hover:border-primary/50"
              } ${hero ? "min-h-40 px-6" : "min-h-16 px-4"}`
        }
      >
        {presentation === "button" ? (
          <>
            <Icon name="file" className="text-primary size-4 shrink-0" />
            <span className="min-w-0 flex-1">
              <span className="block truncate">{label}</span>
              <span className="text-muted block text-xs font-normal">Workday Excel (.xlsx)</span>
            </span>
          </>
        ) : hero ? (
          <span>
            <strong className="text-on-surface font-medium">Drop your Workday schedule here</strong>
            <br />
            Academics → Registration &amp; Courses → View Saved Schedule → export to Excel (.xlsx)
            <br />
            <span className="text-muted">or click to browse</span>
          </span>
        ) : (
          <span>
            <strong className="text-on-surface font-medium">Add your schedule</strong> — drop a Workday .xlsx or click
          </span>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx"
        hidden
        onChange={(e) => {
          void handleFile(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </>
  );
}
