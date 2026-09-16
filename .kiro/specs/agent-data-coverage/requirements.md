# Requirements Document

## Introduction

Expand Reodite's tools to answer more questions supported by the current `ubc-unified-data` checkout. Audit available facts and existing retrieval paths before choosing changes. Test the resulting agent with ordinary questions, naive wording, campus slang, silly premises and multi-turn requests.

The operator approved an independent four-domain coverage audit and a first live sweep of 100 question cases against the configured `google` / `gemini-3.1-flash-lite` model, followed by up to 20 focused reruns. Preserve failed runs and report the limits of this finite sample. Commit each verified implementation unit separately.

Room-booking snapshots and their integration are outside this work. The operator plans a separate API later. Keep learning-space descriptions and published library hours; do not collect new upstream data to expand this task's scope.

## Glossary

- **Reodite**: The campus assistant, its registered tools, and its streamed answers and widgets.
- **Available_Data**: The pinned JSON, CSV, GeoJSON, sanitized Markdown and provenance metadata in `ubc-unified-data`.
- **Canonical_Dataset**: A logical collection of facts, counting alternate export formats and derived equivalents together where they preserve the same information.
- **Coverage_Matrix**: The mapping from Canonical_Datasets and available facts to reachable tool capabilities, limitations and question cases.
- **Data_Tools**: The registered Reodite retrieval functions and their ingestion projections.
- **Question_Case**: A named single-turn or short multi-turn conversation with source-backed expected behavior declared before its live execution.
- **Oracle**: The records, source qualifications and derivation needed to judge a Question_Case against Available_Data.
- **QA_Runner**: The stateless test process that invokes the normal agent with the configured model and search service while saving evidence.

## Requirements

### Requirement 1

**User Story:** As a developer, I want an evidence-based coverage map so I can expose useful data that the current tools miss.

#### Acceptance Criteria

1. THE Coverage_Matrix SHALL account for each Canonical_Dataset in the academic, student-service, campus and prose/event/report families.
2. WHEN a tool transformation omits available facts, THE Coverage_Matrix SHALL identify the source fields, remaining retrieval routes and affected questions.
3. WHEN an existing alternate tool can retrieve the required evidence, THE Coverage_Matrix SHALL identify that route before classifying the question as a coverage gap.
4. IF a dataset or suspected gap remains unverified, THEN THE Coverage_Matrix SHALL record the unresolved scope and its reason.
5. THE Coverage_Matrix SHALL distinguish unavailable source facts from facts present in Available_Data but inaccessible through current tools.

### Requirement 2

**User Story:** As a student, I want the assistant to retrieve the facts needed for my question without requiring me to know dataset names or internal identifiers.

#### Acceptance Criteria

1. WHEN a confirmed coverage gap enters the implementation plan, THE Data_Tools SHALL expose the required evidence through an existing tool or the smallest necessary new capability.
2. WHEN a question requires filtering, comparison, ranking, counting or a supported join, THE Data_Tools SHALL preserve the requested scope and label the scope of returned results.
3. IF a result exceeds a tool's response bound, THEN THE Data_Tools SHALL identify truncation and provide a supported continuation or narrower-query route.
4. WHEN a tool accepts filter values, identifiers or numeric inputs, THE Data_Tools SHALL validate those inputs before querying data.
5. WHEN a tool cannot apply a requested condition, THE Data_Tools SHALL report the limitation instead of presenting a broader result as an exact match.
6. THE Data_Tools SHALL use the ordinary dataset registry, `DATA_PATH` ingestion and shared search configuration without adding a separate production data gate.

### Requirement 3

**User Story:** As a student, I want answers that preserve source meaning so I can distinguish supported facts, calculations and unknowns.

#### Acceptance Criteria

