import { createRequire } from "module";
import PizZip from "pizzip";
import mammoth from "mammoth";
import { objectStorageService } from "./objectStorage";

const require = createRequire(import.meta.url);
const _pdfParseModule = require("pdf-parse");
const pdfParse = typeof _pdfParseModule === "function" ? _pdfParseModule : _pdfParseModule.default;

export async function extractTextFromPDF(fileUrl: string): Promise<string> {
  try {
    const buffer = await objectStorageService.getObjectEntity(fileUrl);
    const data = await pdfParse(buffer);
    return data.text || "";
  } catch (error) {
    console.error("Error extracting text from PDF:", error);
    throw new Error("Failed to extract text from PDF file");
  }
}

function decodeXmlEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&apos;/g, "\u0027")
    .replace(/&quot;/g, "\u0022")
    .replace(/&#(\d+);/g, (_unused: string, n: string) => String.fromCharCode(Number(n)));
}

function textFromXml(xml: string): string {
  const withoutTags = xml
    .replace(/<a:t[^>]*\/>/g, " ")
    .replace(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g, "$1")
    .replace(/<[^>]+>/g, " ");
  return decodeXmlEntities(withoutTags).replace(/\s+/g, " ").trim();
}

export async function extractTextFromPPTX(fileUrl: string): Promise<string> {
  try {
    console.log("[DOCUMENT-PARSER] Fetching PPTX buffer from:", fileUrl);
    const buffer = await objectStorageService.getObjectEntity(fileUrl);
    console.log("[DOCUMENT-PARSER] Buffer size:", buffer.length, "bytes");

    const zip = new PizZip(buffer);
    const slideTexts: string[] = [];
    const slideFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith("ppt/slides/slide") && name.endsWith(".xml"),
    );

    for (const slideName of slideFiles.sort()) {
      const slideText = textFromXml(zip.files[slideName].asText());
      if (slideText) slideTexts.push(slideText);
    }

    const noteFiles = Object.keys(zip.files).filter(
      (name) => name.startsWith("ppt/notesSlides/notesSlide") && name.endsWith(".xml"),
    );
    for (const noteName of noteFiles.sort()) {
      const noteText = textFromXml(zip.files[noteName].asText());
      if (noteText) slideTexts.push(`Notes: ${noteText}`);
    }

    let finalText = slideTexts.join("\n\n");

    if (!finalText.trim()) {
      try {
        const { parseOfficeAsync } = await import("officeparser");
        const parsed = await parseOfficeAsync(buffer, { ignoreNotes: false });
        finalText = (parsed || "").trim();
      } catch (parserError) {
        console.error("[DOCUMENT-PARSER] officeparser fallback failed:", parserError);
      }
    }

    console.log("[DOCUMENT-PARSER] Final text length:", finalText.length);
    return finalText;
  } catch (error) {
    console.error("[DOCUMENT-PARSER] Error extracting text from PPTX:", error);
    throw new Error("Failed to extract text from PowerPoint file");
  }
}

export async function extractTextFromDOCX(fileUrl: string): Promise<string> {
  try {
    const buffer = await objectStorageService.getObjectEntity(fileUrl);
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  } catch (error) {
    console.error("Error extracting text from DOCX:", error);
    throw new Error("Failed to extract text from Word document");
  }
}

export async function extractTextFromDocument(fileUrl: string, fileName: string): Promise<string> {
  const extension = fileName.toLowerCase().split(".").pop();

  switch (extension) {
    case "pdf":
      return await extractTextFromPDF(fileUrl);
    case "pptx":
    case "ppt":
      return await extractTextFromPPTX(fileUrl);
    case "docx":
    case "doc":
      return await extractTextFromDOCX(fileUrl);
    default:
      throw new Error(`Unsupported file type: ${extension}`);
  }
}
