import { describe, expect, it } from "vitest";
import { joinPrograms, transformRequirement } from "./admissions";
import { transformAcademicDate, transformHoliday } from "./calendar";
import { transformLivingCost, transformStudentFee } from "./costs";
import { joinCourses } from "./courses";
import { transformEvent } from "./events";
import { stripHtml } from "./html";
import { transformPage } from "./pages";
import { transformParking } from "./parking";
import { transformPoi } from "./places";
import { transformStudySpace } from "./spaces";
import { meltTuition, transformTuition } from "./tuition";

describe("schedule-only course synthesis", () => {
  it("courses with sections but no calendar entry get a doc from the schedule table", () => {
    const docs = joinCourses({
      calCourses: [], // nothing in the calendar
      calSubjects: [],
      schedCourses: [
        {
          id: "c1",
          field_course_code: "AQUA_V 507",
          title: "Seafood Processing",
          field_credits: "2.00",
          prerequisite: "",
        },
      ],
      sections: [{ related: { course: "c1" }, field_section_number: "001", field_days: ["m"] }],
      terms: [],
      statuses: [],
    });
    expect(docs).toHaveLength(1);
    expect(docs[0]).toMatchObject({
      code: "AQUA_V 507",
      subject: "AQUA_V",
      title: "Seafood Processing",
      credits: 2,
      prerequisite: null,
    });
    expect(docs[0].sections).toHaveLength(1);
  });
});

describe("tuition keeps every billing unit", () => {
  it("per_instalment rows survive and the unit lands in the doc and ID", () => {
    const row = { program: "MBA", student_type: "domestic", amount: 12000, unit: "per_instalment" };
    const t = transformTuition(row);
    expect(t?.doc).toMatchObject({ unit: "per_instalment", amount_cad: 12000 });
    expect(t?.id).not.toBe(transformTuition({ ...row, unit: "per_credit" })?.id);
    expect(transformTuition({ program: "X", amount: "n/a", unit: "per_credit" })).toBeNull();
  });

  it("melt collapses an instalment schedule into one doc with the sum", () => {
    const base = { program: "EdD", student_type: "domestic", cohort_year: 2026, unit: "per_instalment" };
    const docs = meltTuition([
      { ...base, amount: 2187.82 },
      { ...base, amount: 4375.68 },
      { ...base, amount: 2187.82 },
      { program: "BSc", student_type: "domestic", amount: 200.5, unit: "per_credit" },
    ]);
    expect(docs).toHaveLength(2);
    const edd = docs.find((d) => d.program === "EdD");
    expect(edd).toMatchObject({ amount_cad: 8751.32, instalments: [2187.82, 4375.68, 2187.82] });
    expect(docs.find((d) => d.program === "BSc")).toMatchObject({ amount_cad: 200.5, instalments: null });
  });
});

describe("stripHtml", () => {
  it("drops tags, decodes entities, collapses whitespace", () => {
    expect(stripHtml("<p>Fees &amp; costs</p>\n<div>see&nbsp;below</div>")).toBe("Fees & costs see below");
    expect(stripHtml(null)).toBe("");
    expect(stripHtml("<style>p{color:red}</style>plain")).toBe("plain");
  });
});

describe("pages transform", () => {
  it("handles Drupal, WordPress, and report shapes with source-prefixed ids", () => {
    const drupal = transformPage({
      source: "calendar",
      shape: "drupal",
      row: { id: "abc", title: "Withdrawal", alias: "/w", body: { processed: "<p>Rules</p>" } },
    });
    expect(drupal).toMatchObject({
      id: "calendar#abc",
      doc: { title: "Withdrawal", url: "https://vancouver.calendar.ubc.ca/w", text: "Rules" },
    });

    const wp = transformPage({
      source: "admissions",
      shape: "wordpress",
      row: {
        id: 7,
        title: { rendered: "Financial aid" },
        link: "https://you.ubc.ca/aid",
        content: { rendered: "<b>Money</b>" },
      },
    });
    expect(wp).toMatchObject({ id: "admissions#7", doc: { title: "Financial aid", text: "Money" } });

    const report = transformPage({
      source: "reports",
      shape: "report",
      row: { url: "https://x/y.pdf", filename: "y.pdf", page_title: "Budget" },
    });
    expect(report).toMatchObject({ id: "reports#https://x/y.pdf", doc: { title: "Budget", url: "https://x/y.pdf" } });

    expect(transformPage({ source: "calendar", shape: "drupal", row: { id: "x" } })).toBeNull();
  });
});

