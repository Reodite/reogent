import type { DataReader, DatasetModule, SearchClient } from "../core/types";
import { stripHtml } from "./html";

const CATEGORIES = ["housing", "libraries", "student-support", "policies"] as const;
const RESOURCE_TABLES = [
  ["housing/residences.json", "housing", "residence"],
  ["housing/room_types.json", "housing", "room_type"],
  ["housing/fee_pages.json", "housing", "fee_page"],
  ["housing/guidance.json", "housing", "guidance"],
  ["libraries/branches.json", "libraries", "branch"],
  ["student-support/it_services.json", "student-support", "it_service"],
  ["student-support/wellbeing_resources.json", "student-support", "wellbeing_resource"],
  ["student-support/learning_commons_pages.json", "student-support", "learning_commons_page"],
  ["policies/index.json", "policies", "policy"],
] as const;
const TIMEZONE = "America/Vancouver";
const LIMIT_SCHEMA = {
  type: "integer",
  minimum: 1,
  maximum: 30,
  default: 10,
  description: "Maximum matching records to return (default 10, maximum 30).",
};
const HOURS_CAVEAT =
  "These are scheduled hours, not live room availability. Missing dates are unknown; check the source and additional hours links for service-specific schedules.";

type Row = Record<string, unknown>;
type Fact = string | number | boolean | null | string[];

interface SourceRecord {
  source_record_id: string;
  source_url: string;
  campus: "vancouver" | "okanagan" | null;
  retrieved_at: string;
  record_sha256: string;
}

/** Categories of public student source and fact records. */
export type StudentResourceCategory = (typeof CATEGORIES)[number];
/** Identifies the source table within a student-resource category. */
export type StudentResourceKind = (typeof RESOURCE_TABLES)[number][2];

/** A source-page index entry with selected scalar facts and supplied label arrays. */
export interface StudentResourceDoc extends SourceRecord {
  category: StudentResourceCategory;
  kind: StudentResourceKind;
  title: string;
  source_id: string;
  api_url: string | null;
  source_modified_at: string | null;
  facts: Record<string, Fact>;
}

/** A fee-cell observation; null cents mean unknown, and labels retain the source's basis. */
export interface HousingFeeObservation {
  source_row: number;
  source_column: number;
  row_label: string | null;
  column_label: string | null;
  period_label: string | null;
  amount_text: string;
  amount_cents: number | null;
  amount_basis: "per_person" | null;
  footnote_markers: string[];
}

/** A published fee table whose conditions require consulting the linked source. */
export interface HousingFeeTableDoc extends SourceRecord {
  title: string;
  source_modified_at: string | null;
  page_id: string;
  residence_ids: string[];
  table_index: number;
  section_labels: string[];
  values: HousingFeeObservation[];
  source_context_required: true;
}

/** Dated scheduled hours in Vancouver wall time, with provenance for the monthly schedule. */
export interface LibraryHoursDoc extends SourceRecord {
  branch_id: string;
  hours_id: number;
  date: string;
  timezone: typeof TIMEZONE;
  status: "open" | "closed" | "unknown";
  opens: string | null;
  closes: string | null;
  closes_next_day: boolean | null;
  hours_text: string | null;
  category: "regular" | "exception" | "holiday" | "exam" | null;
  schedule_id: string;
  additional_hours_urls: string[];
  schedule_source_url: string;
  schedule_retrieved_at: string;
  schedule_record_sha256: string;
  request_url: string;
}

function record(value: unknown, field: string): Row {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error(`${field} must be an object`);
  }
  return value as Row;
}

function array(value: unknown, field: string): unknown[] {
  if (!Array.isArray(value)) throw new Error(`${field} must be an array`);
  return value;
}

function text(value: unknown, field: string, allowEmpty = false): string {
  if (typeof value !== "string" || (!allowEmpty && !value.trim())) {
    throw new Error(`${field} must be ${allowEmpty ? "a string" : "a nonempty string"}`);
  }
  return value;
}

function identifier(value: unknown, field: string): string {
  const result = text(value, field);
  if (result !== result.trim() || /\p{Cc}/u.test(result)) {
    throw new Error(`${field} must be an identifier without surrounding whitespace or control characters`);
  }
  return result;
}

