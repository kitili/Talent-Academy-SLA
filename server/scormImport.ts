import PizZip from "pizzip";
import { sanitizeLessonHtml } from "./htmlSanitize";

function readText(zip: PizZip, path: string) {
  const file = zip.file(path) || zip.file(path.replace(/^\//, ""));
  if (!file) return "";
  return file.asText();
}

function firstHtmlPath(zip: PizZip) {
  const names = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  const manifest = readText(zip, "imsmanifest.xml") || names.find((n) => n.endsWith("imsmanifest.xml"));
  if (typeof manifest === "string" && manifest.includes("href=")) {
    const href = manifest.match(/href=["']([^"']+\.html?)["']/i);
    if (href?.[1]) return href[1].replace(/^\.\//, "");
  }
  return names.find((n) => /(^|\/)index\.html?$/i.test(n))
    || names.find((n) => n.toLowerCase().endsWith(".html"));
}

export function lessonFromPackage(buffer: Buffer, fileName: string) {
  const zip = new PizZip(buffer);
  const htmlPath = firstHtmlPath(zip);
  if (!htmlPath) {
    throw new Error("This package has no HTML launch file (index.html or imsmanifest href).");
  }
  const html = readText(zip, htmlPath);
  if (!html.trim()) throw new Error("The package HTML file is empty.");
  return {
    fileName: fileName.replace(/\.zip$/i, "") || htmlPath,
    lessonHtml: sanitizeLessonHtml(html),
    fileSize: buffer.length,
  };
}
