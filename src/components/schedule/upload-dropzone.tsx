"use client";

import type { Schedule } from "@/src/lib/schedule/types";
import { useRef, useState } from "react";
import { useToast } from "./toast";

interface Props {
  onParsed: (schedule: Schedule, fileName: string) => void;
  label?: string;
}

const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Parses a Workday .xlsx selected through the drop area or native file picker. */
export function UploadDropzone({ onParsed, label = "Import Workday schedule" }: Props) {
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
        data-upload-dropzone
        className={`flex min-h-20 w-full flex-col items-center justify-center gap-1 rounded-lg border border-dashed px-4 py-3 text-center text-sm transition-colors ${
          over
            ? "border-primary bg-accent-subtle text-on-surface"
            : "border-border text-on-surface-variant hover:border-primary/50"
        }`}
      >
        <span className="text-on-surface font-medium">{label}</span>
        <span className="text-muted text-xs">Drop a Workday .xlsx file or click to browse.</span>
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
