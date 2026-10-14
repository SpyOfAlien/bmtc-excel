// @vitest-environment node
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "@cloudflare/workers-types";
import { handleApi, FIXED_USER_ID } from "../worker/storage-api";
import type { Env } from "../worker/storage-api";
import { lessonSchema, planListSchema, savedPlanSchema, userSchema, studentSchema, studentListSchema, exportCountSchema } from "../src/lib/storage-schema";
import type { PlanInput } from "../src/lib/storage-schema";

const legacyOwner = crypto.randomUUID(), legacyLesson = crypto.randomUUID();
let env: Env, dispose = async () => {};
beforeAll(async () => {
  const proxy = await getPlatformProxy<{ DB: D1Database }>({ configPath: "wrangler.local.jsonc", persist: false });
  dispose = proxy.dispose;
  env = { DB: proxy.env.DB, ASSETS: { fetch: async () => new Response("static") } };
  await proxy.env.DB.exec(readFileSync("migrations/0001_lessons_and_plans.sql", "utf8").replace(/\n/g, " "));
  await proxy.env.DB.exec(readFileSync("migrations/0002_users.sql", "utf8").replace(/\n/g, " "));
  await proxy.env.DB.prepare("INSERT INTO lessons (id,user_id,code_key,payload,created_at,updated_at) VALUES (?,?,?,'{}','2026-10-14','2026-10-14')").bind(legacyLesson, legacyOwner, "OTHER").run();
  const usersMigration = readFileSync("migrations/0002_users.sql", "utf8").replace(/\n/g, " ");
  await proxy.env.DB.exec(usersMigration);
  await proxy.env.DB.exec(usersMigration);
  await proxy.env.DB.prepare("UPDATE users SET display_name = 'Nguyễn Thị Lan' WHERE id = ?").bind(legacyOwner).run();
  await proxy.env.DB.exec(readFileSync("migrations/0003_user_names.sql", "utf8").replace(/\n/g, " "));
  await proxy.env.DB.prepare("INSERT INTO plans(id,user_id,title,month,year,payload,revision,created_at,updated_at) VALUES (?,?,?,10,2026,?,1,'2026-10-14','2026-10-14')").bind(crypto.randomUUID(), FIXED_USER_ID, "Kế hoạch cũ", JSON.stringify({ ...plan, expectedRevision: 1 })).run();
  await proxy.env.DB.exec(readFileSync("migrations/0004_students_and_exports.sql", "utf8").replace(/\n/g, " "));
}, 30000);
afterAll(async () => { await dispose(); });
const call = (path: string, method = "GET", data?: unknown) => handleApi(new Request(`https://planner.test/api/${path}`, { method, ...(data === undefined ? {} : { body: JSON.stringify(data), headers: { "Content-Type": "application/json" } }) }), env);
const lesson = { id: crypto.randomUUID(), code: "M001", name: "Bài mẫu", objective: "Mục tiêu", instruction: "Hướng dẫn", criteria: "", row: 0, scores: [{ id: crypto.randomUUID(), label: "2", source: "2", value: "2", criteria: "Tiêu chí 2", row: 0, dateLike: false }] };
const plan: PlanInput = { schemaVersion: 1, id: crypto.randomUUID(), title: "Giáo án lưu", month: 10, year: 2026, expectedRevision: 0, lessons: [lesson], children: [{ id: crypto.randomUUID(), name: "Bé A", age: "", teacher: "Cô Hoà", manager: "", period: "Tháng 10", lessons: [{ id: crypto.randomUUID(), lessonId: lesson.id, code: lesson.code, scoreId: lesson.scores[0]?.id ?? "", notes: "Ghi chú có dấu: trẻ tiến bộ", manual: { name: "", objective: "", instruction: "", criteria: "", score: "" } }] }] };

