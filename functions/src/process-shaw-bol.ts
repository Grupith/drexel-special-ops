// functions/src/process-shaw-bol.ts
import * as functions from "firebase-functions/v2";
import * as admin from "firebase-admin";
import { ImageAnnotatorClient } from "@google-cloud/vision";
import sharp from "sharp";
import * as path from "path";
import * as os from "os";
import * as fs from "fs/promises";

// Firebase Admin is initialized once in functions/index.js
const db = admin.firestore();
const vision = new ImageAnnotatorClient();

type Vertex = { x?: number | null; y?: number | null };

interface OcrWord {
  text: string;
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerX: number;
  centerY: number;
}

interface OcrLine {
  text: string;
  words: OcrWord[];
  minX: number;
  maxX: number;
  minY: number;
  maxY: number;
  centerY: number;
}

interface Row {
  index: number;
  minY: number;
  maxY: number;
  po: string;
  anchorY: number;
  sourceText: string;
}

// ==================== CONFIG ====================
const SPLIT_PATH_REGEX = /^splits\/([^/]+)\/original\/([^/]+)\.([^.]+)$/i;
const SUPPORTED_IMAGE_EXTENSIONS = new Set(["jpg", "jpeg", "png"]);
const SUPPORTED_PDF_EXTENSIONS = new Set(["pdf"]);
const PROCESS_SHAW_BOL_VERSION = "table-border-v6-bottom-border";

const CONFIG = {
  memory: "2GiB" as const,
  rowMergeTolerance: 12,
  defaultHeaderHeight: 950,
  jpegQuality: 92,
  stampHeight: 118,
  stampLeftPadding: 42,
  stampFirstLineY: 46,
  stampSecondLineY: 90,
  stampFontSize: 36,
  uploadProgressMaxPercent: 95,
  landscapeRotationDegrees: 90,
  pdfRenderScale: 2.5,
  stampTimeZone: "America/Chicago",

  // ==================== HEADER ====================
  headerBottomTrim: 4,
  headerLineSearchAbove: 22,
  headerLineSearchBelow: 18,
  headerLineMinDarkRatio: 0.28,
  headerLineBottomTrim: 1,
  tableHeaderKeywordYTolerance: 35,

  // Body / table border detection
  minBodyStartGapBelowHeader: 0,
  tableBorderSearchStartGap: -12,
  tableBorderMinDarkRatio: 0.32,
  tableBorderDarkPixelThreshold: 95,
  firstTableBorderFallbackPadding: 2,
  minRowBoxHeight: 45,
  maxRowBoxHeight: 420,
  rowBorderPadding: 2,
  bottomBorderExtraPadding: 4,
  outputHeaderBodyGap: 3,
  nextRowSafetyGap: 0,
  rowLineYMargin: 10,
  rowOrderMatchXMax: 520,

  // Group cropping
  groupTopPadding: 0,
  groupBottomPadding: 0,
};
// ===============================================

function clampExtractArea(
  imageWidth: number,
  imageHeight: number,
  top: number,
  height: number,
): { left: number; top: number; width: number; height: number } {
  const safeTop = Math.max(0, Math.min(imageHeight - 1, Math.floor(top)));
  const maxHeight = imageHeight - safeTop;
  const safeHeight = Math.max(1, Math.min(maxHeight, Math.floor(height)));

  return {
    left: 0,
    top: safeTop,
    width: imageWidth,
    height: safeHeight,
  };
}

function getBounds(vertices: Vertex[] = []) {
  const validVertices = vertices.filter(
    (v): v is { x: number; y: number } =>
      typeof v.x === "number" && typeof v.y === "number",
  );

  if (validVertices.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0, centerX: 0, centerY: 0 };
  }

  const xs = validVertices.map((v) => v.x);
  const ys = validVertices.map((v) => v.y);

  return {
    minX: Math.min(...xs),
    maxX: Math.max(...xs),
    minY: Math.min(...ys),
    maxY: Math.max(...ys),
    centerX: (Math.min(...xs) + Math.max(...xs)) / 2,
    centerY: (Math.min(...ys) + Math.max(...ys)) / 2,
  };
}

function normalizeText(text: string): string {
  return text.replace(/\s+/g, " ").trim();
}

function normalizePoNumber(poNumber: string): string {
  return poNumber.trim().toUpperCase();
}

function isStampEnabled(value: unknown): boolean {
  return value === true || value === "true" || value === 1;
}

function escapeSvgText(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function getOrdinalSuffix(day: number): string {
  const lastTwoDigits = day % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 13) return "th";

  switch (day % 10) {
    case 1:
      return "st";
    case 2:
      return "nd";
    case 3:
      return "rd";
    default:
      return "th";
  }
}

