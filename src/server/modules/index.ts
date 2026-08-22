import type { DatasetModule } from "../core/types";
import { prereqModule } from "../prereq/agent-tool";
import { admissions } from "./admissions";
import { buildings } from "./buildings";
import { calendar } from "./calendar";
import { costs } from "./costs";
import { courses } from "./courses";
import { events } from "./events";
import { grades } from "./grades";
import { pages } from "./pages";
import { parking } from "./parking";
import { places } from "./places";
import { spaces } from "./spaces";
import { tuition } from "./tuition";
import { createWidgetsModule } from "./widgets";

/** The dataset-module registry. Ingest, tool dispatch, and the /api/geo
 *  allowlist all derive from this list — adding a data source is one module
 *  file plus one entry here. The widgets module wraps the data modules so the
 *  show_widget tool can delegate to their internal executes. */
const dataModules: DatasetModule[] = [
  courses,
  tuition,
  buildings,
  admissions,
  costs,
  calendar,
  places,
  parking,
  spaces,
  events,
  pages,
  grades,
  prereqModule,
];

export const modules: DatasetModule[] = [...dataModules, createWidgetsModule()];
