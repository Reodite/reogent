"use client";

import type { StudentProfile } from "@/src/shared/profile";

const FIELD_CLASS =
  "neu-inset bg-surface-container-low text-on-surface placeholder:text-muted focus-visible:ring-primary/40 h-11 w-full rounded-lg px-3 text-sm focus-visible:ring-2 focus-visible:ring-offset-1";
const LABEL_CLASS = "text-on-surface-variant flex flex-col gap-2 text-sm font-medium";

interface ProfileFieldsProps {
  profile: StudentProfile;
  onChange: (profile: StudentProfile) => void;
}

/** Personal details shared by onboarding and Settings. */
export function ProfileFields({ profile, onChange }: ProfileFieldsProps) {
  return (
    <div className="flex flex-col gap-5">
      <label className={LABEL_CLASS}>
        What should we call you?
        <input
          autoComplete="nickname"
          maxLength={64}
          placeholder="Your preferred name"
          value={profile.preferred_name ?? ""}
          onChange={(event) => onChange({ ...profile, preferred_name: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>
      <label className={LABEL_CLASS}>
        Year of study
        <select
          value={profile.year ?? ""}
          onChange={(event) =>
            onChange({ ...profile, year: event.target.value ? Number(event.target.value) : undefined })
          }
          className={FIELD_CLASS}
        >
          <option value="">Choose your year (optional)</option>
          {[1, 2, 3, 4, 5, 6, 7].map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </select>
      </label>
      <label className={LABEL_CLASS}>
        What are you studying?
        <input
          maxLength={120}
          placeholder="e.g. Computer Science"
          value={profile.program ?? ""}
          onChange={(event) => onChange({ ...profile, program: event.target.value })}
          className={FIELD_CLASS}
        />
      </label>
    </div>
  );
}

/** Preferences use the same fields and values in onboarding and Settings. */
export function PreferenceFields({ profile, onChange }: ProfileFieldsProps) {
  return (
    <div className="flex flex-col gap-6">
      <fieldset>
        <legend className="text-on-surface mb-2 text-sm font-medium">Appearance</legend>
        <div className="grid grid-cols-3 gap-2">
          {(
            [
              ["light", "Light"],
              ["system", "System"],
              ["dark", "Dark"],
            ] as const
          ).map(([value, label]) => (
            <label
              key={value}
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-xl px-2 text-sm ${
                (profile.theme ?? "system") === value
                  ? "neu-inset bg-accent-subtle text-primary"
                  : "neu-button bg-surface text-on-surface-variant"
              }`}
            >
              <input
                type="radio"
                name="theme"
                value={value}
                checked={(profile.theme ?? "system") === value}
                onChange={() => onChange({ ...profile, theme: value })}
                className="accent-primary"
              />
              {label}
            </label>
          ))}
        </div>
        <p className="text-muted mt-2 text-xs">System follows your device&apos;s light or dark setting.</p>
      </fieldset>
      <label className={LABEL_CLASS}>
        Tuition defaults
        <select
          value={profile.student_type ?? ""}
          onChange={(event) =>
            onChange({ ...profile, student_type: (event.target.value || undefined) as StudentProfile["student_type"] })
          }
          className={FIELD_CLASS}
          aria-describedby="student-type-help"
        >
          <option value="">Ask me when needed</option>
          <option value="domestic">Domestic student</option>
          <option value="international">International student</option>
        </select>
        <span id="student-type-help" className="text-muted text-xs font-normal">
          Use these rates for tuition and cost questions.
        </span>
      </label>
    </div>
  );
}