function formatStampDate(date: Date): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
    timeZone: CONFIG.stampTimeZone,
  }).formatToParts(date);

  const month = parts.find((part) => part.type === "month")?.value ?? "";
  const day = Number(parts.find((part) => part.type === "day")?.value ?? 0);
  const year = parts.find((part) => part.type === "year")?.value ?? "";

  return `${month} ${day}${getOrdinalSuffix(day)}, ${year}`;
}

function buildStorageDownloadUrl(bucketName: string, filePath: string): string {
  return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
}

function buildStatusPatch(
  status: string,
  patch: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    status,
    updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    ...patch,
  };
}

function getUploadProgressPercent(completed: number, total: number): number {
  if (total <= 0) return 80;
  const boundedCompleted = Math.min(Math.max(completed, 0), total);
  const ratio = boundedCompleted / total;
  return Math.round(80 + ratio * (CONFIG.uploadProgressMaxPercent - 80));
}

function buildWordsFromVisionPage(page: any): OcrWord[] {
  const words: OcrWord[] = [];
  for (const block of page.blocks ?? []) {
    for (const para of block.paragraphs ?? []) {
      for (const word of para.words ?? []) {
        const text = normalizeText(
          (word.symbols ?? []).map((s: any) => s.text ?? "").join(""),
        );
        if (!text) continue;
        const bounds = getBounds(word.boundingBox?.vertices ?? []);
        words.push({ text, ...bounds });
      }
    }
  }
  return words.sort((a, b) => a.centerY - b.centerY || a.minX - b.minX);
}

function groupWordsIntoLines(words: OcrWord[]): OcrLine[] {
  const sortedWords = [...words].sort(
    (a, b) => a.centerY - b.centerY || a.minX - b.minX,
  );
  const lines: OcrLine[] = [];

  for (const word of sortedWords) {
    const lastLine = lines[lines.length - 1];
    if (
      lastLine &&
      Math.abs(lastLine.centerY - word.centerY) <= CONFIG.rowMergeTolerance
    ) {
      lastLine.words.push(word);
      lastLine.minX = Math.min(lastLine.minX, word.minX);
      lastLine.maxX = Math.max(lastLine.maxX, word.maxX);
      lastLine.minY = Math.min(lastLine.minY, word.minY);
      lastLine.maxY = Math.max(lastLine.maxY, word.maxY);
      lastLine.centerY = (lastLine.minY + lastLine.maxY) / 2;
      continue;
    }

    lines.push({
      text: "",
      words: [word],
      minX: word.minX,
      maxX: word.maxX,
      minY: word.minY,
      maxY: word.maxY,
      centerY: word.centerY,
    });
  }

  for (const line of lines) {
    line.words.sort((a, b) => a.minX - b.minX);
    line.text = normalizeText(line.words.map((w) => w.text).join(" "));
  }

  return lines.sort((a, b) => a.centerY - b.centerY);
}

function findHeaderHeight(lines: OcrLine[], words: OcrWord[]): number {
  const headerWords = words.filter((word) => {
    const upper = word.text.toUpperCase();
    return (
      upper.includes("PALLET") ||
      upper.includes("ORDER") ||
      upper.includes("RELEASE") ||
      upper.includes("SIZE") ||
      upper.includes("SQY") ||
      upper.includes("STYLE") ||
      upper.includes("COLOR") ||
      upper.includes("ASSIGN") ||
      upper.includes("#PKGS") ||
      upper.includes("WGT")
    );
  });

  const tableHeaderCluster = headerWords.find((word) => {
    const nearbyHeaderWords = headerWords.filter(
      (candidate) =>
        Math.abs(candidate.centerY - word.centerY) <=
        CONFIG.tableHeaderKeywordYTolerance,
    );
    const nearbyText = nearbyHeaderWords
      .map((candidate) => candidate.text.toUpperCase())
      .join(" ");

    return (
      nearbyText.includes("PALLET") &&
      nearbyText.includes("ORDER") &&
      nearbyText.includes("RELEASE") &&
      nearbyText.includes("SIZE")
    );
  });

  if (tableHeaderCluster) {
    const sameHeaderBand = headerWords.filter(
      (word) =>
        Math.abs(word.centerY - tableHeaderCluster.centerY) <=
        CONFIG.tableHeaderKeywordYTolerance,
    );
    const headerBottom = Math.max(...sameHeaderBand.map((word) => word.maxY));
    return Math.ceil(headerBottom + CONFIG.headerBottomTrim);
  }

  const tableHeaderLine = lines.find((line) => {
    const upper = line.text.toUpperCase();
    return (
      upper.includes("PALLET/ROLL") &&
      upper.includes("ORDER NBR") &&
      upper.includes("#PKGS")
    );
  });

  if (tableHeaderLine) {
    return Math.ceil(tableHeaderLine.maxY + CONFIG.headerBottomTrim);
  }

  const customerOrderInfoLine = lines.find((line) =>
    line.text.toUpperCase().includes("CUSTOMER ORDER INFORMATION"),
  );

  return customerOrderInfoLine
    ? Math.ceil(customerOrderInfoLine.maxY + 85)
    : CONFIG.defaultHeaderHeight;
}

