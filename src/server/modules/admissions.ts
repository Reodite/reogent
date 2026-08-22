import type { DatasetModule } from "../core/types";
import { stripHtml } from "./html";
import { slugify } from "./tuition";

export interface AdmissionProgramDoc {
  id: number;
  name: string;
  summary: string;
  url: string;
  degrees: string[];
  interests: string[];
  duration: string | null;
  requirement_key: string | null; // null = no published requirements (see note)
  note: string | null;
}

export interface RequirementDoc {
  requirement_key: string;
  curriculum: string;
  location: string;
  location_slug: string;
  location_term_id: number;
  program_group: string | null;
  kind: string;
  position: number;
  requirement: string;
  advisory: boolean; // true = recommended, not a hard gate
}

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

/** programs.json (summary, duration, interest ids) joined with
 *  program_requirements.json (requirement group, degree names, url, note). */
export function joinPrograms(tables: {
  programs: Row[];
  programRequirements: Row[];
  interests: Row[];
}): AdmissionProgramDoc[] {
  const interestName = new Map(tables.interests.map((i) => [i.term_id, i.name as string]));
  const reqByProgram = new Map(tables.programRequirements.map((r) => [r.program_id, r]));
  return tables.programs
    .filter((p) => p.id != null && p.post_title)
    .map((p) => {
      const req = reqByProgram.get(p.id);
      return {
        id: p.id,
        name: String(p.post_title),
        summary: stripHtml(p.summary),
        url: String(req?.url ?? p.link ?? ""),
        degrees: Array.isArray(req?.degrees) ? req.degrees : [],
        interests: (Array.isArray(p.interests) ? p.interests : [])
          .map((t: number) => interestName.get(t))
          .filter((n: string | undefined): n is string => !!n),
        duration: p.duration?.amount ? `${p.duration.amount} ${p.duration.unit}` : null,
        requirement_key: req?.has_requirements && req.requirement_key ? String(req.requirement_key) : null,
        note: req?.note ?? null,
      };
    });
}

export function transformRequirement(row: Row): { id: string; doc: RequirementDoc } | null {
  if (!row.requirement_key || row.location_term_id == null || !row.requirement) return null;
  const doc: RequirementDoc = {
    requirement_key: String(row.requirement_key),
    curriculum: String(row.curriculum ?? ""),
    location: String(row.location ?? ""),
    location_slug: String(row.location_slug ?? ""),
    location_term_id: row.location_term_id,
    program_group: row.program_group ?? null,
    kind: String(row.kind ?? ""),
    position: typeof row.position === "number" ? row.position : 0,
    requirement: String(row.requirement),
    advisory: Boolean(row.advisory),
  };
  return {
    id: [
      doc.requirement_key,
      doc.location_term_id,
      doc.program_group ?? "",
      doc.kind,
      doc.position,
      slugify(doc.requirement).slice(0, 40),
    ].join("#"),
    doc,
  };
}

export const admissions: DatasetModule = {
  name: "admissions",
  indices: [
    {
      index: "admission_programs",
      settings: {
        searchableAttributes: ["name", "summary", "interests", "degrees"],
        filterableAttributes: ["degrees", "requirement_key"],
      },
      async *read(store) {
        const [programs, programRequirements, interests] = (await Promise.all([
          store.getJson("admissions/programs.json"),
          store.getJson("admissions/requirements/program_requirements.json"),
          store.getJson("admissions/interests.json"),
        ])) as Row[][];
        yield* joinPrograms({ programs, programRequirements, interests });
      },
      transform(doc: AdmissionProgramDoc) {
        return { id: String(doc.id), doc };
      },
    },
    {
      index: "admission_requirements",
      settings: {
        searchableAttributes: ["location", "requirement"],
        filterableAttributes: ["requirement_key", "location_term_id", "advisory", "kind", "curriculum"],
        sortableAttributes: ["position"],
      },
      async *read(store) {
        yield* (await store.getJson("admissions/requirements/required_courses.json")) as Row[];
      },
      transform: transformRequirement,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_programs",
        description:
          "Search UBC Vancouver undergraduate programs (the you.ubc.ca program finder) by keyword. Returns program names, summaries, degrees, typical duration, and links.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: { type: "string", description: "Keywords to match program names and summaries" },
              degree: { type: "string", description: 'Degree filter, e.g. "Bachelor of Science"' },
              limit: { type: "number", description: "Max results (default 10)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const query = String(input.query);
        const filters: string[] = [];
        if (input.degree) filters.push(`degrees = '${String(input.degree)}'`);
        const res = await search.index("admission_programs").search(query, {
          filter: filters.length > 0 ? filters.join(" AND ") : undefined,
          limit: Math.min(Number(input.limit) || 10, 30),
        });
        const hits = res.hits;
        if (hits.length === 0) throw new Error(`No UBC programs matched "${query}"`);
        return {
          programs: hits.map((h) => {
            const p = h as unknown as AdmissionProgramDoc;
            return { ...p, summary: p.summary.slice(0, 300) };
          }),
        };
      },
    },
    {
      spec: {
        name: "get_admission_requirements",
        description:
          "Get UBC Vancouver undergraduate admission requirements for a program, for applicants from a specific curriculum or location (a Canadian province, a country, or IB). Distinguishes hard requirements from advisory recommendations.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              program: { type: "string", description: 'Program name, e.g. "Computer Science" or "Engineering"' },
              location: {
                type: "string",
                description:
                  'Where the applicant studies, e.g. "British Columbia", "Ontario", "India", "International Baccalaureate"',
              },
              include_advisory: {
                type: "boolean",
                description: "If true, also include recommended (non-mandatory) items. Default false.",
              },
            },
            required: ["program", "location"],
          },
        },
      },
      async execute(input, search) {
        const programQuery = String(input.program ?? "");
        const progRes = await search.index("admission_programs").search(programQuery, { limit: 1 });
        const program = progRes.hits[0] as unknown as AdmissionProgramDoc | undefined;
        if (!program) throw new Error(`No UBC program matched "${programQuery}"`);
        if (!program.requirement_key) {
          throw new Error(
            `"${program.name}" has no published admission requirements${program.note ? `: ${program.note}` : ""}`,
          );
        }
        // Resolve the location to its unique term id first — location_slug alone
        // is ambiguous ("basic" exists in both province and country curricula).
        const locQuery = String(input.location ?? "");
        const locRes = await search.index("admission_requirements").search(locQuery, {
          filter: `requirement_key = '${program.requirement_key}'`,
          limit: 1,
        });
        const loc = locRes.hits[0] as unknown as RequirementDoc | undefined;
        if (!loc) {
          throw new Error(`No admission requirements found for applicants from "${locQuery}" (${program.name})`);
        }
        const filters: string[] = [
          `requirement_key = '${program.requirement_key}'`,
          `location_term_id = ${loc.location_term_id}`,
        ];
        if (!input.include_advisory) filters.push("advisory = false");
        const res = await search.index("admission_requirements").search("", {
          filter: filters.join(" AND "),
          sort: ["position:asc"],
          limit: 200,
        });
        const rows = res.hits as unknown as RequirementDoc[];
        if (rows.length === 0) {
          throw new Error(`No requirement lines found for "${program.name}" from "${loc.location}"`);
        }
        return {
          program: program.name,
          requirement_group: program.requirement_key,
          location: loc.location,
          curriculum: loc.curriculum,
          url: program.url,
          requirements: rows.map((r) => ({
            kind: r.kind,
            requirement: r.requirement,
            ...(r.advisory ? { advisory: true } : {}),
          })),
        };
      },
    },
  ],
};
