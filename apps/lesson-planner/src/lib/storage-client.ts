import { z } from "zod";
import {
  lessonListSchema,
  lessonSchema,
  planListSchema,
  savedPlanSchema,
  planInputSchema,
  userSchema,
  studentListSchema, studentSchema, studentInputSchema, studentUpdateSchema, exportCountSchema, exportEventSchema,
} from "./storage-schema";
import type { PlanInput, StudentInput, StudentUpdate } from "./storage-schema";
import type { Lesson, Template } from "./workbook";

async function request<T>(
  path: string,
  schema: z.ZodType<T>,
  options?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, options);
  } catch {
    throw new Error(
      "Không kết nối được nơi lưu dữ liệu. Hãy kiểm tra kết nối rồi thử lại.",
    );
  }
  const body: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = z.object({ error: z.string() }).safeParse(body);
    throw new Error(
      error.success ? error.data.error : "Không lưu/đọc được dữ liệu.",
    );
  }
  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new Error("Dữ liệu trả về không đúng định dạng.");
  return parsed.data;
}
export const currentUser = () => request("/api/user", userSchema);
export const listLessons = () => request("/api/lessons", lessonListSchema);
export const createLesson = (lesson: Lesson) =>
  request("/api/lessons", lessonSchema, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(lesson),
  });
export const listPlans = () => request("/api/plans", planListSchema);
export const loadPlan = (id: string) =>
  request(`/api/plans/${encodeURIComponent(id)}`, savedPlanSchema);
export const savePlan = (plan: PlanInput) => {
  const validated = planInputSchema.parse(plan);
  return request(`/api/plans/${validated.id}`, savedPlanSchema, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(validated),
  });
};

/** Keep the reference catalog and saved lesson snapshots behind one template. */
export function extendTemplate(base: Template, added: Lesson[]): Template {
  const byCode = new Map(base.lessons);
  const replaced = new Set(added.map((lesson) => lesson.id));
  for (const lesson of added)
    byCode.set(
      lesson.code.normalize("NFC").toLocaleLowerCase("vi").replace(/\s/g, ""),
      lesson,
    );
  const reference = base.reference.filter(
    (row) => !row.lessonId || !replaced.has(row.lessonId),
  );
  for (const lesson of added) {
    if (lesson.scores.length)
      for (const score of lesson.scores)
        reference.push({
          id: score.id,
          lessonId: lesson.id,
          row: score.row,
          code: lesson.code,
          name: lesson.name,
          objective: lesson.objective,
          instruction: lesson.instruction,
          criteria: score.criteria,
          score: String(score.value),
        });
    else
      reference.push({
        id: lesson.id,
        lessonId: lesson.id,
        row: lesson.row,
        code: lesson.code,
        name: lesson.name,
        objective: lesson.objective,
        instruction: lesson.instruction,
        criteria: lesson.criteria,
        score: "",
      });
  }
  return { ...base, lessons: byCode, reference };
}

export const listStudents = () => request("/api/students", studentListSchema);
export const createStudent = (student: StudentInput) => request("/api/students", studentSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studentInputSchema.parse(student)) });
export const recordExport = (planId: string, eventId: string) => request(`/api/plans/${encodeURIComponent(planId)}/exports`, exportCountSchema, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(exportEventSchema.parse({ id: eventId })) });

export const updateStudent = (student: StudentUpdate) => request(`/api/students/${encodeURIComponent(student.id)}`, studentSchema, { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify(studentUpdateSchema.parse(student)) });