function url(value: unknown, field: string): string {
  const result = text(value, field);
  let parsed: URL;
  try {
    parsed = new URL(result);
  } catch {
    throw new Error(`${field} must be an HTTP(S) URL`);
  }
  if (
    !["http:", "https:"].includes(parsed.protocol) ||
    parsed.username ||
    parsed.password ||
    result !== result.trim() ||
    /[\r\n\t]/u.test(result)
  ) {
    throw new Error(`${field} must be an HTTP(S) URL without credentials or control characters`);
  }
  return result;
}

function integer(value: unknown, field: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER): number {
  if (typeof value !== "number" || !Number.isSafeInteger(value) || value < minimum || value > maximum) {
    throw new Error(`${field} must be a safe integer between ${minimum} and ${maximum}`);
  }
  return value;
}

function boolean(value: unknown, field: string): boolean {
  if (typeof value !== "boolean") throw new Error(`${field} must be a boolean`);
  return value;
}

function choice<const T extends string>(value: unknown, choices: readonly T[], field: string): T {
  if (typeof value !== "string" || !choices.includes(value as T)) {
    throw new Error(`${field} must be one of: ${choices.join(", ")}`);
  }
  return value as T;
}

function labels(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => text(item, `${field}[${index}]`, true));
}

function identifiers(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => identifier(item, `${field}[${index}]`));
}

function urls(value: unknown, field: string): string[] {
  return array(value, field).map((item, index) => url(item, `${field}[${index}]`));
}

function nullableText(value: unknown, field: string): string | null {
  return value === null ? null : text(value, field, true);
}