async function refineHeaderHeightByBottomLine(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  detectedHeaderHeight: number,
): Promise<number> {
  const searchTop = Math.max(
    0,
    detectedHeaderHeight - CONFIG.headerLineSearchAbove,
  );
  const searchBottom = Math.min(
    imageHeight,
    detectedHeaderHeight + CONFIG.headerLineSearchBelow,
  );
  const searchHeight = searchBottom - searchTop;

  if (searchHeight <= 0) return detectedHeaderHeight;

  const raw = await sharp(imageBuffer)
    .extract({
      left: 0,
      top: searchTop,
      width: imageWidth,
      height: searchHeight,
    })
    .greyscale()
    .raw()
    .toBuffer();

  const minDarkPixels = Math.floor(imageWidth * CONFIG.headerLineMinDarkRatio);
  const darkRows: number[] = [];

  for (let y = 0; y < searchHeight; y++) {
    let darkPixels = 0;
    const rowOffset = y * imageWidth;
    for (let x = 0; x < imageWidth; x++) {
      if (raw[rowOffset + x] < 80) darkPixels++;
    }
    if (darkPixels >= minDarkPixels) darkRows.push(searchTop + y);
  }

  if (darkRows.length === 0) return detectedHeaderHeight;

  const selectedY = darkRows.reduce((closest, row) =>
    Math.abs(row - detectedHeaderHeight) <
    Math.abs(closest - detectedHeaderHeight)
      ? row
      : closest,
  );

  const refinedHeaderHeight = Math.max(
    1,
    Math.min(imageHeight, selectedY - CONFIG.headerLineBottomTrim),
  );

  console.log("Header height refined by bottom line", {
    detected: detectedHeaderHeight,
    refined: refinedHeaderHeight,
    selectedY,
  });

  return refinedHeaderHeight;
}

function hasPoLikeNumber(text: string): boolean {
  return /\b[A-Z0-9-]*F\d{4,}\b/i.test(text);
}

function isLikelyRowAnchor(line: OcrLine, headerHeight: number): boolean {
  if (line.centerY <= headerHeight) return false;
  const upper = line.text.toUpperCase();

  if (/\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(line.text)) return true;
  if (
    hasPoLikeNumber(line.text) &&
    (upper.includes("INV") ||
      upper.includes("SKU") ||
      upper.includes("ROLL") ||
      upper.includes("PKGS") ||
      upper.includes("WGT") ||
      upper.includes("NMFC") ||
      upper.includes("CLASS"))
  ) {
    return true;
  }
  return hasPoLikeNumber(line.text);
}

function scoreRowAnchor(line: OcrLine): number {
  const upper = line.text.toUpperCase();
  let score = 0;
  if (/\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(line.text)) score += 6;
  if (upper.includes("PO")) score += 3;
  if (upper.includes("INV")) score += 2;
  if (upper.includes("SKU")) score += 2;
  if (upper.includes("PKGS")) score += 1;
  if (upper.includes("WGT")) score += 1;
  if (upper.includes("NMFC")) score += 1;
  if (upper.includes("CLASS")) score += 1;
  if (hasPoLikeNumber(line.text)) score += 2;
  return score;
}

function mergeNearbyAnchors(candidates: OcrLine[]): OcrLine[] {
  if (candidates.length === 0) return [];
  const clusters: OcrLine[][] = [];

  for (const candidate of candidates.sort((a, b) => a.centerY - b.centerY)) {
    const lastCluster = clusters[clusters.length - 1];
    const lastLine = lastCluster?.[lastCluster.length - 1];
    if (lastLine && Math.abs(candidate.centerY - lastLine.centerY) <= 70) {
      lastCluster.push(candidate);
    } else {
      clusters.push([candidate]);
    }
  }

  return clusters.map(
    (cluster) =>
      [...cluster].sort((a, b) => {
        const scoreDiff = scoreRowAnchor(b) - scoreRowAnchor(a);
        if (scoreDiff !== 0) return scoreDiff;
        const poBiasA = /\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(a.text) ? 1 : 0;
        const poBiasB = /\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(b.text) ? 1 : 0;
        return poBiasB - poBiasA || a.centerY - b.centerY;
      })[0],
  );
}

