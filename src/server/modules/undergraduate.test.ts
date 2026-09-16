import { afterEach, describe, expect, it, vi } from "vitest";
import { CITATION_EXTRACTORS } from "../citations/extractors";
import type { DataReader, SearchClient } from "../core/types";
import {
  getHousingFees,
  transformHousingFeeTable,
  transformLibraryHours,
  transformStudentResource,
  undergraduate,
  type HousingFeeObservation,
  type HousingFeeTableDoc,
  type LibraryHoursDoc,
  type StudentResourceCategory,
  type StudentResourceDoc,
  type StudentResourceKind,
} from "./undergraduate";

type Row = Record<string, unknown>;
const RETRIEVED_AT = "2028-02-01T12:00:00Z";
const MODIFIED_AT = "2028-01-01T04:00:00-08:00";
const HASH = "a".repeat(64);
const BODY = "synthetic-body-sentinel";
const BODIES = {
  content_text: BODY,
  content_html: `<p>${BODY}</p>`,
  content_markdown: `# ${BODY}`,
  content: { rendered: `<p>${BODY}</p>` },
  html: `<div>${BODY}</div>`,
};

interface ResourceFixture {
  path: string;
  category: StudentResourceCategory;
  kind: StudentResourceKind;
  id: string;
  source_id: string;
  facts: StudentResourceDoc["facts"];
}

const RESOURCE_FIXTURES: ResourceFixture[] = [
  {
    path: "housing/residences.json",
    category: "housing",
    kind: "residence",
    id: "residence:example",
    source_id: "housing_residence",
    facts: {
      slug: "example-residence",
      beds: 18,
      undergraduate_audience: true,
      front_desk_text: "Example desk, 1 Test Lane",
      fee_urls: ["https://example.test/fees"],
      fee_page_ids: ["page:fees"],
      room_type_ids: ["room:example"],
    },
  },
  {
    path: "housing/room_types.json",
    category: "housing",
    kind: "room_type",
    id: "room:example",
    source_id: "housing_room",
    facts: { slug: "example-room", residence_ids: ["residence:example"] },
  },
  {
    path: "housing/fee_pages.json",
    category: "housing",
    kind: "fee_page",
    id: "page:fees",
    source_id: "housing_page",
    facts: { upstream_id: 41, parent_id: "page:parent", slug: "example-fees" },
  },
  {
    path: "housing/guidance.json",
    category: "housing",
    kind: "guidance",
    id: "page:guidance",
    source_id: "housing_page",
    facts: { upstream_id: 42, parent_id: null, slug: "example-guidance" },
  },
  {
    path: "libraries/branches.json",
    category: "libraries",
    kind: "branch",
    id: "library:alpha",
    source_id: "library_hours",
    facts: {
      hours_id: 7,
      slug: "example-branch",
      website: "https://example.test/library",
      address_text: "2 Test Lane",
      contact_text: "Example contact",
      accessibility_url: "https://example.test/access",
      latitude: 49.1,
      longitude: -123.1,
      map_url: "https://example.test/map",
      location_type: "physical",
      booking_lid: "00042",
    },
  },
  {
    path: "student-support/it_services.json",
    category: "student-support",
    kind: "it_service",
    id: "service:example",
    source_id: "it",
    facts: {
      upstream_id: "service-key",
      audiences: ["Learners", "Helpers", "Learners"],
      categories: ["Example tools"],
      unavailable_relationships: ["missing_category"],
    },
  },
  {
    path: "student-support/wellbeing_resources.json",
    category: "student-support",
    kind: "wellbeing_resource",
    id: "wellbeing:example",
    source_id: "wellbeing",
    facts: {
      upstream_id: "wellbeing-key",
      audiences: ["Helpers", "Learners"],
      categories: ["Example category"],
      unavailable_relationships: ["missing_audience"],
      student_populations: ["Population B", "Population A"],
      campus_labels: ["Example campus", "Virtual", "Example campus"],
    },
  },
  {
    path: "student-support/learning_commons_pages.json",
    category: "student-support",
    kind: "learning_commons_page",
    id: "learning:example",
    source_id: "learning_commons",
    facts: { upstream_id: 43, parent_id: null, slug: "example-learning" },
  },
  {
    path: "policies/index.json",
    category: "policies",
    kind: "policy",
    id: "policy:example",
    source_id: "university_counsel",
    facts: {
      upstream_id: "policy-key",
      policy_number: "EX1",
      legacy_policy_number: "01",
      long_title: "Example policy title",
      policy_date: "2028-02-29",
      procedures_date: "2028-03-01",
      guidelines_date: null,
      rules_date: null,
      lifecycle: "historical",
      linked_from_search: true,
      content_kind: "policy_index",
    },
  },
];

