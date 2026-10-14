import type { D1Database } from "@cloudflare/workers-types";
import { z } from "zod";
import ids from "../src/data/catalog-ids.json";
import {
  newLessonSchema,
  lessonListSchema,
  planInputSchema,
  planListSchema,
  savedPlanSchema,
  userSchema,
  studentInputSchema,
  studentUpdateSchema,
  studentSchema,
  studentListSchema,
  teacherLinkSchema,
  exportEventSchema,
} from "../src/lib/storage-schema";

export const FIXED_USER_ID = "ed7577cc-23e2-4d71-8563-a8be606662e3";
export interface Env {
  DB?: D1Database;
  DEV_ORIGINS?: string;
  ASSETS: { fetch(request: Request): Promise<Response> };
}
const baseCodes = new Set(Object.keys(ids));
const baseIds = new Set(Object.values(ids).map((lesson) => lesson.id));
const normalizeCode = (value: string) =>
  value.normalize("NFC").toLocaleLowerCase("vi").replace(/\s/g, "");
const payloadRow = z.object({ payload: z.string() });
const storedPlanRow = payloadRow.extend({
  revision: z.number(),
  updated_at: z.string(),
});
const summaryRow = z.object({
  id: z.string(),
  title: z.string(),
  month: z.number(),
  year: z.number(),
  updated_at: z.string(),
  revision: z.number(),
  exportCount: z.number(),
});
const MAX_BODY = 1800000;
const json = (value: unknown, status = 200) =>
  Response.json(value, { status, headers: { "Cache-Control": "no-store" } });