describe("D1 storage", () => {
  it("returns the fixed user profile", async () => {
    const response = await call("user");
    expect(response.status).toBe(200);
    const user = userSchema.parse(await response.json());
    expect(user.id).toBe(FIXED_USER_ID);
    expect(user.first_name).toBe("Hoà");
    expect(user.last_name).toBe("");
  });
  it("migrates user names and preserves existing owners and data", async () => {
    expect(await env.DB?.prepare("SELECT first_name, last_name FROM users WHERE id = ?").bind(legacyOwner).first()).toEqual({ first_name: "Lan", last_name: "Nguyễn Thị" });
    expect(await env.DB?.prepare("SELECT user_id FROM lessons WHERE id = ?").bind(legacyLesson).first()).toEqual({ user_id: legacyOwner });
    const columns = await env.DB?.prepare("PRAGMA table_info(users)").all<{ name: string }>();
    expect(columns?.results.map(column => column.name)).not.toContain("display_name");
  });
  it("adds a lesson and rejects code collisions including reserved JSON codes", async () => {
    expect((await call("lessons", "POST", lesson)).status).toBe(201);
    expect((await call("lessons", "POST", { ...lesson, id: crypto.randomUUID(), code: " m 0 0 1 " })).status).toBe(409);
    expect((await call("lessons", "POST", { ...lesson, id: crypto.randomUUID(), code: "A1" })).status).toBe(409);
    const response = await call("lessons");
    const rows: unknown = await response.json();
    expect(lessonSchema.array().parse(rows)).toEqual([lesson]);
    const stored = await env.DB?.prepare("SELECT user_id FROM lessons WHERE id = ?").bind(lesson.id).first<{ user_id: string }>();
    expect(stored?.user_id).toBe(FIXED_USER_ID);
  });
  it("saves, opens and updates a complete snapshot without losing notes", async () => {
    const first = await call(`plans/${plan.id}`, "PUT", plan);
    expect(first.status).toBe(200);
    const saved = savedPlanSchema.parse(await first.json());
    expect(saved.revision).toBe(1);
    const response = await call(`plans/${plan.id}`);
    expect(savedPlanSchema.parse(await response.json()).plan.children).toEqual(plan.children);
    const child = saved.plan.children[0], row = child?.lessons[0];
    if (!row) throw new Error("Missing stored row");
    row.notes = "Đã sửa sau khi mở lại";
    const updated = await call(`plans/${plan.id}`, "PUT", saved.plan);
    expect(savedPlanSchema.parse(await updated.json()).revision).toBe(2);
    expect((await call(`plans/${plan.id}`, "PUT", saved.plan)).status).toBe(409);
    const library = planListSchema.parse(await (await call("plans")).json());
    expect(library.find(item => item.id === plan.id)?.title).toBe(plan.title);
  });
  it("allows incomplete drafts, rejects invalid UUIDs and handles missing database clearly", async () => {
    const unfinished: PlanInput = { ...plan, id: crypto.randomUUID(), children: [], expectedRevision: 0 };
    expect((await call(`plans/${unfinished.id}`, "PUT", unfinished)).status).toBe(400);
    const child = plan.children[0]; if (!child) throw new Error("Missing child");
    unfinished.children.push({ ...child, name: "", lessons: [] });
    expect((await call(`plans/${unfinished.id}`, "PUT", unfinished)).status).toBe(200);
    expect((await call("plans/not-a-uuid")).status).toBe(400);
    expect((await call("lessons", "POST", { ...lesson, id: "M002" })).status).toBe(400);
    expect((await handleApi(new Request("https://planner.test/api/lessons"), { ASSETS: env.ASSETS })).status).toBe(503);
  });
  it("rejects cross-site writes and missing plans", async () => {
    expect((await handleApi(new Request("https://planner.test/api/lessons", { method: "POST", headers: { Origin: "https://other.test" }, body: "{}" }), env)).status).toBe(403);
    expect((await call(`plans/${crypto.randomUUID()}`)).status).toBe(404);
  });
  it("backfills named students and supports multiple teachers without exposing unrelated students", async () => {
    const old = studentListSchema.parse(await (await call("students")).json());
    expect(old.some(student => student.name === "Bé A")).toBe(true);
    const response = await call("students", "POST", { id: crypto.randomUUID(), name: "Bé dùng chung", age: "5 tuổi" });
    expect(response.status).toBe(201);
    const student = studentSchema.parse(await response.json());
    expect((await call(`students/${student.id}/teachers`, "POST", { userId: legacyOwner })).status).toBe(200);
    expect((await call(`students/${student.id}/teachers`, "POST", { userId: legacyOwner })).status).toBe(200);
    expect((await env.DB?.prepare("SELECT user_id FROM student_teachers WHERE student_id = ?").bind(student.id).all())?.results).toHaveLength(2);
    expect((await call("students", "POST", { id: student.id, name: "Other", age: "" })).status).toBe(409);
    const foreignId = crypto.randomUUID();
    await env.DB?.batch([
      env.DB.prepare("INSERT INTO students(id,name,age,created_at,updated_at) VALUES (?,'Không thuộc Cô Hoà','','2026-10-14','2026-10-14')").bind(foreignId),
      env.DB.prepare("INSERT INTO student_teachers(student_id,user_id,created_at) VALUES (?,?,'2026-10-14')").bind(foreignId, legacyOwner),
    ]);
    expect(studentListSchema.parse(await (await call("students")).json()).some(item => item.id === foreignId)).toBe(false);
    expect((await call(`students/${foreignId}/teachers`, "POST", { userId: FIXED_USER_ID })).status).toBe(404);
    const child = plan.children[0]; if (!child) throw new Error("Missing child");
    const selectedPlan = { ...plan, id: crypto.randomUUID(), children: [{ ...child, studentId: student.id }] };
    expect((await call(`plans/${selectedPlan.id}`, "PUT", selectedPlan)).status).toBe(200);
    const foreignPlan = { ...selectedPlan, id: crypto.randomUUID(), children: [{ ...child, studentId: foreignId }] };
    expect((await call(`plans/${foreignPlan.id}`, "PUT", foreignPlan)).status).toBe(403);
  });
  it("counts export events once, persists counts, and keeps the plan revision unchanged", async () => {
    const before = savedPlanSchema.parse(await (await call(`plans/${plan.id}`)).json());
    const event = { id: crypto.randomUUID() };
    const repeated = await Promise.all([call(`plans/${plan.id}/exports`, "POST", event), call(`plans/${plan.id}/exports`, "POST", event)]);
    expect(repeated.every(response => response.status === 200)).toBe(true);
    expect(exportCountSchema.parse(await (await call(`plans/${plan.id}/exports`, "POST", event)).json()).exportCount).toBe(1);
    expect(exportCountSchema.parse(await (await call(`plans/${plan.id}/exports`, "POST", { id: crypto.randomUUID() })).json()).exportCount).toBe(2);
    expect(planListSchema.parse(await (await call("plans")).json()).find(item => item.id === plan.id)?.exportCount).toBe(2);
    const after = savedPlanSchema.parse(await (await call(`plans/${plan.id}`)).json());
    expect(after.revision).toBe(before.revision);
    expect(after.updatedAt).toBe(before.updatedAt);
    expect((await call(`plans/${crypto.randomUUID()}/exports`, "POST", { id: crypto.randomUUID() })).status).toBe(404);
  });

  it("updates shared student profiles, rejects stale changes and preserves plan snapshots", async () => {
    const response = await call("students", "POST", { id: crypto.randomUUID(), name: "Bé chỉnh sửa", age: "5 tuổi" });
    const student = studentSchema.parse(await response.json());
    const child = plan.children[0]; if (!child) throw new Error("Missing child");
    const snapshot = { ...plan, id: crypto.randomUUID(), children: [{ ...child, studentId: student.id, name: student.name, age: student.age }] };
    expect((await call(`plans/${snapshot.id}`, "PUT", snapshot)).status).toBe(200);
    const change = { id: student.id, name: "Bé đã cập nhật", age: "6 tuổi", expectedUpdatedAt: student.updatedAt };
    const updated = await call(`students/${student.id}`, "PUT", change);
    expect(updated.status).toBe(200);
    expect(studentSchema.parse(await updated.json()).age).toBe("6 tuổi");
    expect((await call(`students/${student.id}`, "PUT", change)).status).toBe(409);
    expect(savedPlanSchema.parse(await (await call(`plans/${snapshot.id}`)).json()).plan.children[0]?.name).toBe("Bé chỉnh sửa");
    const foreign = crypto.randomUUID();
    await env.DB?.batch([
      env.DB.prepare("INSERT INTO students(id,name,age,created_at,updated_at) VALUES (?,'Khác','','2026-10-14','2026-10-14')").bind(foreign),
      env.DB.prepare("INSERT INTO student_teachers(student_id,user_id,created_at) VALUES (?,?,'2026-10-14')").bind(foreign, legacyOwner),
    ]);
    expect((await call(`students/${foreign}`, "PUT", { ...change, id: foreign })).status).toBe(404);
  });

});