function findRowAnchors(lines: OcrLine[], headerHeight: number): OcrLine[] {
  const candidates = lines.filter((line) =>
    isLikelyRowAnchor(line, headerHeight),
  );
  return mergeNearbyAnchors(candidates).sort((a, b) => a.centerY - b.centerY);
}

function extractPoFromNearbyLines(lines: OcrLine[], anchorY: number): string {
  const nearby = lines
    .filter((line) => Math.abs(line.centerY - anchorY) < 170)
    .sort(
      (a, b) => Math.abs(a.centerY - anchorY) - Math.abs(b.centerY - anchorY),
    );

  for (const line of nearby) {
    const match = line.text.match(/\bPO:?\s*([A-Z0-9-]*F\d{4,})\b/i);
    if (match) return match[1].toUpperCase();
  }
  for (const line of nearby) {
    const match = line.text.match(/\b([A-Z0-9-]*F\d{4,})\b/i);
    if (match) return match[1].toUpperCase();
  }
  return "";
}

function extractPoFromText(text: string): string {
  const explicitMatch = text.match(/\bPO:?\s*([A-Z0-9-]*F\d{4,})\b/i);
  if (explicitMatch) return explicitMatch[1].toUpperCase();

  const looseMatch = text.match(/\b([A-Z0-9-]*F\d{4,})\b/i);
  return looseMatch ? looseMatch[1].toUpperCase() : "";
}

function extractOrderNumberFromLine(line: OcrLine): string {
  const leftText = normalizeText(
    line.words
      .filter((word) => word.centerX <= CONFIG.rowOrderMatchXMax)
      .map((word) => word.text)
      .join(" "),
  );
  const match = leftText.match(/\b\d{5,7}\b/);
  return match ? match[0] : "";
}

function extractOrderNumberFromBox(
  lines: OcrLine[],
  top: number,
  bottom: number,
): string {
  const boxLines = lines.filter(
    (line) =>
      line.centerY >= top - CONFIG.rowLineYMargin &&
      line.centerY <= bottom + CONFIG.rowLineYMargin,
  );
  for (const line of boxLines) {
    const orderNumber = extractOrderNumberFromLine(line);
    if (orderNumber) return orderNumber;
  }
  return "";
}

function extractPoFromBox(
  lines: OcrLine[],
  top: number,
  bottom: number,
): string {
  const boxText = normalizeText(
    lines
      .filter(
        (line) =>
          line.centerY >= top - CONFIG.rowLineYMargin &&
          line.centerY <= bottom + CONFIG.rowLineYMargin,
      )
      .map((line) => line.text)
      .join(" "),
  );
  return extractPoFromText(boxText);
}

async function findHorizontalTableBorders(
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  headerHeight: number,
): Promise<number[]> {
  const searchTop = Math.max(
    0,
    Math.min(
      imageHeight - 1,
      Math.floor(headerHeight + CONFIG.tableBorderSearchStartGap),
    ),
  );
  const searchHeight = imageHeight - searchTop;
  if (searchHeight <= 0) return [];

  const raw = await sharp(imageBuffer)
    .extract({
      left: 0,
      top: searchTop,
      width: imageWidth,
      height: searchHeight,
    })
    .greyscale()
    .raw()
    .toBuffer();

  const minDarkPixels = Math.floor(imageWidth * CONFIG.tableBorderMinDarkRatio);
  const darkRows: number[] = [];

  for (let y = 0; y < searchHeight; y++) {
    let darkPixels = 0;
    const rowOffset = y * imageWidth;
    for (let x = 0; x < imageWidth; x++) {
      if (raw[rowOffset + x] < CONFIG.tableBorderDarkPixelThreshold)
        darkPixels++;
    }
    if (darkPixels >= minDarkPixels) darkRows.push(searchTop + y);
  }

  if (darkRows.length === 0) return [];

  const clusters: Array<{ start: number; end: number; count: number }> = [];
  for (const row of darkRows) {
    const last = clusters[clusters.length - 1];
    if (last && row <= last.end + 2) {
      last.end = row;
      last.count++;
    } else {
      clusters.push({ start: row, end: row, count: 1 });
    }
  }

  const borders = clusters
    .map((cluster) => Math.round((cluster.start + cluster.end) / 2))
    .filter((borderY) => borderY >= headerHeight - 12)
    .sort((a, b) => a - b);

  const deduped: number[] = [];
  for (const border of borders) {
    const previous = deduped[deduped.length - 1];
    if (previous === undefined || border - previous > 12) {
      deduped.push(border);
    }
  }

  const firstUsableBorder =
    headerHeight + CONFIG.firstTableBorderFallbackPadding;
  if (deduped.length === 0 || deduped[0] > firstUsableBorder + 30) {
    deduped.unshift(firstUsableBorder);
  }

  console.log("Detected horizontal table borders", {
    headerHeight,
    borderCount: deduped.length,
    borders: deduped.slice(0, 25),
  });

  return deduped;
}

