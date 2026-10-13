import { strToU8 } from "fflate";
import data from "@/data/lesson-template.json";
import { normalize } from "./workbook";
import type { Lesson, Template } from "./workbook";

type TemplateData = Pick<Template, "sheetPath" | "sheetXml" | "slots" | "warnings" | "defaults" | "center" | "reference"> & {
  version: number;
  name: string;
  lessons: Lesson[];
  values: Record<string, string | number | boolean>;
  parts: Record<string, string>;
  assets: Record<string, string>;
};

const bundled = data satisfies TemplateData;
export const templateName = bundled.name;

/** Hydrate the versioned repository data without reading an Excel template. */
export function bundledTemplate(): Template {
  return {
    sheetPath: bundled.sheetPath,
    sheetXml: bundled.sheetXml,
    slots: bundled.slots,
    warnings: bundled.warnings,
    defaults: bundled.defaults,
    center: bundled.center,
    reference: bundled.reference,
    lessons: new Map(bundled.lessons.map(lesson => [normalize(lesson.code), lesson])),
    values: new Map(Object.entries(bundled.values)),
    parts: new Map(Object.entries(bundled.parts).map(([path, xml]) => [path, strToU8(xml)])),
    assets: new Map(Object.entries(bundled.assets).map(([path, base64]) => [path, Uint8Array.from(atob(base64), character => character.charCodeAt(0))])),
  };
}
