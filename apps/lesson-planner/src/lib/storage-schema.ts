import { z } from "zod";

const uuid = z.string().uuid();
const text = z
  .string()
  .max(32767)
  .refine(
    (value) => !/[\x00-\x08\x0b\x0c\x0e-\x1f]/.test(value),
    "Nội dung chứa ký tự không hợp lệ.",
  );
const shortText = text.pipe(z.string().max(200));
export const scoreSchema = z.object({
  id: uuid,
  label: shortText,
  source: shortText,
  value: z.union([text, z.number().finite(), z.boolean()]),
  criteria: text,
  row: z.number().int().min(0),
  dateLike: z.boolean(),
});
export const lessonSchema = z.object({
  id: uuid,
  code: shortText.pipe(z.string().trim().min(1).max(40)),
  name: shortText,
  objective: text,
  instruction: text,
  criteria: text,
  row: z.number().int().min(0),
  scores: z.array(scoreSchema).max(100),
});
export const newLessonSchema = lessonSchema
  .refine((lesson) => lesson.name.trim().length > 0, "Nhập tên bài.")
  .refine(
    (lesson) =>
      new Set(lesson.scores.map((score) => score.id)).size ===
      lesson.scores.length,
    "ID mức điểm bị trùng.",
  )
  .refine(
    (lesson) =>
      lesson.scores.every(
        (score) => String(score.value).trim() && score.label.trim(),
      ),
    "Nhập đầy đủ điểm.",
  );
const manualSchema = z.object({
  name: text,
  objective: text,
  instruction: text,
  criteria: text,
  score: text,
});
const draftSchema = z.object({
  id: uuid,
  lessonId: uuid.nullable(),
  code: z.string().max(40),
  scoreId: z.union([uuid, z.literal("")]),
  notes: text,
  manual: manualSchema,
  origin: z.literal("excel").optional(),
});
const childSchema = z.object({
  id: uuid,
  studentId: uuid.optional(),
  name: shortText,
  age: shortText,
  teacher: shortText,
  manager: shortText,
  period: shortText,
  lessons: z.array(draftSchema).max(2310),
});
export const planInputSchema = z
  .object({
    schemaVersion: z.literal(1),
    id: uuid,
    title: z.string().trim().min(1).max(200),
    month: z.number().int().min(1).max(12),
    year: z.number().int().min(1900).max(9999),
    children: z.array(childSchema).min(1).max(100),
    lessons: z.array(lessonSchema).max(9700),
    expectedRevision: z.number().int().min(0),
  })
  .superRefine((plan, ctx) => {
    const snapshot = new Map(plan.lessons.map((lesson) => [lesson.id, lesson]));
    if (
      snapshot.size !== plan.lessons.length ||
      new Set(plan.children.map((child) => child.id)).size !==
        plan.children.length
    )
      ctx.addIssue({ code: "custom", message: "ID bị trùng trong giáo án." });
    const students = plan.children.flatMap(child => child.studentId ? [child.studentId] : []);
    if (new Set(students).size !== students.length) ctx.addIssue({ code: "custom", message: "Một học sinh chỉ có một tab trong kế hoạch." });
    for (const child of plan.children) {
      if (
        new Set(child.lessons.map((row) => row.id)).size !==
        child.lessons.length
      )
        ctx.addIssue({ code: "custom", message: "ID hàng bài học bị trùng." });
      for (const row of child.lessons) {
        const lesson = row.lessonId ? snapshot.get(row.lessonId) : null;
        if (
          (!row.lessonId && row.code.trim()) ||
          (row.lessonId && (!lesson || lesson.code !== row.code))
        )
          ctx.addIssue({
            code: "custom",
            message: "Bài học trong giáo án không khớp nội dung lưu.",
          });
        if (
          row.scoreId &&
          !lesson?.scores.some((score) => score.id === row.scoreId)
        )
          ctx.addIssue({
            code: "custom",
            message: "Mức điểm không thuộc bài học.",
          });
      }
    }
  });
export const planSummarySchema = z.object({
  id: uuid,
  title: z.string(),
  month: z.number(),
  year: z.number(),
  updatedAt: z.string(),
  revision: z.number().int().positive(),
  exportCount: z.number().int().nonnegative().default(0),
});
export const savedPlanSchema = z.object({
  plan: planInputSchema,
  updatedAt: z.string(),
  revision: z.number().int().positive(),
});
export const lessonListSchema = z.array(lessonSchema);
export const planListSchema = z.array(planSummarySchema);
export type PlanInput = z.infer<typeof planInputSchema>;
export type PlanSummary = z.infer<typeof planSummarySchema>;
export type SavedPlan = z.infer<typeof savedPlanSchema>;

export const userSchema = z.object({
  id: uuid,
  first_name: shortText,
  last_name: shortText,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type UserProfile = z.infer<typeof userSchema>;

export const studentInputSchema = z.object({ id: uuid, name: shortText.pipe(z.string().trim().min(1, "Nhập tên học sinh.")), age: shortText });
export const studentSchema = studentInputSchema.extend({ createdAt: z.string(), updatedAt: z.string() });
export const studentListSchema = z.array(studentSchema);
export const teacherLinkSchema = z.object({ userId: uuid });
export const exportEventSchema = z.object({ id: uuid });
export const exportCountSchema = z.object({ exportCount: z.number().int().nonnegative() });
export type Student = z.infer<typeof studentSchema>;
export type StudentInput = z.infer<typeof studentInputSchema>;

export const studentUpdateSchema = studentInputSchema.extend({ expectedUpdatedAt: z.string() });
export type StudentUpdate = z.infer<typeof studentUpdateSchema>;
