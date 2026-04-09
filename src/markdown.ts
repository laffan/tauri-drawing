/** Lightweight markdown parser for canvas text rendering.
 *  Supports: # headings (h1-h3), **bold**, *italic* / _italic_
 */

export interface TextRun {
  text: string;
  bold: boolean;
  italic: boolean;
  /** Font size multiplier relative to base (1.0 = normal) */
  sizeScale: number;
  /** If set, this run is a link */
  link?: string;
}

export interface ParsedLine {
  runs: TextRun[];
  sizeScale: number; // heading scale for the whole line
}

/**
 * Parse a single line of text into styled runs.
 */
export function parseLine(line: string): ParsedLine {
  let sizeScale = 1.0;
  let workingLine = line;

  // Check for heading prefix
  const headingMatch = workingLine.match(/^(#{1,3})\s+(.*)$/);
  if (headingMatch) {
    const level = headingMatch[1].length; // 1, 2, or 3
    sizeScale = level === 1 ? 1.8 : level === 2 ? 1.4 : 1.15;
    workingLine = headingMatch[2];
  }

  const runs = parseInlineFormatting(workingLine, sizeScale);
  return { runs, sizeScale };
}

/**
 * Parse inline **bold** and *italic* / _italic_ markers into runs.
 */
function parseInlineFormatting(text: string, sizeScale: number): TextRun[] {
  const runs: TextRun[] = [];
  // Match **bold**, *italic*, _italic_, [link text](url)
  const pattern = /(\*\*(.+?)\*\*|\*(.+?)\*|_(.+?)_|\[([^\]]+)\]\(([^)]+)\))/g;
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > lastIndex) {
      runs.push({ text: text.slice(lastIndex, match.index), bold: false, italic: false, sizeScale });
    }

    if (match[2] !== undefined) {
      runs.push({ text: match[2], bold: true, italic: false, sizeScale });
    } else if (match[3] !== undefined) {
      runs.push({ text: match[3], bold: false, italic: true, sizeScale });
    } else if (match[4] !== undefined) {
      runs.push({ text: match[4], bold: false, italic: true, sizeScale });
    } else if (match[5] !== undefined) {
      runs.push({ text: match[5], bold: false, italic: false, sizeScale, link: match[6] });
    }

    lastIndex = match.index + match[0].length;
  }

  if (lastIndex < text.length) {
    runs.push({ text: text.slice(lastIndex), bold: false, italic: false, sizeScale });
  }

  if (runs.length === 0) {
    runs.push({ text, bold: false, italic: false, sizeScale });
  }

  return runs;
}

/**
 * Parse a full multi-line text into an array of ParsedLines.
 * Handles wrapping within a width constraint using canvas measurement.
 */
export function parseText(
  text: string,
  constraintWidth?: number,
  baseFontSize?: number,
  measureFn?: (text: string, fontSize: number) => number,
): ParsedLine[] {
  const rawLines = text.split("\n");
  const result: ParsedLine[] = [];

  for (const rawLine of rawLines) {
    const parsed = parseLine(rawLine);

    if (constraintWidth && constraintWidth > 0 && baseFontSize && measureFn) {
      const fontSize = baseFontSize * parsed.sizeScale;
      const fullText = parsed.runs.map((r) => r.text).join("");

      if (measureFn(fullText, fontSize) <= constraintWidth) {
        result.push(parsed);
      } else {
        // Word-wrap using real measurement, re-parse each wrapped line
        const words = fullText.split(" ");
        let currentLine = "";
        for (const word of words) {
          const test = currentLine ? currentLine + " " + word : word;
          if (measureFn(test, fontSize) > constraintWidth && currentLine.length > 0) {
            result.push(parseLine((parsed.sizeScale > 1 ? "#".repeat(getHeadingLevel(parsed.sizeScale)) + " " : "") + currentLine));
            currentLine = word;
          } else {
            currentLine = test;
          }
        }
        if (currentLine) {
          result.push(parseLine((parsed.sizeScale > 1 ? "#".repeat(getHeadingLevel(parsed.sizeScale)) + " " : "") + currentLine));
        }
      }
    } else {
      result.push(parsed);
    }
  }

  return result;
}

function getHeadingLevel(sizeScale: number): number {
  if (sizeScale >= 1.8) return 1;
  if (sizeScale >= 1.4) return 2;
  if (sizeScale > 1) return 3;
  return 0;
}