function findRowBoxForAnchor(
  borders: number[],
  anchorY: number,
  imageHeight: number,
): { top: number; bottom: number } | null {
  for (let i = 0; i < borders.length - 1; i++) {
    const top = borders[i];
    const bottom = borders[i + 1];
    const height = bottom - top;
    if (
      anchorY >= top - 6 &&
      anchorY <= bottom + 6 &&
      height >= CONFIG.minRowBoxHeight &&
      height <= CONFIG.maxRowBoxHeight
    ) {
      return { top, bottom };
    }
  }

  const previousBorder = [...borders]
    .reverse()
    .find((border) => border < anchorY);
  const nextBorder = borders.find((border) => border > anchorY);
  if (!previousBorder || !nextBorder) return null;

  const height = nextBorder - previousBorder;
  if (height < CONFIG.minRowBoxHeight || height > CONFIG.maxRowBoxHeight) {
    return null;
  }

  return { top: previousBorder, bottom: nextBorder };
}

async function buildRows(
  rowAnchors: OcrLine[],
  lines: OcrLine[],
  imageBuffer: Buffer,
  imageWidth: number,
  imageHeight: number,
  headerHeight: number,
): Promise<Row[]> {
  const borders = await findHorizontalTableBorders(
    imageBuffer,
    imageWidth,
    imageHeight,
    headerHeight,
  );

  const rowBoxes = borders
    .slice(0, -1)
    .map((top, index) => {
      const bottom = borders[index + 1];
      return {
        index,
        top,
        bottom,
        orderNumber: extractOrderNumberFromBox(lines, top, bottom),
        po: extractPoFromBox(lines, top, bottom),
      };
    })
    .filter((box) => {
      const height = box.bottom - box.top;
      return (
        height >= CONFIG.minRowBoxHeight && height <= CONFIG.maxRowBoxHeight
      );
    });

  const anchorPoByBoxIndex = new Map<number, string>();
  for (const anchor of rowAnchors) {
    const poNumber = extractPoFromNearbyLines(lines, anchor.centerY);
    if (!poNumber) continue;

    const box = findRowBoxForAnchor(borders, anchor.centerY, imageHeight);
    if (!box) continue;

    const boxIndex = rowBoxes.findIndex(
      (rowBox) =>
        Math.abs(rowBox.top - box.top) <= 4 &&
        Math.abs(rowBox.bottom - box.bottom) <= 4,
    );
    if (boxIndex >= 0) anchorPoByBoxIndex.set(boxIndex, poNumber);
  }

  for (const [boxIndex, poNumber] of anchorPoByBoxIndex.entries()) {
    if (!rowBoxes[boxIndex].po) rowBoxes[boxIndex].po = poNumber;
  }

  for (let i = 0; i < rowBoxes.length; i++) {
    if (rowBoxes[i].po || !rowBoxes[i].orderNumber) continue;

    const nextWithSameOrder = rowBoxes
      .slice(i + 1)
      .find(
        (candidate) =>
          candidate.orderNumber === rowBoxes[i].orderNumber && candidate.po,
      );

    if (nextWithSameOrder) {
      rowBoxes[i].po = nextWithSameOrder.po;
    }
  }

  for (let i = rowBoxes.length - 1; i >= 0; i--) {
    if (rowBoxes[i].po || !rowBoxes[i].orderNumber) continue;

    const previousWithSameOrder = [...rowBoxes]
      .slice(0, i)
      .reverse()
      .find(
        (candidate) =>
          candidate.orderNumber === rowBoxes[i].orderNumber && candidate.po,
      );

    if (previousWithSameOrder) {
      rowBoxes[i].po = previousWithSameOrder.po;
    }
  }

  const rows: Row[] = rowBoxes
    .filter((box) => box.po)
    .map((box) => ({
      index: box.index,
      minY: Math.max(0, box.top - CONFIG.rowBorderPadding),
      maxY: Math.min(imageHeight, box.bottom + CONFIG.rowBorderPadding),
      po: box.po,
      anchorY: (box.top + box.bottom) / 2,
      sourceText: `order=${box.orderNumber || "unknown"}`,
    }))
    .sort((a, b) => a.minY - b.minY);

  console.log("Built rows from table borders", {
    rowCount: rows.length,
    rowBoxes: rowBoxes.map((box) => ({
      index: box.index,
      top: box.top,
      bottom: box.bottom,
      orderNumber: box.orderNumber,
      po: box.po,
    })),
    rows: rows.map((row) => ({
      po: row.po,
      minY: row.minY,
      maxY: row.maxY,
      anchorY: row.anchorY,
      sourceText: row.sourceText,
    })),
  });

  return rows;
}

