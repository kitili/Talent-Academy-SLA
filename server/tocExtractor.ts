import type { TocEntry } from '@shared/schema';
import { createRequire } from 'module';
import PizZip from 'pizzip';

const require = createRequire(import.meta.url);
const _pdfParseModule = require('pdf-parse');
const pdfParse = typeof _pdfParseModule === 'function' ? _pdfParseModule : _pdfParseModule.default;
const officeParser = require('officeparser');

/**
 * Extract Table of Contents from uploaded files
 * Supports PDF and PPTX formats
 */

interface PageContent {
  pageNumber: number;
  text: string;
}

/**
 * Extract heading from text with improved heuristics
 * Filters out body text, bullet points, and focuses on title-like content
 */
function extractHeadingFromText(text: string, pageNumber: number): string {
  if (!text || text.trim().length === 0) {
    return `Page ${pageNumber}`;
  }

  // Split into lines and filter
  const lines = text.split('\n')
    .map(line => line.trim())
    .filter(line => line.length > 0);
  
  if (lines.length === 0) {
    return `Page ${pageNumber}`;
  }

  // Filter out lines that are likely body text or bullet points
  const titleCandidates = lines.filter(line => {
    // Exclude bullet points (common formats)
    if (/^[\u2022\u2023\u25E6\u2043\u2219•·○●■□▪▫-]\s/.test(line)) {
      return false;
    }
    
    // Exclude numbered lists
    if (/^\d+[\.)]\s/.test(line)) {
      return false;
    }
    
    // Exclude very long lines (likely body text)
    // Titles are usually concise
    if (line.length > 100) {
      return false;
    }
    
    // Exclude lines that look like sentences (ending with period, comma, etc.)
    // unless they're short enough to be a title
    if (line.length > 50 && /[.,;:]$/.test(line)) {
      return false;
    }
    
    return true;
  });

  // Use the first valid title candidate, or fall back to first line
  let heading = titleCandidates.length > 0 ? titleCandidates[0] : lines[0];

  // Truncate if too long (max 80 characters for better readability)
  if (heading.length > 80) {
    heading = heading.substring(0, 77) + '...';
  }

  return heading;
}

/**
 * Extract ToC from PDF file
 * Uses improved heuristics to identify page headers/titles
 */
async function extractPdfToc(buffer: Buffer): Promise<TocEntry[]> {
  try {
    const pdfData = await pdfParse(buffer);
    const totalPages = pdfData.numpages;
    
    const toc: TocEntry[] = [];
    
    // Split text by form feed character which typically indicates page breaks
    const pageTexts = pdfData.text.split('\f');
    
    for (let i = 0; i < Math.min(pageTexts.length, totalPages); i++) {
      const pageText = pageTexts[i]?.trim() || '';
      const heading = extractHeadingFromText(pageText, i + 1);
      
      toc.push({
        pageNumber: i + 1,
        heading: heading,
      });
    }

    // If we didn't get enough pages from the split, fill in the rest
    for (let i = pageTexts.length; i < totalPages; i++) {
      toc.push({
        pageNumber: i + 1,
        heading: `Page ${i + 1}`,
      });
    }

    return toc;
  } catch (error) {
    console.error('Error extracting PDF ToC:', error);
    // Return a basic ToC on error
    return [{
      pageNumber: 1,
      heading: 'Content',
    }];
  }
}

/**
 * Extract title text from a PPTX slide XML
 * Looks specifically for title placeholder shapes
 */
function extractTitleFromSlideXml(slideXml: string): string | null {
  try {
    // Look for title placeholder types in the XML
    // Title shapes have <p:ph type="title"> or <p:ph type="ctrTitle">
    const titleRegex = /<p:sp>[\s\S]*?<p:ph[^>]*type="(?:title|ctrTitle)"[\s\S]*?<\/p:sp>/;
    const titleShapeMatch = slideXml.match(titleRegex);
    
    if (titleShapeMatch) {
      const titleShape = titleShapeMatch[0];
      // Extract all text elements within this shape
      const textMatches = titleShape.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
      const titleText = textMatches
        .map(match => match.replace(/<\/?a:t[^>]*>/g, ''))
        .join(' ')
        .trim();
      
      if (titleText) {
        return titleText;
      }
    }
    
    // Fallback: try to find any text in the first shape (sometimes titles don't have proper placeholders)
    const firstShapeRegex = /<p:sp>[\s\S]*?<\/p:sp>/;
    const firstShapeMatch = slideXml.match(firstShapeRegex);
    
    if (firstShapeMatch) {
      const firstShape = firstShapeMatch[0];
      const textMatches = firstShape.match(/<a:t[^>]*>(.*?)<\/a:t>/g) || [];
      const text = textMatches
        .map(match => match.replace(/<\/?a:t[^>]*>/g, ''))
        .join(' ')
        .trim();
      
      if (text && text.length <= 100) {
        return text;
      }
    }
    
    return null;
  } catch (error) {
    console.error('Error extracting title from slide XML:', error);
    return null;
  }
}

