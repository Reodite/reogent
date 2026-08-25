# Pulse rounds

Pulse is the swipe-voting feed at `/pulse`. Signed-in students vote agree (swipe right) or disagree (swipe left) on statement cards. One vote per user per question, first vote wins, and tallies stay hidden until the voter has answered. Questions ship in rounds: publishing a new round locks the current one and freezes its results permanently. The goal is subjective campus data that scraping, UBC APIs, and Reddit cannot provide.

## Publish a round

1. Add a seed file in this directory, e.g. `round-2.json`:

```json
{
  "title": "Round 2 (October)",
  "questions": ["The AMS Nest is the best place to study on campus", "Another statement voted agree or disagree"]
}
```

Validation runs before the database is touched:

- `questions`: non-empty array of non-empty strings, each at most 280 characters, no case-insensitive duplicates.
- `title`: optional string. It shows in the feed header and identifies the round after it locks.

2. Run the script against the target database:

```bash
DATABASE_URL=postgres://reodite:<POSTGRES_PASSWORD>@localhost:5432/reodite \
  npm run pulse:publish -- data/pulse/round-2.json
```

Expected output:

```
Locked round 3. Published round 4 ("Round 2 (October)") with 12 questions.
```

Publishing is one transaction: it locks the active round (scores freeze, further votes on it return 409) and inserts the new questions. A failed run rolls back and leaves the current round active. Voters see the new cards on their next feed load. No app restart needed.

## Production notes

- Run the script from a repo checkout on the prod host (Node 24, `npm ci` once), not inside the app container. The production image is a standalone build without the script's tooling. Docker compose maps Postgres to host port 5432, so `localhost:5432` with the `POSTGRES_PASSWORD` from `.env` reaches the prod database.
- Commit each seed file here before publishing. Locked tallies live in the database; git keeps the history of what was asked.
- There is no undo. If a bad round ships, publish a corrected round; the mistaken one stays locked with whatever votes it collected.

## Writing questions

Every card is a single statement answered agree or disagree, so phrase each one as a claim someone can push back on. Flavors that work:

| Flavor           | Example                                                  |
| ---------------- | -------------------------------------------------------- |
| Best-of opinion  | "The AMS Nest is the best place to study on campus"      |
| Worth-it trade-off | "An 8am lecture is worth taking for the right professor" |
| Trend over time  | "The bus loop lines are worse this year than last year"  |
| Value judgment   | "Tuition is fair value for the education UBC provides"   |
| Head-to-head     | "Koerner Library beats Irving K. Barber for exam season" |

Keep statements concrete and one-sided. "X is good" splits cleanly; "X is better than Y for Z" collects sharper data. Avoid double-barreled claims ("cheap and quiet") because a disagree vote cannot say which half failed.

## Where the data lives

Schema in `src/server/db/migrate.ts`; server logic in `src/server/pulse/store.ts`.

| Table             | Contents                                                        |
| ----------------- | --------------------------------------------------------------- |
| `pulse_rounds`    | `status` (`active`/`locked`), `title`, publish and lock times   |
| `pulse_questions` | Statement text, owning round, seed order                        |
| `pulse_votes`     | One row per user per question: `agree` boolean plus a timestamp |

Results for a locked round:

```sql
SELECT q.text,
       COUNT(v.*) FILTER (WHERE v.agree) AS agree,
       COUNT(v.*) FILTER (WHERE NOT v.agree) AS disagree
FROM pulse_questions q
LEFT JOIN pulse_votes v ON v.question_id = q.id
WHERE q.round_id = $1
GROUP BY q.id, q.text, q.position
ORDER BY q.position;
```
