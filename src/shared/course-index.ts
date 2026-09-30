/** One course in the client-side index the Prereq Tree builds its graph from.
 *  `code` is canonical "CPSC 110" (no `_V` suffix) so it matches the codes the
 *  prereq-AST parser emits. */
export type CourseIndexEntry = {
  code: string;
  title: string;
  credits: number | null;
  prerequisite: string | null;
  corequisite: string | null;
};