/**
 * Extract ToC from PPTX file
 * Parses the PPTX structure to extract only slide titles
 */
async function extractPptxToc(buffer: Buffer): Promise<TocEntry[]> {
  try {
    const zip = new PizZip(buffer);
    const toc: TocEntry[] = [];
    
    // Get all slide files, sorted numerically
    const slideFiles = Object.keys(zip.files)
      .filter(name => name.startsWith('ppt/slides/slide') && name.endsWith('.xml'))
      .sort((a, b) => {
        const numA = parseInt(a.match(/slide(\d+)\.xml/)?.[1] || '0');
        const numB = parseInt(b.match(/slide(\d+)\.xml/)?.[1] || '0');
        return numA - numB;
      });
    
    console.log(`[TOC PPTX] Found ${slideFiles.length} slides`);
    
    for (let i = 0; i < slideFiles.length; i++) {
      const slideFile = slideFiles[i];
      const slideXml = zip.files[slideFile].asText();
      
      // Extract title from this slide
      const title = extractTitleFromSlideXml(slideXml);
      
      let heading: string;
      if (title && title.trim().length > 0) {
        heading = title.length > 80 ? title.substring(0, 77) + '...' : title;
      } else {
        heading = `Slide ${i + 1}`;
      }
      
      toc.push({
        pageNumber: i + 1,
        heading: heading,
      });
    }
    
    // Ensure we have at least one entry
    if (toc.length === 0) {
      return [{
        pageNumber: 1,
        heading: 'Slide 1',
      }];
    }
    
    console.log(`[TOC PPTX] Extracted ${toc.length} ToC entries`);
    return toc;
  } catch (error) {
    console.error('Error extracting PPTX ToC:', error);
    // Return a basic ToC on error
    return [{
      pageNumber: 1,
      heading: 'Slide 1',
    }];
  }
}

/**
 * Extract ToC from PPT (older PowerPoint format)
 * Uses officeparser with improved heading extraction
 */
async function extractPptToc(buffer: Buffer): Promise<TocEntry[]> {
  try {
    const text = await officeParser.parseOfficeAsync(buffer);

    // Split by common slide separators
    const slideTexts = text.split(/\n{3,}|\f/).filter((s: string) => s.trim().length > 0);
    
    const toc: TocEntry[] = slideTexts.map((slideText: string, index: number) => ({
      pageNumber: index + 1,
      heading: extractHeadingFromText(slideText, index + 1),
    }));

    if (toc.length === 0) {
      return [{
        pageNumber: 1,
        heading: 'Slide 1',
      }];
    }

    return toc;
  } catch (error) {
    console.error('Error extracting PPT ToC:', error);
    return [{
      pageNumber: 1,
      heading: 'Slide 1',
    }];
  }
}

/**
 * Main function to extract ToC from any supported file type
 */
export async function extractTableOfContents(
  buffer: Buffer,
  fileName: string
): Promise<TocEntry[]> {
  const ext = fileName.toLowerCase().split('.').pop();

  try {
    switch (ext) {
      case 'pdf':
        return await extractPdfToc(buffer);
      case 'pptx':
        return await extractPptxToc(buffer);
      case 'ppt':
        return await extractPptToc(buffer);
      default:
        console.warn(`Unsupported file type for ToC extraction: ${ext}`);
        return [{
          pageNumber: 1,
          heading: fileName,
        }];
    }
  } catch (error) {
    console.error(`Error extracting ToC from ${fileName}:`, error);
    return [{
      pageNumber: 1,
      heading: fileName,
    }];
  }
}