function sourceRow(id: string, overrides: Row = {}): Row {
  return {
    id,
    source_record_id: "must-not-override-original-id",
    source_id: "example-source",
    source_url: "https://example.test/source",
    api_url: "https://example.test/api",
    campus: "vancouver",
    title: "<b>Example &amp; student</b>",
    source_modified_at: MODIFIED_AT,
    retrieved_at: RETRIEVED_AT,
    record_sha256: HASH,
    ...BODIES,
    ...overrides,
  };
}

function resourceRow(kind: StudentResourceKind, overrides: Row = {}): Row {
  const fixture = RESOURCE_FIXTURES.find((fixture) => fixture.kind === kind)!;
  return sourceRow(fixture.id, {
    ...fixture.facts,
    source_id: fixture.source_id,
    related: { arbitrary_target: { ...BODIES } },
    facts: { ...BODIES },
    ...overrides,
  });
}

function observation(overrides: Row = {}): Row {
  return {
    source_row: 1,
    source_column: 2,
    row_label: "Example room",
    column_label: "Instalment",
    period_label: "Example term",
    amount_text: "$123.45*",
    amount_cents: 12345,
    amount_basis: "per_person",
    footnote_markers: ["*"],
    ...BODIES,
    ...overrides,
  };
}

function feeRow(overrides: Row = {}): Row {
  return sourceRow("page:fees:table:0", {
    page_id: "page:fees",
    residence_ids: ["residence:example"],
    table_index: 0,
    section_labels: ["Example contract", "Example term"],
    values: [observation()],
    source_context_required: true,
    ...overrides,
  });
}

function hoursRow(overrides: Row = {}): Row {
  return sourceRow("dated:example", {
    branch_id: "library:alpha",
    hours_id: 7,
    date: "2028-02-29",
    timezone: "America/Vancouver",
    category: "regular",
    hours_text: "9:30pm - 1:15am",
    status: "open",
    opens: "21:30",
    closes: "01:15",
    closes_next_day: true,
    schedule_id: "schedule:opaque-key",
    ...overrides,
  });
}

function scheduleRow(overrides: Row = {}): Row {
  return sourceRow("schedule:opaque-key", {
    source_url: "https://example.test/monthly",
    retrieved_at: "2028-02-01T11:00:00Z",
    record_sha256: "b".repeat(64),
    branch_id: "library:alpha",
    month: "2028-02",
    request_url: "https://example.test/calendar",
    additional_hours_urls: ["https://example.test/reference-hours"],
    rules: [{ ...BODIES }],
    ...overrides,
  });
}

function branchHit(overrides: Row = {}) {
  return {
    ...transformStudentResource(resourceRow("branch", overrides), "branch").doc,
    id: "sanitized_branch_id",
  };
}

function feeHit() {
  return { ...transformHousingFeeTable(feeRow()).doc, id: "sanitized_fee_id", ...BODIES };
}

function hoursHit() {
  return {
    ...transformLibraryHours(hoursRow(), scheduleRow()).doc,
    id: "sanitized_hours_id",
    ...BODIES,
  };
}

function fakeStore(tables: Record<string, unknown>) {
  return {
    getJson: vi.fn(async (key: string) => {
      if (!Object.hasOwn(tables, key)) throw new Error(`Unexpected table: ${key}`);
      return tables[key];
    }),
  } satisfies DataReader;
}

function fakeSearch(results: Record<string, { hits: unknown[]; totalHits?: number; estimatedTotalHits?: number }>) {
  const calls = vi.fn(async (name: string, _query: string, _options?: Row) => results[name] ?? { hits: [] });
  const search = {
    index: (name: string) => ({ search: (query: string, options?: Row) => calls(name, query, options) }),
  } as unknown as SearchClient;
  return { search, calls };
}