1. WHEN Reodite states a UBC fact, THE Reodite SHALL support the claim with retrieved records or a calculation over stated, compatible inputs.
2. WHEN records include units, cohorts, campus, audience, date ranges, exceptions or source qualifications, THE Reodite SHALL preserve the qualifications relevant to the answer.
3. WHEN Reodite derives a total, comparison or aggregate, THE Reodite SHALL identify its inputs and aggregation scope.
4. IF a field or record is missing, null, conflicting or outside the collected period, THEN THE Reodite SHALL state the corresponding uncertainty without inferring zero, closure, ineligibility or absence.
5. WHEN Reodite cites a claim or supplies a link, THE Reodite SHALL use the source identity and URL associated with the supporting evidence.
6. WHEN Reodite reports freshness, THE Reodite SHALL distinguish source retrieval or publication time from index-build time where those values are available.
7. IF a question asks for booking availability, occupancy or another absent live feed, THEN THE Reodite SHALL explain that boundary and offer supported information where useful.

### Requirement 4

**User Story:** As a student, I want to ask questions in my own words, including awkward or silly wording, and receive an answer to the underlying request.

#### Acceptance Criteria

1. WHEN a question uses colloquial wording, typos or campus aliases, THE Reodite SHALL resolve the supported intent or ask for clarification when the ambiguity changes the answer.
2. WHEN a question contains several answerable parts, THE Reodite SHALL answer each supported part and identify unresolved parts.
3. WHEN a follow-up changes a filter, comparison or requested detail, THE Reodite SHALL use the conversation context while verifying new factual claims against tool evidence.
4. IF a question contains a false premise, THEN THE Reodite SHALL correct the unsupported premise without fabricating a confirming fact.
5. WHEN a question expresses a subjective preference, THE Reodite SHALL distinguish the student's preference from objective evidence available in the datasets.

### Requirement 5

**User Story:** As a developer, I want reproducible live-agent evidence so I can detect failures beyond tool-name selection.

#### Acceptance Criteria

1. THE QA_Runner SHALL execute a predeclared first sweep of 100 Question_Cases, including ordinary, silly or naive, ambiguous, multi-turn, cross-dataset and missing-data cases.
2. THE QA_Runner SHALL associate each Question_Case with an Oracle or an explicit unsupported-data expectation before its live execution.
3. WHEN a live case runs, THE QA_Runner SHALL record the question turns, model/provider, source and data revisions, effective prompt and tool-specification fingerprints, final answer, widget payloads, complete tool evidence, citations, timings and errors.
4. WHEN a case fails, THE QA_Runner SHALL retain the failed evidence and distinguish transport or timeout failures from retrieval and answer-quality failures.
5. THE QA_Runner SHALL limit focused post-fix reruns to 20 cases under the approved budget and request further authorization before exceeding that allowance.
6. THE QA_Runner SHALL invoke the normal agent without creating user chat sessions or changing user data.
7. THE QA_Runner SHALL keep credentials out of artifacts and keep full live evidence outside committed application source.
8. WHEN the sweep ends, THE Coverage_Matrix SHALL report the executed cases, verified outcomes, remaining failures and untested scope without claiming proof over every possible question.

### Requirement 6

**User Story:** As a maintainer, I want small verified changes so I can inspect, revert and extend each capability independently.

#### Acceptance Criteria

1. WHEN a non-trivial tool behavior changes, THE Data_Tools SHALL include a runnable deterministic regression check using synthetic fixtures.
2. WHEN a recorded failure leads to a fix, THE QA_Runner SHALL preserve the earlier run and compare the relevant post-fix evidence.
3. WHEN an implementation unit is ready, THE maintainer SHALL verify its focused tests, static checks and data contracts before creating a separate conventional commit.
4. WHEN the complete implementation enters final verification, THE maintainer SHALL run the full application tests with bounded workers, dataset checks for modified data contracts, type checking, lint, formatting and a source-matched production build.
5. THE Data_Tools SHALL preserve independent library-hour and learning-space functionality without restoring room-booking snapshots or scaffolding the deferred API.