function isoDate(value: unknown, field: string): string {
  const result = text(value, field);
  const parsed = new Date(`${result}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/u.test(result) ||
    !Number.isFinite(parsed.getTime()) ||
    parsed.toISOString().slice(0, 10) !== result
  ) {
    throw new Error(`${field} must be a valid ISO date (YYYY-MM-DD)`);
  }
  return result;
}

/** Validates source timestamps without changing their timezone or retrieval time. */
export function timestamp(value: unknown, field: string): string {
  const result = text(value, field);
  if (
    !/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(
      result,
    ) ||
    !Number.isFinite(Date.parse(result))
  ) {
    throw new Error(`${field} must be an ISO timestamp with a timezone`);
  }
  isoDate(result.slice(0, 10), field);
  return result;
}

function hash(value: unknown, field: string): string {
  const result = text(value, field);
  if (!/^[a-f0-9]{64}$/iu.test(result)) throw new Error(`${field} must be a SHA-256 hexadecimal string`);
  return result;
}

function coordinate(value: unknown, field: string, maximum: number): number | null {
  if (value === null) return null;
  if (typeof value !== "number" || !Number.isFinite(value) || Math.abs(value) > maximum) {
    throw new Error(`${field} must be a coordinate between ${-maximum} and ${maximum}, or null`);
  }
  return value;
}

function sourceRecord(row: Row, field: string, originalId: unknown): SourceRecord {
  return {
    source_record_id: identifier(originalId, `${field}.id`),
    source_url: url(row.source_url, `${field}.source_url`),
    campus: row.campus === null ? null : choice(row.campus, ["vancouver", "okanagan"], `${field}.campus`),
    retrieved_at: timestamp(row.retrieved_at, `${field}.retrieved_at`),
    record_sha256: hash(row.record_sha256, `${field}.record_sha256`),
  };
}

function plainTitle(value: unknown, field: string): string {
  return text(stripHtml(text(value, field)), field);
}

function resourceFacts(kind: StudentResourceKind, row: Row, field: string): StudentResourceDoc["facts"] {
  switch (kind) {
    case "residence":
      return {
        slug: text(row.slug, `${field}.slug`),
        beds: row.beds === null ? null : integer(row.beds, `${field}.beds`),
        undergraduate_audience: boolean(row.undergraduate_audience, `${field}.undergraduate_audience`),
        front_desk_text: nullableText(row.front_desk_text, `${field}.front_desk_text`),
        fee_urls: urls(row.fee_urls, `${field}.fee_urls`),
        fee_page_ids: identifiers(row.fee_page_ids, `${field}.fee_page_ids`),
        room_type_ids: identifiers(row.room_type_ids, `${field}.room_type_ids`),
      };
    case "room_type":
      return {
        slug: text(row.slug, `${field}.slug`),
        residence_ids: identifiers(row.residence_ids, `${field}.residence_ids`),
      };
    case "fee_page":
    case "guidance":
    case "learning_commons_page":
      return {
        upstream_id: integer(row.upstream_id, `${field}.upstream_id`),
        parent_id: row.parent_id === null ? null : identifier(row.parent_id, `${field}.parent_id`),
        slug: text(row.slug, `${field}.slug`),
      };
    case "branch":
      return {
        hours_id: integer(row.hours_id, `${field}.hours_id`),
        slug: text(row.slug, `${field}.slug`),
        website: row.website === null ? null : url(row.website, `${field}.website`),
        address_text: nullableText(row.address_text, `${field}.address_text`),
        contact_text: nullableText(row.contact_text, `${field}.contact_text`),
        accessibility_url:
          row.accessibility_url === null ? null : url(row.accessibility_url, `${field}.accessibility_url`),
        latitude: coordinate(row.latitude, `${field}.latitude`, 90),
        longitude: coordinate(row.longitude, `${field}.longitude`, 180),
        map_url: row.map_url === null ? null : url(row.map_url, `${field}.map_url`),
        location_type: choice(row.location_type, ["physical", "virtual_or_unlabelled"], `${field}.location_type`),
        booking_lid: row.booking_lid === null ? null : identifier(row.booking_lid, `${field}.booking_lid`),
      };
    case "it_service":
    case "wellbeing_resource":
      return {
        upstream_id: identifier(row.upstream_id, `${field}.upstream_id`),
        audiences: labels(row.audiences, `${field}.audiences`),
        categories: labels(row.categories, `${field}.categories`),
        unavailable_relationships: labels(row.unavailable_relationships, `${field}.unavailable_relationships`),
        ...(kind === "wellbeing_resource"
          ? {
              student_populations: labels(row.student_populations, `${field}.student_populations`),
              campus_labels: labels(row.campus_labels, `${field}.campus_labels`),
            }
          : {}),
      };
    case "policy":
      return {
        upstream_id: identifier(row.upstream_id, `${field}.upstream_id`),
        policy_number: nullableText(row.policy_number, `${field}.policy_number`),
        legacy_policy_number: nullableText(row.legacy_policy_number, `${field}.legacy_policy_number`),
        long_title: nullableText(row.long_title, `${field}.long_title`),
        policy_date: row.policy_date === null ? null : isoDate(row.policy_date, `${field}.policy_date`),
        procedures_date: row.procedures_date === null ? null : isoDate(row.procedures_date, `${field}.procedures_date`),
        guidelines_date: row.guidelines_date === null ? null : isoDate(row.guidelines_date, `${field}.guidelines_date`),
        rules_date: row.rules_date === null ? null : isoDate(row.rules_date, `${field}.rules_date`),
        lifecycle: choice(row.lifecycle, ["listed", "historical"], `${field}.lifecycle`),
        linked_from_search: boolean(row.linked_from_search, `${field}.linked_from_search`),
        content_kind: choice(row.content_kind, ["policy_index"], `${field}.content_kind`),
      };
  }
}

function studentResourceDocument(row: Row, kind: StudentResourceKind, facts: Row, originalId: unknown) {
  const table = RESOURCE_TABLES.find((entry) => entry[2] === kind);
  if (!table) throw new Error("student_resources.kind must identify a supported source table");
  const field = table[0];
  const doc: StudentResourceDoc = {
    ...sourceRecord(row, field, originalId),
    category: table[1],
    kind,
    title: plainTitle(row.title, `${field}.title`),
    source_id: identifier(row.source_id, `${field}.source_id`),
    api_url: row.api_url === null ? null : url(row.api_url, `${field}.api_url`),
    source_modified_at:
      row.source_modified_at === null ? null : timestamp(row.source_modified_at, `${field}.source_modified_at`),
    facts: resourceFacts(kind, facts, field),
  };
  return doc;
}

/** Validates a source-table row and excludes fields outside the selected source/fact projection. */
export function transformStudentResource(raw: unknown, kind: StudentResourceKind) {
  const row = record(raw, "student_resources row");
  const doc = studentResourceDocument(row, kind, row, row.id);
  return { id: doc.source_record_id, doc };
}

function studentResourceHit(raw: unknown): StudentResourceDoc {
  const row = record(raw, "student_resources result");
  const kind = choice(
    row.kind,
    RESOURCE_TABLES.map((entry) => entry[2]),
    "student_resources.kind",
  );
  const doc = studentResourceDocument(row, kind, record(row.facts, "student_resources.facts"), row.source_record_id);
  if (row.category !== doc.category) throw new Error("student_resources.category does not match its kind");
  return doc;
}

function housingFeeDocument(row: Row, originalId: unknown): HousingFeeTableDoc {
  const field = "housing_fees";
  if (row.source_context_required !== true) throw new Error(`${field}.source_context_required must be true`);
  return {
    ...sourceRecord(row, field, originalId),
    title: plainTitle(row.title, `${field}.title`),
    source_modified_at:
      row.source_modified_at === null ? null : timestamp(row.source_modified_at, `${field}.source_modified_at`),
    page_id: identifier(row.page_id, `${field}.page_id`),
    residence_ids: identifiers(row.residence_ids, `${field}.residence_ids`),
    table_index: integer(row.table_index, `${field}.table_index`),
    section_labels: labels(row.section_labels, `${field}.section_labels`),
    values: array(row.values, `${field}.values`).map((raw, index) => {
      const field = `housing_fees.values[${index}]`;
      const value = record(raw, field);
      return {
        source_row: integer(value.source_row, `${field}.source_row`),
        source_column: integer(value.source_column, `${field}.source_column`),
        row_label: nullableText(value.row_label, `${field}.row_label`),
        column_label: nullableText(value.column_label, `${field}.column_label`),
        period_label: nullableText(value.period_label, `${field}.period_label`),
        amount_text: text(value.amount_text, `${field}.amount_text`, true),
        amount_cents:
          value.amount_cents === null
            ? null
            : integer(value.amount_cents, `${field}.amount_cents`, -Number.MAX_SAFE_INTEGER),
        amount_basis:
          value.amount_basis === null ? null : choice(value.amount_basis, ["per_person"], `${field}.amount_basis`),
        footnote_markers: labels(value.footnote_markers, `${field}.footnote_markers`),
      };
    }),
    source_context_required: true,
  };
}

/** Preserves exact fee observations and rejects unsafe or coerced minor-unit amounts. */
export function transformHousingFeeTable(raw: unknown) {
  const row = record(raw, "housing_fees row");
  const doc = housingFeeDocument(row, row.id);
  return { id: doc.source_record_id, doc };
}

function monthlySchedule(raw: unknown) {
  const row = record(raw, "libraries/monthly_schedules.json row");
  const month = text(row.month, "monthly_schedules.month");
  isoDate(`${month}-01`, "monthly_schedules.month");
  return {
    id: identifier(row.id, "monthly_schedules.id"),
    branch_id: identifier(row.branch_id, "monthly_schedules.branch_id"),
    month,
    source_url: url(row.source_url, "monthly_schedules.source_url"),
    retrieved_at: timestamp(row.retrieved_at, "monthly_schedules.retrieved_at"),
    record_sha256: hash(row.record_sha256, "monthly_schedules.record_sha256"),
    request_url: url(row.request_url, "monthly_schedules.request_url"),
    additional_hours_urls: urls(row.additional_hours_urls, "monthly_schedules.additional_hours_urls"),
  };
}

function wallTime(value: unknown, field: string): string | null {
  if (value === null) return null;
  if (typeof value !== "string" || !/^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(value)) {
    throw new Error(`${field} must be HH:mm or null`);
  }
  return value;
}

function libraryHoursFields(row: Row, originalId: unknown) {
  return {
    ...sourceRecord(row, "library_hours", originalId),
    branch_id: identifier(row.branch_id, "library_hours.branch_id"),
    hours_id: integer(row.hours_id, "library_hours.hours_id"),
    date: isoDate(row.date, "library_hours.date"),
    timezone: choice(row.timezone, [TIMEZONE], "library_hours.timezone"),
    status: choice(row.status, ["open", "closed", "unknown"], "library_hours.status"),
    opens: wallTime(row.opens, "library_hours.opens"),
    closes: wallTime(row.closes, "library_hours.closes"),
    closes_next_day:
      row.closes_next_day === null ? null : boolean(row.closes_next_day, "library_hours.closes_next_day"),
    hours_text: nullableText(row.hours_text, "library_hours.hours_text"),
    category:
      row.category === null
        ? null
        : choice(row.category, ["regular", "exception", "holiday", "exam"], "library_hours.category"),
    schedule_id: identifier(row.schedule_id, "library_hours.schedule_id"),
  };
}

/** Joins a dated row to its schedule ID, requiring the same branch and calendar month. */
export function transformLibraryHours(raw: unknown, rawSchedule: unknown) {
  const row = record(raw, "library_hours row");
  const fields = libraryHoursFields(row, row.id);
  const schedule = monthlySchedule(rawSchedule);
  if (
    schedule.id !== fields.schedule_id ||
    schedule.branch_id !== fields.branch_id ||
    schedule.month !== fields.date.slice(0, 7)
  ) {
    throw new Error("library_hours.schedule_id must identify a schedule for the same branch and month");
  }
  const doc: LibraryHoursDoc = {
    ...fields,
    additional_hours_urls: schedule.additional_hours_urls,
    schedule_source_url: schedule.source_url,
    schedule_retrieved_at: schedule.retrieved_at,
    schedule_record_sha256: schedule.record_sha256,
    request_url: schedule.request_url,
  };
  return { id: doc.source_record_id, doc };
}

function libraryHoursHit(raw: unknown): LibraryHoursDoc {
  const row = record(raw, "library_hours result");
  return {
    ...libraryHoursFields(row, row.source_record_id),
    additional_hours_urls: urls(row.additional_hours_urls, "library_hours.additional_hours_urls"),
    schedule_source_url: url(row.schedule_source_url, "library_hours.schedule_source_url"),
    schedule_retrieved_at: timestamp(row.schedule_retrieved_at, "library_hours.schedule_retrieved_at"),
    schedule_record_sha256: hash(row.schedule_record_sha256, "library_hours.schedule_record_sha256"),
    request_url: url(row.request_url, "library_hours.request_url"),
  };
}

async function readRows(store: DataReader, path: string) {
  return array(await store.getJson(path), path);
}

function queryInput(value: unknown, required: boolean): string {
  if (value === undefined && !required) return "";
  return text(value, "query", !required).trim();
}

function limitInput(value: unknown): number {
  return value === undefined ? LIMIT_SCHEMA.default : integer(value, "limit", 1, LIMIT_SCHEMA.maximum);
}

function totals(result: { totalHits?: number; estimatedTotalHits?: number }, count: number) {
  const raw = result.totalHits ?? result.estimatedTotalHits;
  if (raw === undefined) return {};
  const total = integer(raw, "search total");
  return { total, has_more: total > count };
}

/** Searches fee tables without aggregating or converting their source observations. */
export async function getHousingFees(input: Record<string, unknown>, search: SearchClient) {
  const query = queryInput(input.query, true);
  const limit = limitInput(input.limit);
  const result = await search.index("housing_fees").search(query, { limit });
  const tables = array(result.hits, "housing_fees results").map((raw) => {
    const row = record(raw, "housing_fees result");
    return housingFeeDocument(row, row.source_record_id);
  });
  return {
    kind: "housing" as const,
    fee_tables: tables,
    ...totals(result, tables.length),
    caveat:
      "Check the linked source for eligibility, contract periods, deposits, meal plans and footnotes. Null amounts are unknown. Do not combine totals and instalments or annualize rates; modification dates are not fee-effective dates.",
  };
}

async function getLibraryHours(input: Record<string, unknown>, search: SearchClient) {
  const query = queryInput(input.query, false);
  const limit = limitInput(input.limit);
  const date =
    input.date === undefined
      ? new Intl.DateTimeFormat("en-CA", {
          timeZone: TIMEZONE,
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        }).format(new Date())
      : isoDate(input.date, "date");
  const result = await search.index("student_resources").search(query, {
    filter: `category = ${JSON.stringify("libraries")}`,
    limit,
  });
  const branches = array(result.hits, "student_resources results").map(studentResourceHit);
  for (const branch of branches) {
    if (branch.category !== "libraries" || branch.kind !== "branch") {
      throw new Error("student_resources library results must be branch records");
    }
  }
  const byBranch = new Map<string, LibraryHoursDoc>();
  if (branches.length > 0) {
    const branchIds = branches.map((branch) => branch.source_record_id);
    const hoursResult = await search.index("library_hours").search("", {
      filter: [`branch_id IN ${JSON.stringify(branchIds)}`, `date = ${JSON.stringify(date)}`],
      limit: branches.length,
    });
    for (const raw of array(hoursResult.hits, "library_hours results")) {
      const hours = libraryHoursHit(raw);
      const branch = branches.find((branch) => branch.source_record_id === hours.branch_id);
      if (!branch || hours.date !== date || hours.hours_id !== branch.facts.hours_id) {
        throw new Error("library_hours result does not match the requested branch, hours_id and date");
      }
      if (byBranch.has(hours.branch_id)) throw new Error("library_hours returned duplicate branch/date rows");
      byBranch.set(hours.branch_id, hours);
    }
  }
  return {
    date,
    timezone: TIMEZONE,
    caveat: HOURS_CAVEAT,
    branches: branches.map((branch) => ({
      ...branch,
      scheduled: byBranch.get(branch.source_record_id) ?? {
        source_record_id: null,
        source_url: null,
        campus: branch.campus,
        branch_id: branch.source_record_id,
        hours_id: integer(branch.facts.hours_id, "branch.facts.hours_id"),
        date,
        timezone: TIMEZONE,
        status: "unknown" as const,
        opens: null,
        closes: null,
        closes_next_day: null,
        hours_text: null,
        category: null,
        retrieved_at: null,
        record_sha256: null,
        schedule_id: null,
        additional_hours_urls: [],
        schedule_source_url: null,
        schedule_retrieved_at: null,
        schedule_record_sha256: null,
        request_url: null,
      },
    })),
    ...totals(result, branches.length),
  };
}

/** Public undergraduate source/fact indexes and scheduled-hours tools. */
export const undergraduate: DatasetModule = {
  name: "undergraduate",
  indices: [
    {
      index: "student_resources",
      replace: true,
      settings: {
        searchableAttributes: ["title", "facts"],
        filterableAttributes: ["category", "kind", "source_record_id"],
      },
      async *read(store) {
        for (const [path, , kind] of RESOURCE_TABLES) {
          for (const row of await readRows(store, path)) yield { row, kind };
        }
      },
      transform: ({ row, kind }) => transformStudentResource(row, kind),
    },
    {
      index: "housing_fees",
      replace: true,
      settings: {
        searchableAttributes: [
          "title",
          "section_labels",
          "values.row_label",
          "values.column_label",
          "values.period_label",
        ],
        filterableAttributes: ["page_id", "residence_ids"],
      },
      async *read(store) {
        yield* await readRows(store, "housing/fee_tables.json");
      },
      transform: transformHousingFeeTable,
    },
    {
      index: "library_hours",
      replace: true,
      settings: {
        searchableAttributes: ["hours_text"],
        filterableAttributes: ["branch_id", "hours_id", "date"],
      },
      async *read(store) {
        const schedules = new Map<string, ReturnType<typeof monthlySchedule>>();
        for (const raw of await readRows(store, "libraries/monthly_schedules.json")) {
          const schedule = monthlySchedule(raw);
          if (schedules.has(schedule.id)) throw new Error("monthly_schedules contains a duplicate schedule ID");
          schedules.set(schedule.id, schedule);
        }
        for (const raw of await readRows(store, "libraries/hours.json")) {
          const row = record(raw, "libraries/hours.json row");
          const scheduleId = identifier(row.schedule_id, "library_hours.schedule_id");
          const schedule = schedules.get(scheduleId);
          if (!schedule) throw new Error(`library_hours.schedule_id has no monthly schedule: ${scheduleId}`);
          yield { row, schedule };
        }
      },
      transform: ({ row, schedule }) => transformLibraryHours(row, schedule),
    },
  ],
  tools: [
    {
      spec: {
        name: "search_student_resources",
        description:
          "Look up IT services, source URLs and audience labels, alongside housing, library, student-support and policy source/fact records. Supplied audience and campus labels do not establish eligibility.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                minLength: 1,
                description: "Keywords for the source name, topic or supplied facts.",
              },
              category: {
                type: "string",
                enum: CATEGORIES,
                description: "Optional housing, libraries, student-support or policies category.",
              },
              limit: LIMIT_SCHEMA,
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const query = queryInput(input.query, true);
        const limit = limitInput(input.limit);
        const category = input.category === undefined ? undefined : choice(input.category, CATEGORIES, "category");
        const result = await search.index("student_resources").search(query, {
          filter: category === undefined ? undefined : `category = ${JSON.stringify(category)}`,
          limit,
        });
        const resources = array(result.hits, "student_resources results").map(studentResourceHit);
        return {
          resources,
          ...totals(result, resources.length),
          caveat:
            "Use only the returned facts and URLs. Missing login links or access requirements are unknown; refer to a returned source_url for those details.",
        };
      },
    },
    {
      spec: {
        name: "get_library_hours",
        description: "Look up scheduled hours, not live room availability, for library branches on a Vancouver date.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Optional branch name or keywords." },
              date: {
                type: "string",
                format: "date",
                description: "YYYY-MM-DD; defaults to today in America/Vancouver.",
              },
              limit: LIMIT_SCHEMA,
            },
            required: [],
          },
        },
      },
      execute: getLibraryHours,
    },
  ],
};