async function readDocuments(name: string, store: DataReader) {
  const index = undergraduate.indices.find((index) => index.index === name)!;
  const documents: { id: string; doc: object }[] = [];
  for await (const raw of index.read(store)) {
    const transformed = index.transform(raw);
    if (!transformed) throw new Error("Unexpected skipped row");
    documents.push(transformed);
  }
  return documents;
}

const resourcesTool = undergraduate.tools.find((tool) => tool.spec.name === "search_student_resources")!;
const hoursTool = undergraduate.tools.find((tool) => tool.spec.name === "get_library_hours")!;

afterEach(() => vi.useRealTimers());

describe("student_resources source projection", () => {
  it("declares three replacement indexes, two tools, and no derived artifacts", () => {
    expect(undergraduate.indices.map((index) => [index.index, index.replace])).toEqual([
      ["student_resources", true],
      ["housing_fees", true],
      ["library_hours", true],
    ]);
    expect(undergraduate.indices.every((index) => index.derive === undefined)).toBe(true);
    expect(undergraduate.geo).toBeUndefined();
    expect(undergraduate.tools.map((tool) => tool.spec.name)).toEqual([
      "search_student_resources",
      "get_library_hours",
    ]);
  });

  it("reads all nine source kinds, preserving provenance and selected facts without bodies", async () => {
    const store = fakeStore(
      Object.fromEntries(RESOURCE_FIXTURES.map((fixture) => [fixture.path, [resourceRow(fixture.kind)]])),
    );
    const documents = await readDocuments("student_resources", store);
    expect(store.getJson.mock.calls.map(([key]) => key)).toEqual(RESOURCE_FIXTURES.map((fixture) => fixture.path));
    expect(documents).toHaveLength(RESOURCE_FIXTURES.length);
    for (const [index, fixture] of RESOURCE_FIXTURES.entries()) {
      expect(documents[index]).toEqual({
        id: fixture.id,
        doc: {
          source_record_id: fixture.id,
          source_url: "https://example.test/source",
          source_id: fixture.source_id,
          api_url: "https://example.test/api",
          campus: "vancouver",
          title: "Example & student",
          source_modified_at: MODIFIED_AT,
          retrieved_at: RETRIEVED_AT,
          record_sha256: HASH,
          category: fixture.category,
          kind: fixture.kind,
          facts: fixture.facts,
        },
      });
    }
    expect(JSON.stringify(documents)).not.toContain(BODY);
  });

  it("preserves documented nulls, original booking strings, and supplied audience labels", () => {
    const residence = transformStudentResource(
      resourceRow("residence", { beds: null, front_desk_text: null, undergraduate_audience: false }),
      "residence",
    ).doc;
    expect(residence.facts).toMatchObject({ beds: null, front_desk_text: null, undergraduate_audience: false });
    const branch = transformStudentResource(
      resourceRow("branch", { source_modified_at: null, campus: null, api_url: null }),
      "branch",
    ).doc;
    expect(branch).toMatchObject({ source_modified_at: null, campus: null, api_url: null });
    expect(branch.facts).toMatchObject({ hours_id: 7, booking_lid: "00042" });
    expect(branch.facts).not.toHaveProperty("building_code");
    const virtual = transformStudentResource(
      resourceRow("branch", {
        website: null,
        address_text: null,
        contact_text: null,
        accessibility_url: null,
        latitude: null,
        longitude: null,
        map_url: null,
        booking_lid: null,
        location_type: "virtual_or_unlabelled",
      }),
      "branch",
    ).doc;
    expect(virtual.facts).toMatchObject({ booking_lid: null, latitude: null, longitude: null, address_text: null });
    const support = transformStudentResource(resourceRow("it_service"), "it_service").doc;
    expect(support.facts.audiences).toEqual(["Learners", "Helpers", "Learners"]);
    expect(support.facts.unavailable_relationships).toEqual(["missing_category"]);
    expect(support.facts).not.toHaveProperty("eligible");
  });

  it.each(RESOURCE_FIXTURES)("rejects a malformed array at $path", async (fixture) => {
    const tables: Record<string, unknown> = Object.fromEntries(RESOURCE_FIXTURES.map((entry) => [entry.path, []]));
    tables[fixture.path] = { rows: [] };
    await expect(readDocuments("student_resources", fakeStore(tables))).rejects.toThrow(fixture.path);
  });

  it.each([null, [], "record", 2])("rejects non-object records: %j", (raw) => {
    expect(() => transformStudentResource(raw, "residence")).toThrow(/row must be an object/u);
  });

  it.each<[StudentResourceKind, Row, string]>([
    ["residence", { id: 1 }, ".id"],
    ["residence", { id: "record\nkey" }, ".id"],
    ["residence", { source_id: null }, "source_id"],
    ["residence", { title: { rendered: "title" } }, "title"],
    ["residence", { source_url: "javascript:alert(1)" }, "source_url"],
    ["residence", { source_url: "https://name:password@example.test" }, "source_url"],
    ["residence", { api_url: "not a URL" }, "api_url"],
    ["residence", { record_sha256: "short" }, "record_sha256"],
    ["residence", { retrieved_at: "2028-02-30T12:00:00Z" }, "retrieved_at"],
    ["residence", { source_modified_at: "2028-02-01" }, "source_modified_at"],
    ["residence", { campus: "invented" }, "campus"],
    ["residence", { beds: "18" }, "beds"],
    ["residence", { undergraduate_audience: "yes" }, "undergraduate_audience"],
    ["residence", { fee_urls: ["file:///tmp/fees"] }, "fee_urls"],
    ["room_type", { residence_ids: "residence:example" }, "residence_ids"],
    ["guidance", { parent_id: 4 }, "parent_id"],
    ["branch", { hours_id: "7" }, "hours_id"],
    ["branch", { booking_lid: 42 }, "booking_lid"],
    ["branch", { latitude: 91 }, "latitude"],
    ["branch", { location_type: "occupied" }, "location_type"],
    ["it_service", { audiences: [4] }, "audiences"],
    ["it_service", { categories: null }, "categories"],
    ["it_service", { unavailable_relationships: [{}] }, "unavailable_relationships"],
    ["wellbeing_resource", { campus_labels: "Virtual" }, "campus_labels"],
    ["wellbeing_resource", { student_populations: [{}] }, "student_populations"],
    ["policy", { policy_date: "2027-02-29" }, "policy_date"],
    ["policy", { lifecycle: "in-force" }, "lifecycle"],
    ["policy", { content_kind: "content_html" }, "content_kind"],
  ])("rejects malformed %s fields %j", (kind, patch, field) => {
    expect(() => transformStudentResource(resourceRow(kind, patch), kind)).toThrow(field);
  });
});