describe("admissions", () => {
  it("joins programs with requirement groups and interest names", () => {
    const docs = joinPrograms({
      programs: [
        {
          id: 1,
          post_title: "CS",
          summary: "<p>Code</p>",
          interests: [10, 99],
          duration: { amount: "4", unit: "years" },
        },
        { id: 2, post_title: "Arts", interests: [] },
      ],
      programRequirements: [
        { program_id: 1, requirement_key: "science", has_requirements: true, degrees: ["BSc"], url: "u", note: null },
      ],
      interests: [{ term_id: 10, name: "Computers" }],
    });
    expect(docs[0]).toMatchObject({
      id: 1,
      summary: "Code",
      degrees: ["BSc"],
      interests: ["Computers"],
      duration: "4 years",
      requirement_key: "science",
    });
    expect(docs[1].requirement_key).toBeNull();
  });

  it("requirement IDs are deterministic and distinguish rows", () => {
    const row = {
      requirement_key: "arts",
      curriculum: "province",
      location: "British Columbia",
      location_slug: "bc",
      location_term_id: 5,
      kind: "course",
      position: 1,
      requirement: "English 12",
      advisory: false,
    };
    const a = transformRequirement(row);
    expect(a?.id).toBe(transformRequirement(row)?.id);
    expect(a?.id).not.toBe(transformRequirement({ ...row, requirement: "Math 12" })?.id);
    expect(a?.doc.advisory).toBe(false);
  });
});

describe("costs transforms", () => {
  it("living cost and student fee IDs are deterministic", () => {
    const lc = transformLivingCost({ item: "Housing", variant: "shared", amount: 800, basis: "per month" });
    expect(lc?.id).toBe("housing-shared");
    const fee = transformStudentFee({
      page: "fees",
      section: "Health",
      item: "U-Pass",
      student_type: "domestic",
      amount: 46,
    });
    expect(fee?.id).toBe(
      transformStudentFee({ page: "fees", section: "Health", item: "U-Pass", student_type: "domestic", amount: 46 })
        ?.id,
    );
    expect(transformStudentFee({ item: "no amount" })).toBeNull();
  });
});

describe("calendar transforms", () => {
  it("tags kinds and keeps IDs distinct across sources", () => {
    const d = transformAcademicDate({ event: "Winter Term 1 begins", section: "Terms", start: "2026-09-08" });
    const h = transformHoliday({ name: "Thanksgiving", date: "2026-10-12", ubc_specific: false });
    expect(d?.doc.kind).toBe("academic");
    expect(h?.doc).toMatchObject({ kind: "holiday", start: "2026-10-12", ubc_specific: false });
    expect(d?.id).not.toBe(h?.id);
  });
});

describe("geospatial transforms", () => {
  it("POI keeps Current features and reads [lon, lat]", () => {
    const t = transformPoi({
      properties: { POI_ID: "V1", PLACENAME: "Cafe", SERVICE_TYPE: "cafe", STATUS: "Current", HOURS: "M-F 8-4" },
      geometry: { type: "Point", coordinates: [-123.25, 49.26] },
    });
    expect(t?.doc).toMatchObject({ lat: 49.26, lon: -123.25, hours: "M-F 8-4" });
    expect(
      transformPoi({
        properties: { POI_ID: "V2", PLACENAME: "Old", STATUS: "Retired" },
        geometry: { coordinates: [0, 0] },
      }),
    ).toBeNull();
  });

  it('parking normalizes "0"/"1" flags and trims the payment link', () => {
    const t = transformParking({
      properties: {
        FAC_ID: 9,
        FAC_DESCRIPTION: "Rose Garden",
        FAC_EV: "1",
        FAC_BIKE: "0",
        PAYMENT_LINK: " https://honk/x",
      },
      geometry: { coordinates: [-123.25, 49.27] },
    });
    expect(t?.doc).toMatchObject({ ev_charging: true, bike_cage: false, payment_link: "https://honk/x" });
  });
});

describe("spaces transforms", () => {
  it("parses string capacities", () => {
    const room = transformStudySpace({ id: 3, Title: "AERL 120", "Building Code": "AERL", Capacity: "144" });
    expect(room?.doc.capacity).toBe(144);
  });
});

describe("events transform", () => {
  it("strips HTML, tolerates venue as object/array/absent", () => {
    const base = { global_id: "e1", title: "Talk", description: "<p>Big</p>", categories: [{ name: "Lectures" }] };
    expect(
      transformEvent({ ...base, venue: { venue: "Chan Centre", address: "6265 Crescent Rd" } })?.doc,
    ).toMatchObject({
      text: "Big",
      venue: "Chan Centre",
      categories: ["Lectures"],
    });
    expect(transformEvent({ ...base, venue: [{ venue: "Life Sciences" }] })?.doc.venue).toBe("Life Sciences");
    expect(transformEvent({ ...base, venue: [] })?.doc.venue).toBeNull();
    expect(transformEvent({ title: "no id" })).toBeNull();
  });
});