async function renderFirstPdfPageToImageBuffer(
  pdfBuffer: Buffer,
): Promise<Buffer> {
  const [{ getDocument }, canvasModule] = await Promise.all([
    import("pdfjs-dist/legacy/build/pdf.mjs"),
    import("@napi-rs/canvas"),
  ]);

  class NodeCanvasFactory {
    create(width: number, height: number) {
      const canvas = canvasModule.createCanvas(width, height);
      return { canvas, context: canvas.getContext("2d") };
    }
    reset(c: any, w: number, h: number) {
      c.canvas.width = w;
      c.canvas.height = h;
    }
    destroy(c: any) {
      c.canvas.width = 0;
      c.canvas.height = 0;
    }
  }

  const pdfjsDistPath = path.dirname(
    require.resolve("pdfjs-dist/package.json"),
  );
  const loadingTask = getDocument({
    data: new Uint8Array(pdfBuffer),
    useWorkerFetch: false,
    disableFontFace: true,
    disableWorker: true,
    wasmUrl: `${pdfjsDistPath}/wasm/`,
    standardFontDataUrl: `${pdfjsDistPath}/standard_fonts/`,
  } as any);

  const pdfDocument = await loadingTask.promise;
  const page = await pdfDocument.getPage(1);
  const viewport = page.getViewport({ scale: CONFIG.pdfRenderScale });
  const canvasFactory = new NodeCanvasFactory();
  const c = canvasFactory.create(
    Math.ceil(viewport.width),
    Math.ceil(viewport.height),
  );

  c.context.fillStyle = "#ffffff";
  c.context.fillRect(0, 0, c.canvas.width, c.canvas.height);

  await page.render({
    canvas: c.canvas as any,
    canvasContext: c.context as any,
    viewport,
    background: "#ffffff",
  }).promise;

  const buffer = c.canvas.toBuffer("image/png");
  canvasFactory.destroy(c);
  return buffer;
}

function buildStampSvg(
  imageWidth: number,
  receivedByName: string,
  dateReceived: Date,
): Buffer {
  const safeReceivedByName = escapeSvgText(receivedByName);
  const safeDateReceived = escapeSvgText(formatStampDate(dateReceived));

  return Buffer.from(`
<svg width="${imageWidth}" height="${CONFIG.stampHeight}" viewBox="0 0 ${imageWidth} ${CONFIG.stampHeight}" xmlns="http://www.w3.org/2000/svg">
  <rect width="100%" height="100%" fill="#ffffff"/>
  <text x="${CONFIG.stampLeftPadding}" y="${CONFIG.stampFirstLineY}" font-family="Arial, Helvetica, sans-serif" font-size="${CONFIG.stampFontSize}" fill="#000000">
    <tspan>Received by:</tspan><tspan dx="14" fill="#cc0000" font-weight="700">${safeReceivedByName}</tspan>
  </text>
  <text x="${CONFIG.stampLeftPadding}" y="${CONFIG.stampSecondLineY}" font-family="Arial, Helvetica, sans-serif" font-size="${CONFIG.stampFontSize}" fill="#000000">
    <tspan>Date received:</tspan><tspan dx="14" font-weight="700">${safeDateReceived}</tspan>
  </text>
</svg>`);
}

// ==================== MAIN FUNCTION ====================