describe("housing fee observations", () => {
  it("reads exact observations, source context and original identities without aggregation", async () => {
    const amounts = [null, 0, Number.MAX_SAFE_INTEGER, -12345];
    const values = amounts.map((amount_cents) =>
      observation({ amount_cents, amount_text: amount_cents === null ? "-" : "source amount" }),
    );
    const store = fakeStore({ "housing/fee_tables.json": [feeRow({ values })] });
    const [transformed] = await readDocuments("housing_fees", store);
    const doc = transformed.doc as HousingFeeTableDoc;
    expect(transformed.id).toBe("page:fees:table:0");
    expect(doc).toMatchObject({
      source_record_id: "page:fees:table:0",
      page_id: "page:fees",
      residence_ids: ["residence:example"],
      table_index: 0,
      section_labels: ["Example contract", "Example term"],
      source_context_required: true,
      source_modified_at: MODIFIED_AT,
      retrieved_at: RETRIEVED_AT,
      record_sha256: HASH,
    });
    expect(doc.values.map((value) => value.amount_cents)).toEqual(amounts);
    expect(doc.values[0]).toEqual({
      source_row: 1,
      source_column: 2,
      row_label: "Example room",
      column_label: "Instalment",
      period_label: "Example term",
      amount_text: "-",
      amount_cents: null,
      amount_basis: "per_person",
      footnote_markers: ["*"],
    } satisfies HousingFeeObservation);
    expect(JSON.stringify(doc)).not.toContain(BODY);
    expect(store.getJson).toHaveBeenCalledExactlyOnceWith("housing/fee_tables.json");
  });

  it("retains nullable labels, blank amounts, and unknown modification dates", () => {
    const doc = transformHousingFeeTable(
      feeRow({
        source_modified_at: null,
        values: [
          observation({
            row_label: null,
            column_label: "",
            period_label: null,
            amount_text: "",
            amount_cents: null,
            amount_basis: null,
          }),
        ],
      }),
    ).doc;
    expect(doc).toMatchObject({ source_modified_at: null });
    expect(doc.values[0]).toMatchObject({
      row_label: null,
      column_label: "",
      period_label: null,
      amount_text: "",
      amount_cents: null,
      amount_basis: null,
    });
  });

  it.each(["12345", undefined, false, {}, 1.1, Number.MAX_SAFE_INTEGER + 1, NaN, Infinity, -Infinity])(
    "rejects unsafe or noninteger cents: %j",
    (amount_cents) => {
      expect(() => transformHousingFeeTable(feeRow({ values: [observation({ amount_cents })] }))).toThrow(
        "amount_cents",
      );
    },
  );

  it.each([false, null, undefined, "true"])("requires the source context flag: %j", (source_context_required) => {
    expect(() => transformHousingFeeTable(feeRow({ source_context_required }))).toThrow("source_context_required");
  });

  it.each([
    { source_row: 1.5 },
    { source_column: -1 },
    { amount_text: 123 },
    { amount_basis: "per_year" },
    { footnote_markers: [1] },
    { period_label: {} },
  ])("rejects malformed observations: %j", (patch) => {
    expect(() => transformHousingFeeTable(feeRow({ values: [observation(patch)] }))).toThrow(/housing_fees.values/u);
  });

  it("rejects malformed arrays and a malformed row after a valid table", async () => {
    await expect(readDocuments("housing_fees", fakeStore({ "housing/fee_tables.json": {} }))).rejects.toThrow(
      "housing/fee_tables.json must be an array",
    );
    await expect(
      readDocuments("housing_fees", fakeStore({ "housing/fee_tables.json": [feeRow(), feeRow({ values: [null] })] })),
    ).rejects.toThrow("housing_fees.values[0] must be an object");
    expect(() => transformHousingFeeTable(feeRow({ values: {} }))).toThrow("values must be an array");
  });

  it("returns fee tables through the housing helper with source-conditions guidance", async () => {
    const { search, calls } = fakeSearch({ housing_fees: { hits: [feeHit()] } });
    const result = await getHousingFees({ query: "  example fees  ", limit: 3 }, search);
    expect(calls).toHaveBeenCalledExactlyOnceWith("housing_fees", "example fees", { limit: 3 });
    expect(result.kind).toBe("housing");
    expect(result.fee_tables).toEqual([transformHousingFeeTable(feeRow()).doc]);
    expect(result.caveat).toMatch(/eligibility.*contract periods.*footnotes/u);
    expect(result.caveat).toContain("Null amounts are unknown");
    expect(result.caveat).toContain("totals and instalments");
    expect(result.caveat).toContain("modification dates are not fee-effective dates");
  });
});