async function readBody(request: Request): Promise<unknown> {
  if (Number(request.headers.get("Content-Length") ?? 0) > MAX_BODY)
    throw new Error("Giáo án quá lớn. Hãy chia thành các giáo án nhỏ hơn.");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("Thiếu dữ liệu.");
  const chunks: Uint8Array[] = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.byteLength;
    if (length > MAX_BODY) {
      await reader.cancel();
      throw new Error("Giáo án quá lớn. Hãy chia thành các giáo án nhỏ hơn.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.length;
  }
  return JSON.parse(new TextDecoder().decode(bytes));
}
export async function handleApi(request: Request, env: Env): Promise<Response> {
  const url = new URL(request.url),
    db = env.DB;
  const path = url.pathname.replace(/\/+$/, "");
  if (!db)
    return json(
      {
        error:
          "Chưa cấu hình database D1. Hãy gắn database với tên DB trên Cloudflare.",
      },
      503,
    );
  if (request.method !== "GET") {
    const origin = request.headers.get("Origin");
    if (
      origin &&
      ![url.origin, ...(env.DEV_ORIGINS?.split(",") ?? [])].includes(origin)
    )
      return json({ error: "Yêu cầu không hợp lệ." }, 403);
  }
  try {
    if (path === "/api/user" && request.method === "GET") {
      const row = await db
        .prepare(
          "SELECT id, first_name, last_name, created_at AS createdAt, updated_at AS updatedAt FROM users WHERE id = ?",
        )
        .bind(FIXED_USER_ID)
        .first();
      if (!row)
        return json(
          { error: "Chưa có hồ sơ người dùng. Hãy áp dụng migration users." },
          404,
        );
      return json(userSchema.parse(row));
    }
    if (path === "/api/students" && request.method === "GET") {
      const result = await db
        .prepare(
          "SELECT s.id, s.name, s.age, s.created_at AS createdAt, s.updated_at AS updatedAt FROM students s JOIN student_teachers t ON t.student_id = s.id WHERE t.user_id = ? ORDER BY s.name, s.id",
        )
        .bind(FIXED_USER_ID)
        .all();
      return json(studentListSchema.parse(result.results));
    }
    if (path === "/api/students" && request.method === "POST") {
      const student = studentInputSchema.parse(await readBody(request));
      const now = new Date().toISOString();
      if (
        await db
          .prepare("SELECT id FROM students WHERE id = ?")
          .bind(student.id)
          .first()
      )
        return json({ error: "ID học sinh đã tồn tại." }, 409);
      await db.batch([
        db
          .prepare(
            "INSERT INTO students(id,name,age,created_at,updated_at) VALUES (?,?,?,?,?)",
          )
          .bind(student.id, student.name, student.age, now, now),
        db
          .prepare(
            "INSERT INTO student_teachers(student_id,user_id,created_at) VALUES (?,?,?)",
          )
          .bind(student.id, FIXED_USER_ID, now),
      ]);
      return json(
        studentSchema.parse({ ...student, createdAt: now, updatedAt: now }),
        201,
      );
    }
    const studentMatch = /^\/api\/students\/([^/]+)$/.exec(path);
    if (studentMatch && request.method === "PUT") {
      const id = z.string().uuid().parse(studentMatch[1]);
      const student = studentUpdateSchema.parse(await readBody(request));
      if (id !== student.id) return json({ error: "ID học sinh không khớp." }, 400);
      if (!await db.prepare("SELECT 1 FROM student_teachers WHERE student_id = ? AND user_id = ?").bind(id, FIXED_USER_ID).first()) return json({ error: "Không tìm thấy học sinh của giáo viên hiện tại." }, 404);
      const now = new Date().toISOString();
      const result = await db.prepare("UPDATE students SET name = ?, age = ?, updated_at = ? WHERE id = ? AND updated_at = ?").bind(student.name,student.age,now,id,student.expectedUpdatedAt).run();
      if (result.meta.changes !== 1) return json({ error: "Hồ sơ đã được cập nhật ở nơi khác. Tải lại danh sách trước khi sửa." }, 409);
      const row = await db.prepare("SELECT id,name,age,created_at AS createdAt,updated_at AS updatedAt FROM students WHERE id = ?").bind(id).first();
      return json(studentSchema.parse(row));
    }
    const teacherMatch = /^\/api\/students\/([^/]+)\/teachers$/.exec(path);
    if (teacherMatch && request.method === "POST") {
      const id = z.string().uuid().parse(teacherMatch[1]);
      const { userId } = teacherLinkSchema.parse(await readBody(request));
      if (
        !(await db
          .prepare(
            "SELECT 1 FROM student_teachers WHERE student_id = ? AND user_id = ?",
          )
          .bind(id, FIXED_USER_ID)
          .first())
      )
        return json(
          { error: "Không tìm thấy học sinh của giáo viên hiện tại." },
          404,
        );
      if (
        !(await db
          .prepare("SELECT id FROM users WHERE id = ?")
          .bind(userId)
          .first())
      )
        return json({ error: "Không tìm thấy giáo viên." }, 404);
      await db
        .prepare(
          "INSERT OR IGNORE INTO student_teachers(student_id,user_id,created_at) VALUES (?,?,?)",
        )
        .bind(id, userId, new Date().toISOString())
        .run();
      return json({ studentId: id, userId });
    }
    const exportMatch = /^\/api\/plans\/([^/]+)\/exports$/.exec(path);
    if (exportMatch && request.method === "POST") {
      const id = z.string().uuid().parse(exportMatch[1]);
      const event = exportEventSchema.parse(await readBody(request));
      if (
        !(await db
          .prepare("SELECT id FROM plans WHERE id = ? AND user_id = ?")
          .bind(id, FIXED_USER_ID)
          .first())
      )
        return json({ error: "Không tìm thấy giáo án." }, 404);
      const existing = await db
        .prepare("SELECT plan_id,user_id FROM plan_exports WHERE id = ?")
        .bind(event.id)
        .first<{ plan_id: string; user_id: string }>();
      if (
        existing &&
        (existing.plan_id !== id || existing.user_id !== FIXED_USER_ID)
      )
        return json({ error: "ID lượt xuất đã được sử dụng." }, 409);
      await db
        .prepare(
          "INSERT OR IGNORE INTO plan_exports(id,plan_id,user_id,exported_at) VALUES (?,?,?,?)",
        )
        .bind(event.id, id, FIXED_USER_ID, new Date().toISOString())
        .run();
      const count = await db
        .prepare(
          "SELECT COUNT(*) AS exportCount FROM plan_exports WHERE plan_id = ?",
        )
        .bind(id)
        .first();
      return json(count);
    }
    if (path === "/api/lessons" && request.method === "GET") {
      const result = await db
        .prepare(
          "SELECT payload FROM lessons WHERE user_id = ? ORDER BY created_at, id",
        )
        .bind(FIXED_USER_ID)
        .all();
      return json(
        lessonListSchema.parse(
          result.results.map((row) =>
            JSON.parse(payloadRow.parse(row).payload),
          ),
        ),
      );
    }
    if (path === "/api/lessons" && request.method === "POST") {
      const lesson = newLessonSchema.parse(await readBody(request)),
        key = normalizeCode(lesson.code);
      if (baseCodes.has(key) || baseIds.has(lesson.id))
        return json({ error: "Mã bài đã có trong danh mục gốc." }, 409);
      const now = new Date().toISOString();
      try {
        await db
          .prepare(
            "INSERT INTO lessons(id, user_id, code_key, payload, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)",
          )
          .bind(lesson.id, FIXED_USER_ID, key, JSON.stringify(lesson), now, now)
          .run();
      } catch (error) {
        if (error instanceof Error && /UNIQUE constraint/i.test(error.message))
          return json({ error: "Mã bài hoặc ID đã tồn tại." }, 409);
        throw error;
      }
      return json(lesson, 201);
    }
    if (path === "/api/plans" && request.method === "GET") {
      const result = await db
        .prepare(
          "SELECT id, title, month, year, updated_at, revision, (SELECT COUNT(*) FROM plan_exports e WHERE e.plan_id = plans.id) AS exportCount FROM plans WHERE user_id = ? ORDER BY updated_at DESC",
        )
        .bind(FIXED_USER_ID)
        .all();
      return json(
        planListSchema.parse(
          result.results.map((row) => {
            const value = summaryRow.parse(row);
            return { ...value, updatedAt: value.updated_at };
          }),
        ),
      );
    }
    const match = /^\/api\/plans\/([^/]+)$/.exec(path);
    if (match) {
      const id = z.string().uuid().parse(match[1]);
      if (request.method === "GET") {
        const row = await db
          .prepare(
            "SELECT payload, revision, updated_at FROM plans WHERE id = ? AND user_id = ?",
          )
          .bind(id, FIXED_USER_ID)
          .first();
        if (!row) return json({ error: "Không tìm thấy giáo án." }, 404);
        const value = storedPlanRow.parse(row);
        return json(
          savedPlanSchema.parse({
            plan: JSON.parse(value.payload),
            updatedAt: value.updated_at,
            revision: value.revision,
          }),
        );
      }
      if (request.method === "PUT") {
        const plan = planInputSchema.parse(await readBody(request));
        if (plan.id !== id)
          return json({ error: "ID giáo án không khớp." }, 400);
        for (const child of plan.children) {
          if (
            child.studentId &&
            !(await db
              .prepare(
                "SELECT 1 FROM student_teachers WHERE student_id = ? AND user_id = ?",
              )
              .bind(child.studentId, FIXED_USER_ID)
              .first())
          )
            return json(
              {
                error: "Học sinh không thuộc danh sách của giáo viên hiện tại.",
              },
              403,
            );
        }
        const now = new Date().toISOString(),
          revision = plan.expectedRevision + 1;
        const saved = { ...plan, expectedRevision: revision };
        const payload = JSON.stringify(saved);
        if (new TextEncoder().encode(payload).length > MAX_BODY)
          return json({ error: "Giáo án quá lớn." }, 413);
        if (plan.expectedRevision === 0) {
          try {
            await db
              .prepare(
                "INSERT INTO plans(id, user_id, title, month, year, payload, revision, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)",
              )
              .bind(
                id,
                FIXED_USER_ID,
                plan.title,
                plan.month,
                plan.year,
                payload,
                now,
                now,
              )
              .run();
          } catch (error) {
            if (
              error instanceof Error &&
              /UNIQUE constraint/i.test(error.message)
            )
              return json(
                { error: "Giáo án đã tồn tại. Mở lại trước khi lưu." },
                409,
              );
            throw error;
          }
        } else {
          const result = await db
            .prepare(
              "UPDATE plans SET title = ?, month = ?, year = ?, payload = ?, revision = ?, updated_at = ? WHERE id = ? AND user_id = ? AND revision = ?",
            )
            .bind(
              plan.title,
              plan.month,
              plan.year,
              payload,
              revision,
              now,
              id,
              FIXED_USER_ID,
              plan.expectedRevision,
            )
            .run();
          if (result.meta.changes !== 1)
            return json(
              {
                error:
                  "Giáo án đã được cập nhật ở nơi khác. Mở lại trước khi lưu.",
              },
              409,
            );
        }
        return json({ plan: saved, revision, updatedAt: now });
      }
    }
    return json({ error: "Không tìm thấy chức năng." }, 404);
  } catch (error) {
    if (error instanceof z.ZodError)
      return json(
        { error: error.issues[0]?.message ?? "Dữ liệu không hợp lệ." },
        400,
      );
    if (error instanceof SyntaxError)
      return json({ error: "Dữ liệu JSON không hợp lệ." }, 400);
    if (error instanceof Error && /quá lớn|Thiếu dữ liệu/.test(error.message))
      return json({ error: error.message }, 413);
    console.error("Storage request failed", {
      path: url.pathname,
      method: request.method,
      error: error instanceof Error ? error.message : "Unknown",
    });
    return json({ error: "Không lưu/đọc được dữ liệu. Hãy thử lại." }, 500);
  }
}