export const processShawBol = functions.storage.onObjectFinalized(
  { region: "us-central1", memory: CONFIG.memory, timeoutSeconds: 300 },
  async (event) => {
    const filePath = event.data.name ?? "";
    const bucketName = event.data.bucket ?? "";
    const match = filePath.match(SPLIT_PATH_REGEX);
    if (!bucketName || !match) return;

    const splitId = match[1];
    const fileExtension = match[3].toLowerCase();
    const splitRef = db.doc(`splits/${splitId}`);
    const bucket = admin.storage().bucket(bucketName);
    let splitCreatedBy = "";
    let includeStamp = false;
    let receivedByName = "Unknown";
    let dateReceived = new Date();
    const tempFile = path.join(
      os.tmpdir(),
      `shaw_bol_${splitId}_${Date.now()}.jpg`,
    );

    const isSupportedImage = SUPPORTED_IMAGE_EXTENSIONS.has(fileExtension);
    const isSupportedPdf = SUPPORTED_PDF_EXTENSIONS.has(fileExtension);

    if (!isSupportedImage && !isSupportedPdf) {
      await splitRef.set(
        buildStatusPatch("failed", {
          statusLabel: "Failed",
          statusMessage: `Unsupported file type`,
        }),
        { merge: true },
      );
      return;
    }

    try {
      await db.runTransaction(async (tx) => {
        const snap = await tx.get(splitRef);
        if (!snap.exists) throw new Error(`Split not found`);
        const splitData = snap.data() ?? {};
        splitCreatedBy = splitData.createdBy || "";
        includeStamp = isStampEnabled(splitData.includeStamp);
        receivedByName = splitData.receivedByName || "Unknown";
        dateReceived = splitData.dateReceived?.toDate?.() ?? new Date();
        if (["processing", "splitting", "completed"].includes(splitData.status))
          throw new Error("already_processed");
        tx.update(splitRef, buildStatusPatch("queued", { progressPercent: 5 }));
      });

      await splitRef.update(
        buildStatusPatch("processing", { progressPercent: 15 }),
      );

      await bucket.file(filePath).download({ destination: tempFile });
      let imageBuffer = isSupportedPdf
        ? await renderFirstPdfPageToImageBuffer(await fs.readFile(tempFile))
        : await fs.readFile(tempFile);

      imageBuffer = await sharp(imageBuffer)
        .rotate()
        .flatten({ background: "#ffffff" })
        .jpeg({ quality: CONFIG.jpegQuality })
        .toBuffer();

      let metadata = await sharp(imageBuffer).metadata();
      if (metadata.width! > metadata.height!) {
        imageBuffer = await sharp(imageBuffer)
          .rotate(CONFIG.landscapeRotationDegrees)
          .flatten({ background: "#ffffff" })
          .jpeg({ quality: CONFIG.jpegQuality })
          .toBuffer();
        metadata = await sharp(imageBuffer).metadata();
      }

      const imageWidth = metadata.width!;
      const imageHeight = metadata.height!;

      await splitRef.update(
        buildStatusPatch("splitting", { progressPercent: 45 }),
      );

      const [result] = await vision.documentTextDetection({
        image: { content: imageBuffer },
        imageContext: { languageHints: ["en"] },
      });
      const page = result.fullTextAnnotation?.pages?.[0];
      if (!page) throw new Error("No OCR page returned from Vision");

      const words = buildWordsFromVisionPage(page);
      const lines = groupWordsIntoLines(words);

      const detectedHeaderHeight = Math.min(
        findHeaderHeight(lines, words),
        imageHeight,
      );
      const headerHeight = await refineHeaderHeightByBottomLine(
        imageBuffer,
        imageWidth,
        imageHeight,
        detectedHeaderHeight,
      );

      console.log(`Final reusable header height: ${headerHeight}px`);

      const rowAnchors = findRowAnchors(lines, headerHeight);
      const rows = await buildRows(
        rowAnchors,
        lines,
        imageBuffer,
        imageWidth,
        imageHeight,
        headerHeight,
      );

      if (rows.length === 0) {
        throw new Error("No PO row boxes found from table borders");
      }

      console.log("PO row grouping summary", {
        rows: rows.map((row) => ({
          po: row.po,
          top: row.minY,
          bottom: row.maxY,
          sourceText: row.sourceText,
        })),
      });
      const poGroups = new Map<string, Row[]>();
      rows.forEach((row) => {
        if (!poGroups.has(row.po)) poGroups.set(row.po, []);
        poGroups.get(row.po)!.push(row);
      });

      const orderedRows = [...rows].sort((a, b) => a.minY - b.minY);
      const firstDetectedRowTop = orderedRows[0]?.minY ?? imageHeight;

      let order = 0;
      for (const [poNumber, group] of poGroups.entries()) {
        order++;
        const subSplitRef = db.collection(`splits/${splitId}/subSplits`).doc();
        const subSplitId = subSplitRef.id;

        group.sort((a, b) => a.minY - b.minY);

        const safeHeaderHeight = Math.max(
          1,
          Math.min(headerHeight, imageHeight),
        );

        const headerBuffer = await sharp(imageBuffer)
          .extract({
            left: 0,
            top: 0,
            width: imageWidth,
            height: safeHeaderHeight,
          })
          .toBuffer();

        const firstRowTop = Math.min(...group.map((r) => r.minY));
        const lastRowBottom = Math.max(...group.map((r) => r.maxY));

        const lastGroupRowIndex = orderedRows.findIndex(
          (r) => r.index === group[group.length - 1].index,
        );
        const nextRow =
          lastGroupRowIndex >= 0
            ? orderedRows[lastGroupRowIndex + 1]
            : undefined;

        let groupTop = Math.max(0, firstRowTop - CONFIG.groupTopPadding);
        let groupBottom = lastRowBottom + CONFIG.groupBottomPadding;

        if (nextRow) {
          groupBottom = Math.min(
            groupBottom + CONFIG.bottomBorderExtraPadding,
            nextRow.minY +
              CONFIG.rowBorderPadding +
              CONFIG.bottomBorderExtraPadding,
          );
        } else {
          groupBottom += CONFIG.bottomBorderExtraPadding;
        }

        groupTop = Math.max(0, Math.min(imageHeight - 1, Math.floor(groupTop)));
        groupBottom = Math.max(
          groupTop + 1,
          Math.min(imageHeight, Math.floor(groupBottom)),
        );

        if (groupBottom <= groupTop + 1) {
          console.warn(`PO ${poNumber}: Bad group height, forcing minimum`);
          groupBottom = Math.min(imageHeight, groupTop + 180);
        }

        const groupHeight = Math.max(1, groupBottom - groupTop);
        const bodyExtractArea = clampExtractArea(
          imageWidth,
          imageHeight,
          groupTop,
          groupHeight,
        );

        const stampBuffer = includeStamp
          ? buildStampSvg(imageWidth, receivedByName, dateReceived)
          : null;
        const stampHeight = stampBuffer ? CONFIG.stampHeight : 0;
        const headerTop = stampHeight;
        const bodyTop =
          stampHeight + safeHeaderHeight + CONFIG.outputHeaderBodyGap;

        console.log(
          `Generating sub-split for PO ${poNumber}: headerHeight=${headerHeight}, safeHeaderHeight=${safeHeaderHeight}, includeStamp=${includeStamp}, stampHeight=${stampHeight}, bodyTop=${bodyTop}, groupTop=${bodyExtractArea.top}, height=${bodyExtractArea.height}, imageHeight=${imageHeight}, firstRowTop=${firstRowTop}, lastRowBottom=${lastRowBottom}, nextRowTop=${nextRow?.minY ?? "none"}`,
        );

        const bodyBuffer = await sharp(imageBuffer)
          .extract(bodyExtractArea)
          .toBuffer();
        const outputHeight = bodyTop + bodyExtractArea.height;
        const compositeInputs = [
          ...(stampBuffer ? [{ input: stampBuffer, top: 0, left: 0 }] : []),
          { input: headerBuffer, top: headerTop, left: 0 },
          { input: bodyBuffer, top: bodyTop, left: 0 },
        ];

        const subImageBuffer = await sharp({
          create: {
            width: imageWidth,
            height: outputHeight,
            channels: 4,
            background: { r: 255, g: 255, b: 255, alpha: 1 },
          },
        })
          .composite(compositeInputs)
          .jpeg({ quality: CONFIG.jpegQuality })
          .toBuffer();

        const imagePath = `splits/${splitId}/subSplits/${subSplitId}/image.jpg`;
        await bucket
          .file(imagePath)
          .save(subImageBuffer, { metadata: { contentType: "image/jpeg" } });

        await subSplitRef.set({
          poNumber,
          poNumberNormalized: normalizePoNumber(poNumber),
          splitCreatedBy,
          splitId,
          order,
          rowCount: group.length,
          imagePath,
          generatedImagePath: imagePath,
          imageUrl: buildStorageDownloadUrl(bucketName, imagePath),
          storageBucket: bucketName,
          includeStamp,
          stampApplied: includeStamp,
          receivedByName,
          dateReceived: admin.firestore.Timestamp.fromDate(dateReceived),
          headerHeight: safeHeaderHeight,
          stampHeight,
          cropTop: bodyExtractArea.top,
          cropBottom: bodyExtractArea.top + bodyExtractArea.height,
          cropHeight: bodyExtractArea.height,
          outputHeight,
          status: "generated",
          createdAt: admin.firestore.FieldValue.serverTimestamp(),
          updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
      }

      await splitRef.update(
        buildStatusPatch("completed", {
          progressPercent: 100,
          subSplitCount: poGroups.size,
          subSplitsGenerated: poGroups.size,
        }),
      );

      console.log(
        `✅ Completed split ${splitId} with ${poGroups.size} sub-splits`,
      );
    } catch (error: any) {
      if (error.message === "already_processed") return;
      console.error(`Processing failed for ${splitId}:`, error);
      await splitRef.set(
        buildStatusPatch("failed", {
          statusLabel: "Failed",
          errorMessage: error.message,
          progressPercent: 100,
        }),
        { merge: true },
      );
    } finally {
      await fs.unlink(tempFile).catch(() => {});
    }
  },
);
