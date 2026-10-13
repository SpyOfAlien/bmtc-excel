import type { Lesson, Score, ManualLessonFields, ResolvedLessonFields } from "./workbook";

export const emptyManualFields = (): ManualLessonFields => ({ name: "", objective: "", instruction: "", criteria: "", score: "" });

export function lessonReferences(lesson: Lesson | null, score: Score | null): Omit<ManualLessonFields, "score"> {
  return { name: lesson?.name ?? "", objective: lesson?.objective ?? "", instruction: lesson?.instruction ?? "",
    criteria: lesson?.scores.length ? score?.criteria ?? "" : lesson?.criteria ?? "" };
}

/** Reference content wins where available; missing fields use the teacher's text. */
export function resolveLessonFields(lesson: Lesson, score: Score | null, manual: ManualLessonFields): ResolvedLessonFields {
  const reference = lessonReferences(lesson, score);
  return { name: reference.name.trim() ? reference.name : manual.name,
    objective: reference.objective.trim() ? reference.objective : manual.objective,
    instruction: reference.instruction.trim() ? reference.instruction : manual.instruction,
    criteria: reference.criteria.trim() ? reference.criteria : manual.criteria,
    score: lesson.scores.length ? score?.value ?? "" : manual.score.trim() };
}
