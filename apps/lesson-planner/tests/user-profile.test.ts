import { expect, it } from "vitest";
import { fullName, teacherName } from "../src/lib/user-profile";
import { userSchema } from "../src/lib/storage-schema";

it("formats the full name and uses only first_name for the teacher", () => {
  const user = userSchema.parse({ id: crypto.randomUUID(), first_name: "Lan", last_name: "Nguyễn Thị", createdAt: "2026-10-14", updatedAt: "2026-10-14" });
  expect(fullName(user)).toBe("Nguyễn Thị Lan");
  expect(teacherName(user)).toBe("Cô Lan");
  expect(fullName({ ...user, first_name: "Hoà", last_name: "" })).toBe("Hoà");
});
