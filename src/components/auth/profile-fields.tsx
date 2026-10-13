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
        <TextInput
          id={`${id}-year`}
          shadowOn={shadowOn}
          type="number"
          inputMode="numeric"
          min={1}
          max={10}
          step={1}
          placeholder="1–10"
          value={profile.year ?? ""}
          onChange={(event) =>
            onChange({ ...profile, year: event.target.value ? event.target.valueAsNumber : undefined })
          }
        />
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