describe("dated library schedules", () => {
  it("joins only schedule_id, preserving overnight wall times and both sources", async () => {
    const store = fakeStore({
      "libraries/monthly_schedules.json": [
        scheduleRow({ id: "decoy", additional_hours_urls: ["https://example.test/wrong-hours"] }),
        scheduleRow(),
      ],
      "libraries/hours.json": [hoursRow()],
    });
    const [transformed] = await readDocuments("library_hours", store);
    const doc = transformed.doc as LibraryHoursDoc;
    expect(transformed.id).toBe("dated:example");
    expect(doc).toEqual({
      source_record_id: "dated:example",
      source_url: "https://example.test/source",
      campus: "vancouver",
      retrieved_at: RETRIEVED_AT,
      record_sha256: HASH,
      branch_id: "library:alpha",
      hours_id: 7,
      date: "2028-02-29",
      timezone: "America/Vancouver",
      category: "regular",
      hours_text: "9:30pm - 1:15am",
      status: "open",
      opens: "21:30",
      closes: "01:15",
      closes_next_day: true,
      schedule_id: "schedule:opaque-key",
      additional_hours_urls: ["https://example.test/reference-hours"],
      schedule_source_url: "https://example.test/monthly",
      schedule_retrieved_at: "2028-02-01T11:00:00Z",
      schedule_record_sha256: "b".repeat(64),
      request_url: "https://example.test/calendar",
    });
    expect(JSON.stringify(doc)).not.toContain(BODY);
    expect(store.getJson.mock.calls).toEqual([["libraries/monthly_schedules.json"], ["libraries/hours.json"]]);
  });

  it.each(["regular", "exception", "holiday", "exam"])("preserves the published %s hours category", (category) => {
    expect(transformLibraryHours(hoursRow({ category }), scheduleRow()).doc.category).toBe(category);
  });

  it.each(["closed", "unknown"])("preserves %s with null wall times", (status) => {
    const doc = transformLibraryHours(
      hoursRow({ status, opens: null, closes: null, closes_next_day: null, category: null, hours_text: null }),
      scheduleRow(),
    ).doc;
    expect(doc).toMatchObject({ status, opens: null, closes: null, closes_next_day: null, hours_text: null });
    expect(doc.retrieved_at).toBe(RETRIEVED_AT);
  });

  it.each([
    "2027-02-29",
    "2028-02-30",
    "2028-13-01",
    "2028-00-01",
    "2028-01-00",
    "2028-2-01",
    "2028-02-01T00:00:00Z",
    2,
  ])("rejects invalid ISO dates: %j", (date) => {
    expect(() => transformLibraryHours(hoursRow({ date }), scheduleRow())).toThrow("library_hours.date");
  });

  it.each(["24:00", "9:00", "09:60", "12:30:00", "-01:00", "", 3600])("rejects invalid wall times: %j", (time) => {
    for (const field of ["opens", "closes"]) {
      expect(() => transformLibraryHours(hoursRow({ [field]: time }), scheduleRow())).toThrow(`library_hours.${field}`);
    }
  });

  it.each([{ id: "different-schedule" }, { branch_id: "library:beta" }, { month: "2028-03" }])(
    "rejects inconsistent schedule joins: %j",
    (patch) => {
      expect(() => transformLibraryHours(hoursRow(), scheduleRow(patch))).toThrow("same branch and month");
    },
  );

  it.each([
    { timezone: "UTC" },
    { status: "occupied" },
    { category: "live" },
    { hours_id: "7" },
    { closes_next_day: "true" },
    { hours_text: {} },
  ])("rejects malformed dated fields: %j", (patch) => {
    expect(() => transformLibraryHours(hoursRow(patch), scheduleRow())).toThrow(/library_hours/u);
  });

  it.each([
    { month: "2028-13" },
    { month: "2028-2" },
    { additional_hours_urls: null },
    { additional_hours_urls: ["javascript:alert(1)"] },
    { request_url: "ftp://example.test/calendar" },
  ])("rejects malformed monthly fields: %j", (patch) => {
    expect(() => transformLibraryHours(hoursRow(), scheduleRow(patch))).toThrow(/monthly_schedules/u);
  });

  it("rejects missing schedule IDs instead of joining a branch/month match", async () => {
    const store = fakeStore({
      "libraries/monthly_schedules.json": [scheduleRow({ id: "decoy" })],
      "libraries/hours.json": [hoursRow()],
    });
    await expect(readDocuments("library_hours", store)).rejects.toThrow("has no monthly schedule");
  });

  it("rejects duplicate schedules and malformed library arrays", async () => {
    await expect(
      readDocuments(
        "library_hours",
        fakeStore({ "libraries/monthly_schedules.json": [scheduleRow(), scheduleRow()], "libraries/hours.json": [] }),
      ),
    ).rejects.toThrow("duplicate schedule ID");
    for (const path of ["libraries/monthly_schedules.json", "libraries/hours.json"]) {
      const tables = {
        "libraries/monthly_schedules.json": [scheduleRow()],
        "libraries/hours.json": [hoursRow()],
        [path]: {},
      };
      await expect(readDocuments("library_hours", fakeStore(tables))).rejects.toThrow(`${path} must be an array`);
    }
  });
});

