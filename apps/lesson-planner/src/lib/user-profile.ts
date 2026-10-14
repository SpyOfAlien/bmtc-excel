import type { UserProfile } from "./storage-schema";

export const fullName = (user: UserProfile) =>
  [user.last_name, user.first_name].filter(Boolean).join(" ");
export const teacherName = (user: UserProfile) =>
  `Cô ${user.first_name.trim()}`.trim();
