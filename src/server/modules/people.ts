import { optionalText } from "@/src/lib/building-catalog";
import type { DatasetModule, SearchClient } from "../core/types";
import { resolveBuilding } from "./buildings";

export interface PersonDoc {
  id: string;
  name: string;
  first_name: string | null;
  last_name: string | null;
  job_title: string | null;
  email: string | null;
  phone: string | null;
  /** Office as published, e.g. "CEME 1214" — free text; the first token is usually a building code. */
  office: string | null;
  program: string | null;
  /** Publishing host (e.g. "science.ubc.ca"): the only unit marker the dataset carries. */
  unit: string;
  url: string | null;
}

/** A person plus the resolved office building, when the office's first token names one. */
export type PersonHit = PersonDoc & { building?: { code: string; name: string; lat: number; lon: number } };

// biome-ignore lint/suspicious/noExplicitAny: raw dataset rows
type Row = Record<string, any>;

export function transformPerson(row: Row): { id: string; doc: PersonDoc } | null {
  const name = optionalText(row.title);
  if (!row.id || !name || row.status === false) return null;
  const unit = optionalText(row.site) ?? "";
  const alias = optionalText(row.alias);
  return {
    id: String(row.id),
    doc: {
      id: String(row.id),
      name,
      first_name: optionalText(row.field_profile_first_name),
      last_name: optionalText(row.field_profile_last_name),
      job_title: optionalText(row.field_profile_job_title),
      email: optionalText(row.field_profile_email),
      phone: optionalText(row.field_profile_phone),
      office: optionalText(row.field_profile_office),
      program: optionalText(row.field_profile_program),
      unit,
      url: unit && alias ? `https://${unit}${alias}` : null,
    },
  };
}

/** Attaches the office building to each hit. Unresolvable offices stay text-only. */
async function withBuildings(search: SearchClient, people: PersonDoc[]): Promise<PersonHit[]> {
  const cache = new Map<string, Promise<PersonHit["building"] | undefined>>();
  const lookup = (token: string) => {
    let pending = cache.get(token);
    if (!pending) {
      pending = resolveBuilding(search, token)
        .then((b) => ({ code: b.code, name: b.name, lat: b.lat, lon: b.lon }))
        .catch(() => undefined);
      cache.set(token, pending);
    }
    return pending;
  };
  return Promise.all(
    people.map(async (person) => {
      const token = person.office?.split(/\s+/)[0];
      const building = token ? await lookup(token) : undefined;
      return building ? { ...person, building } : person;
    }),
  );
}

export const people: DatasetModule = {
  name: "people",
  indices: [
    {
      index: "people",
      settings: {
        searchableAttributes: ["name", "job_title", "unit", "program"],
        filterableAttributes: ["unit"],
      },
      async *read(store) {
        yield* (await store.getJson("people/profiles.json")) as Row[];
      },
      transform: transformPerson,
    },
  ],
  tools: [
    {
      spec: {
        name: "find_person",
        description:
          "Find UBC faculty or staff in the public directories of the Science, Applied Science, Law, Nursing, and Pharmaceutical Sciences sites: name, title, email, phone, office, and unit. When the office names a building, the result includes that building's code and coordinates. Quote contact details verbatim.",
        inputSchema: {
          json: {
            type: "object",
            properties: {
              query: {
                type: "string",
                description: 'Name, title, or unit keywords, e.g. "Susan Allen" or "Dean Science"',
              },
              limit: { type: "number", description: "Max results (default 5)" },
            },
            required: ["query"],
          },
        },
      },
      async execute(input, search) {
        const query = String(input.query ?? "").trim();
        if (!query) throw new Error("find_person requires a query");
        const res = await search.index("people").search(query, { limit: Math.min(Number(input.limit) || 5, 20) });
        const hits = res.hits as unknown as PersonDoc[];
        if (hits.length === 0) throw new Error(`No people matched "${query}"`);
        return { people: await withBuildings(search, hits) };
      },
    },
  ],
};