describe("undergraduate search tools", () => {
  it("states missing login and access details beside the retrieved facts", async () => {
    const service = transformStudentResource(resourceRow("it_service"), "it_service").doc;
    const { search } = fakeSearch({ student_resources: { hits: [service] } });
    const result = await resourcesTool.execute({ query: "example" }, search);
    expect(result).toMatchObject({
      resources: [service],
      caveat:
        "Use only the returned facts and URLs. Missing login links or access requirements are unknown; refer to a returned source_url for those details.",
    });
  });

  it("returns source/fact rows and available totals, preserving original identities", async () => {
    const branch = branchHit();
    const { search, calls } = fakeSearch({
      student_resources: {
        hits: [{ ...branch, ...BODIES, facts: { ...branch.facts, ...BODIES } }],
        estimatedTotalHits: 2,
      },
    });
    const result = await resourcesTool.execute({ query: " example ", category: "libraries", limit: 1 }, search);
    expect(calls).toHaveBeenCalledExactlyOnceWith("student_resources", "example", {
      filter: `category = ${JSON.stringify("libraries")}`,
      limit: 1,
    });
    expect(result).toEqual({
      resources: [transformStudentResource(resourceRow("branch"), "branch").doc],
      total: 2,
      has_more: true,
      caveat: expect.any(String),
    });
    expect(JSON.stringify(result)).not.toContain(BODY);
  });

  it("prefers exact totals and omits unavailable pagination metadata", async () => {
    const { search } = fakeSearch({ student_resources: { hits: [], totalHits: 0, estimatedTotalHits: 5 } });
    expect(await resourcesTool.execute({ query: "example" }, search)).toEqual({
      resources: [],
      total: 0,
      has_more: false,
      caveat: expect.any(String),
    });
    const noTotals = fakeSearch({ student_resources: { hits: [] } });
    expect(await resourcesTool.execute({ query: "example" }, noTotals.search)).toEqual({
      resources: [],
      caveat: expect.any(String),
    });
    expect(noTotals.calls).toHaveBeenCalledExactlyOnceWith("student_resources", "example", {
      filter: undefined,
      limit: 10,
    });
  });

  it.each(['libraries" OR category = "housing', "LIBRARIES", "", 4, [], null])(
    "rejects unsafe categories: %j",
    async (category) => {
      const { search, calls } = fakeSearch({});
      await expect(resourcesTool.execute({ query: "example", category }, search)).rejects.toThrow("category");
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it.each([undefined, null, "", "   ", 4, []])(
    "requires a nonempty query for resource and fee searches: %j",
    async (query) => {
      const { search, calls } = fakeSearch({});
      await expect(resourcesTool.execute({ query }, search)).rejects.toThrow("query");
      await expect(getHousingFees({ query }, search)).rejects.toThrow("query");
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it.each([0, -1, 1.5, "3", 31, Infinity, NaN, null])("rejects unbounded or noninteger limits: %j", async (limit) => {
    const { search, calls } = fakeSearch({});
    await expect(resourcesTool.execute({ query: "example", limit }, search)).rejects.toThrow("limit");
    await expect(getHousingFees({ query: "example", limit }, search)).rejects.toThrow("limit");
    await expect(hoursTool.execute({ limit }, search)).rejects.toThrow("limit");
    expect(calls).not.toHaveBeenCalled();
  });

  it("returns one scheduled object per original branch and unknown for a missing date", async () => {
    const { search, calls } = fakeSearch({
      student_resources: { hits: [branchHit(), branchHit({ id: "library:beta", hours_id: 8, booking_lid: null })] },
      library_hours: { hits: [hoursHit()] },
    });
    const result = (await hoursTool.execute({ query: "example", date: "2028-02-29", limit: 2 }, search)) as {
      date: string;
      timezone: string;
      caveat: string;
      branches: (StudentResourceDoc & { scheduled: Row })[];
    };
    expect(calls).toHaveBeenNthCalledWith(1, "student_resources", "example", {
      filter: 'category = "libraries"',
      limit: 2,
    });
    expect(calls).toHaveBeenNthCalledWith(2, "library_hours", "", {
      filter: ['branch_id IN ["library:alpha","library:beta"]', 'date = "2028-02-29"'],
      limit: 2,
    });
    expect(result.date).toBe("2028-02-29");
    expect(result.timezone).toBe("America/Vancouver");
    expect(result.caveat).toContain("scheduled hours, not live room availability");
    expect(result.branches[0].facts).toMatchObject({ hours_id: 7, booking_lid: "00042" });
    expect(result.branches[0].scheduled).toEqual(transformLibraryHours(hoursRow(), scheduleRow()).doc);
    expect(result.branches[1].scheduled).toMatchObject({
      branch_id: "library:beta",
      hours_id: 8,
      date: "2028-02-29",
      timezone: "America/Vancouver",
      status: "unknown",
      opens: null,
      closes: null,
      closes_next_day: null,
      retrieved_at: null,
      schedule_retrieved_at: null,
      source_record_id: null,
    });
    expect(JSON.stringify(result)).not.toContain(BODY);
    const citations = CITATION_EXTRACTORS.get_library_hours(result, {});
    expect(citations).toHaveLength(2);
    expect(citations[0]).toMatchObject({
      source_url: "https://example.test/source",
      detail: { date: "2028-02-29", retrieved_at: RETRIEVED_AT },
    });
    expect(citations[1].detail?.retrieved_at).toBeUndefined();
  });

  it.each([
    ["2028-03-01T03:00:00Z", "2028-02-29"],
    ["2028-07-01T05:00:00Z", "2028-06-30"],
  ])("defaults to the Vancouver date at %s", async (instant, date) => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(instant));
    const { search, calls } = fakeSearch({ student_resources: { hits: [branchHit()] }, library_hours: { hits: [] } });
    const result = await hoursTool.execute({}, search);
    expect(result).toMatchObject({
      date,
      timezone: "America/Vancouver",
      branches: [{ scheduled: { date, status: "unknown", retrieved_at: null } }],
    });
    expect(calls).toHaveBeenNthCalledWith(1, "student_resources", "", { filter: 'category = "libraries"', limit: 10 });
    expect(calls.mock.calls[1][2]?.filter).toEqual([
      'branch_id IN ["library:alpha"]',
      `date = ${JSON.stringify(date)}`,
    ]);
  });

  it("quotes opaque branch identifiers and keeps query text out of filters", async () => {
    const branchId = 'library:"quoted\\name" OR branch_id = "elsewhere';
    const query = 'example" OR category = "housing';
    const { search, calls } = fakeSearch({
      student_resources: { hits: [branchHit({ id: branchId })] },
      library_hours: { hits: [] },
    });
    await hoursTool.execute({ query, date: "2028-02-29" }, search);
    expect(calls).toHaveBeenNthCalledWith(1, "student_resources", query, {
      filter: 'category = "libraries"',
      limit: 10,
    });
    expect(calls).toHaveBeenNthCalledWith(2, "library_hours", "", {
      filter: [`branch_id IN ${JSON.stringify([branchId])}`, `date = ${JSON.stringify("2028-02-29")}`],
      limit: 1,
    });
  });

  it("skips the hours lookup when no branch matches", async () => {
    const { search, calls } = fakeSearch({ student_resources: { hits: [] } });
    expect(await hoursTool.execute({ date: "2028-02-29" }, search)).toMatchObject({ branches: [] });
    expect(calls).toHaveBeenCalledTimes(1);
  });

  it.each(["2028-02-30", '2028-02-29" OR status = "open', null, 7])(
    "rejects invalid date inputs before searching: %j",
    async (date) => {
      const { search, calls } = fakeSearch({});
      await expect(hoursTool.execute({ date }, search)).rejects.toThrow("date");
      expect(calls).not.toHaveBeenCalled();
    },
  );

  it.each([{ date: "2028-02-28" }, { branch_id: "library:elsewhere" }, { hours_id: 42 }])(
    "rejects mismatched hours results: %j",
    async (patch) => {
      const { search } = fakeSearch({
        student_resources: { hits: [branchHit()] },
        library_hours: { hits: [{ ...hoursHit(), ...patch }] },
      });
      await expect(hoursTool.execute({ date: "2028-02-29" }, search)).rejects.toThrow("does not match");
    },
  );
});
