"use client";

import { Field, SelectInput, TextInput } from "@/src/components/ui/form-controls";
import type { NeumorphicSurfaceToken } from "@/src/shared/color-tokens";
import type { StudentProfile } from "@/src/shared/profile";
import { useId } from "react";

interface ProfileFieldsProps {
  profile: StudentProfile;
  onChange: (profile: StudentProfile) => void;
  shadowOn?: NeumorphicSurfaceToken;
}

/** Personal details shared by onboarding and Settings. */
export function ProfileFields({ profile, onChange, shadowOn = "surface" }: ProfileFieldsProps) {
  const id = useId();
  return (
    <div className="flex flex-col gap-3">
      <Field label="What should we call you?" htmlFor={`${id}-name`}>
        <TextInput
          id={`${id}-name`}
          shadowOn={shadowOn}
          autoComplete="nickname"
          maxLength={64}
          placeholder="Your preferred name"
          value={profile.preferred_name ?? ""}
          onChange={(event) => onChange({ ...profile, preferred_name: event.target.value })}
        />
      </Field>
      <Field label="Year of study" htmlFor={`${id}-year`}>
        <SelectInput
          id={`${id}-year`}
          shadowOn={shadowOn}
          value={profile.year ?? ""}
          onChange={(event) =>
            onChange({ ...profile, year: event.target.value ? Number(event.target.value) : undefined })
          }
        >
          <option value="">Choose your year (optional)</option>
          {[1, 2, 3, 4, 5, 6, 7].map((year) => (
            <option key={year} value={year}>
              Year {year}
            </option>
          ))}
        </SelectInput>
      </Field>
      <Field label="What are you studying?" htmlFor={`${id}-program`}>
        <TextInput
          id={`${id}-program`}
          shadowOn={shadowOn}
          maxLength={120}
          placeholder="e.g. Computer Science"
          value={profile.program ?? ""}
          onChange={(event) => onChange({ ...profile, program: event.target.value })}
        />
      </Field>
    </div>
  );
}

/** Preferences use the same fields and values in onboarding and Settings. */
export function PreferenceFields({ profile, onChange, shadowOn = "surface" }: ProfileFieldsProps) {
  const id = useId();
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
              className={`flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-lg px-2 text-sm neu-shadow-on-${shadowOn} ${
                (profile.theme ?? "system") === value
                  ? "neu-inset bg-surface-container text-primary"
                  : "neu-raised bg-surface text-on-surface-variant"
              }`}
            >
              <input
                type="radio"
                name={`${id}-theme`}
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
      <Field
        label="Tuition defaults"
        htmlFor={`${id}-student-type`}
        hint="Use these rates for tuition and cost questions."
      >
        <SelectInput
          id={`${id}-student-type`}
          shadowOn={shadowOn}
          value={profile.student_type ?? ""}
          onChange={(event) =>
            onChange({ ...profile, student_type: (event.target.value || undefined) as StudentProfile["student_type"] })
          }
          aria-describedby={`${id}-student-type-hint`}
        >
          <option value="">Ask me when needed</option>
          <option value="domestic">Domestic student</option>
          <option value="international">International student</option>
        </SelectInput>
      </Field>
    </div>
  );
}
