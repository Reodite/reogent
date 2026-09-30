# Requirements Document

## Introduction

Restructure Reodite without changing student-facing behavior. Keep the current top-level directories, clarify ownership of shared contracts and planner calculations, and extract two feature-local responsibilities from large components. The user granted autonomous approval for the complete development process.

## Glossary

- **Application**: The existing Reodite Next.js application.
- **Shared_Contracts**: Course-index and pane-state declarations consumed across application layers.
- **Client_Algorithms**: Modules under `src/lib/` that implement client-side calculations and helpers.
- **Planner_Model**: Planner structures, constants, identifiers, year construction, and summer detection without persistent state.
- **Planner_Store**: The existing Zustand singleton, actions, migration, and local persistence.
- **Plan_Validator**: The ordered whole-plan prerequisite and corequisite calculation.
- **Import_Review**: The Workday import-review dialog and its temporary choices.
- **Boundary_Check**: Biome rules for prohibited imports using the repository's `@/` aliases.

## Requirements

### Requirement 1: Neutral contract ownership

**User Story:** As a maintainer, I want shared contracts outside routes and UI registries, so that client code depends on declarations with clear ownership.

#### Acceptance Criteria

1. THE Shared_Contracts SHALL preserve the existing course and pane type shapes.
2. THE Client_Algorithms SHALL import course and pane declarations from `src/shared/`.
3. THE Application SHALL preserve course-index canonicalization, sorting, pagination, cache behavior, rate limits, and response headers.
4. THE Application SHALL preserve pane registration order, component identities, public paths, default state, and provider topology.

### Requirement 2: Planner calculation independence

**User Story:** As a maintainer, I want planner calculations independent of browser persistence, so that I can test and reuse calculations without initializing the application store.

#### Acceptance Criteria

1. WHEN code imports placement, autofill, or co-op calculations, THE Client_Algorithms SHALL resolve model dependencies without loading Zustand or accessing localStorage.
2. THE Planner_Model SHALL preserve season order, credit limits, year limits, ID generation behavior, and study-term construction.
3. THE Planner_Store SHALL preserve its singleton, storage key, version, migration, persisted fields, and undo/redo behavior.
4. WHEN a supported co-op template is applied, THE Planner_Store SHALL apply the calculated years as one undoable action while retaining occupied study terms.
5. WHEN a faculty has no co-op template, THE Planner_Store SHALL leave the plan and history unchanged.

### Requirement 3: Explicit plan validation

**User Story:** As a maintainer, I want whole-plan validation outside the rendering component, so that I can inspect and test its rules directly.

#### Acceptance Criteria

1. WHEN the course index is unavailable, THE Plan_Validator SHALL return an empty map.
2. THE Plan_Validator SHALL evaluate prerequisites against earlier terms and corequisites against earlier or current terms in the existing traversal order.
3. THE Plan_Validator SHALL preserve duplicate warnings, unknown-course behavior, ignored-error details, and result ordering.
4. THE Plan_Validator SHALL preserve its input data and the completion-set snapshots retained for each evaluated term.
5. THE Application SHALL retain the current validation memoization dependencies and result consumers.

### Requirement 4: Feature-local import review

**User Story:** As a maintainer, I want a self-contained import-review component, so that the schedule pane coordinates the feature without owning dialog presentation.

#### Acceptance Criteria

1. THE Import_Review SHALL retain its existing rendered markup, shared primitives, labels, focus behavior, and dismissal behavior.
2. WHILE ambiguous rows lack selections, THE Import_Review SHALL disable merge and replace and retain skipped-row explanations.
3. WHEN the user applies an import, THE Import_Review SHALL pass the existing ordered selections and chosen mode to the parent callback.
4. WHEN the user cancels and reopens a review, THE Import_Review SHALL preserve the schedule and start with fresh temporary choices.
5. THE Application SHALL retain catalog loading, reconciliation, store application, view changes, and overlay-presence ownership in the parent pane.

### Requirement 5: Maintainable boundaries and verification

**User Story:** As a maintainer, I want executable checks and small commits, so that future changes preserve the corrected boundaries.

#### Acceptance Criteria

1. WHEN client algorithms import routes or feature components through `@/` aliases, THE Boundary_Check SHALL report an error.
2. WHEN shared modules import application routes, components, client helpers, or server modules through `@/` aliases, THE Boundary_Check SHALL report an error.
3. WHEN feature components import route entrypoints through `@/` aliases, THE Boundary_Check SHALL report an error.
4. THE Application SHALL use existing dependencies and preserve its authentication, validation, dataset pin, and published-data boundaries.
5. THE Application SHALL pass the full test suite, TypeScript, formatting, and lint with no added diagnostics for each implementation unit, followed by an isolated production build for the final source.
