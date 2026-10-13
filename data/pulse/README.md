# Pulse rounds

Signed-in students vote agree or disagree on statements at `/pulse`. The first vote wins; tallies appear after voting. Publishing a round locks the previous round. History shows the ten most recent locked rounds with final tallies.

## Publish

Create a seed such as `data/pulse/round-4.json`:

```json
{
  "title": "Round 4",
  "questions": [
    "The AMS Nest is the best place to study on campus",
    "An 8am lecture is worth taking for the right professor"
  ]
}
```

Questions must form a nonempty array of nonempty strings, each at most 280 characters, without case-insensitive duplicates. The title is optional. Validation runs before database writes.

Run from a repository checkout with Node 24 and dependencies installed, not the standalone app container:

```bash
DATABASE_URL=postgres://reodite:<POSTGRES_PASSWORD>@localhost:5432/reodite \
  npm run pulse:publish -- data/pulse/round-4.json
```

Confirm the database destination first. Publishing locks the active round and inserts the new round/questions in one transaction; failure rolls back. Voters see the result on their next feed load without an app restart. New votes on a locked round return 409; repeating an existing vote returns that stored vote.

Commit the seed before publishing. New files under ignored `data/` need an explicit path, for example `git add -f data/pulse/round-4.json`. Git records the questions; the database records votes. There is no undo command. Publish a corrected round if needed; the mistaken round remains locked.

## Question wording

Use one concrete claim per card. Avoid combined claims such as “cheap and quiet,” since a disagreement cannot identify which part failed. Keep subjective judgments distinct from official campus facts.

## Storage

`src/server/db/migrate.ts` defines `pulse_rounds`, `pulse_questions`, and `pulse_votes`. `src/server/pulse/store.ts` owns publication, first-write-wins voting, and tally visibility. Use question position to retain seed order in reports.
