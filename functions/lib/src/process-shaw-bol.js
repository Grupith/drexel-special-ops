"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.processShawBol = void 0;
// functions/src/process-shaw-bol.ts
const functions = __importStar(require("firebase-functions/v2"));
const admin = __importStar(require("firebase-admin"));
const vision_1 = require("@google-cloud/vision");
const sharp_1 = __importDefault(require("sharp"));
const path = __importStar(require("path"));
const os = __importStar(require("os"));
const fs = __importStar(require("fs/promises"));
// Firebase Admin is initialized once in functions/index.js
const db = admin.firestore();
const vision = new vision_1.ImageAnnotatorClient();
// ==================== CONFIG ====================
const SPLIT_PATH_REGEX = /^splits\/([^/]+)\/original\/[^/]+\.(jpg|jpeg|png)$/i;
const CONFIG = {
    memory: "2GiB",
    rowMergeTolerance: 12,
    defaultHeaderHeight: 950,
    headerPadding: 30,
    rowTopPadding: 52,
    rowBottomPadding: 24,
    rowBoundaryPadding: 6,
    groupTopPadding: 30,
    groupBottomPadding: 16,
    jpegQuality: 92,
};
// ===============================================
function getBounds(vertices = []) {
    const validVertices = vertices.filter((v) => typeof v.x === "number" && typeof v.y === "number");
    if (validVertices.length === 0) {
        return {
            minX: 0,
            maxX: 0,
            minY: 0,
            maxY: 0,
            centerX: 0,
            centerY: 0,
        };
    }
    const xs = validVertices.map((v) => v.x);
    const ys = validVertices.map((v) => v.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    return {
        minX,
        maxX,
        minY,
        maxY,
        centerX: (minX + maxX) / 2,
        centerY: (minY + maxY) / 2,
    };
}
function normalizeText(text) {
    return text.replace(/\s+/g, " ").trim();
}
function buildStorageDownloadUrl(bucketName, filePath) {
    return `https://firebasestorage.googleapis.com/v0/b/${bucketName}/o/${encodeURIComponent(filePath)}?alt=media`;
}
function buildWordsFromVisionPage(page) {
    const words = [];
    for (const block of page.blocks ?? []) {
        for (const para of block.paragraphs ?? []) {
            for (const word of para.words ?? []) {
                const text = normalizeText((word.symbols ?? []).map((s) => s.text ?? "").join(""));
                if (!text)
                    continue;
                const bounds = getBounds(word.boundingBox?.vertices ?? []);
                words.push({ text, ...bounds });
            }
        }
    }
    return words.sort((a, b) => a.centerY - b.centerY || a.minX - b.minX);
}
function groupWordsIntoLines(words) {
    const sortedWords = [...words].sort((a, b) => a.centerY - b.centerY || a.minX - b.minX);
    const lines = [];
    for (const word of sortedWords) {
        const lastLine = lines[lines.length - 1];
        if (lastLine &&
            Math.abs(lastLine.centerY - word.centerY) <= CONFIG.rowMergeTolerance) {
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
function findHeaderHeight(lines) {
    // Prefer the actual table header line (most accurate)
    const tableHeaderLine = lines.find((line) => {
        const upper = line.text.toUpperCase();
        return (upper.includes("PALLET/ROLL") &&
            upper.includes("ORDER NBR") &&
            upper.includes("#PKGS"));
    });
    if (tableHeaderLine) {
        return Math.ceil(tableHeaderLine.centerY + 45);
    }
    // Fallback to "CUSTOMER ORDER INFORMATION"
    const customerOrderInfoLine = lines.find((line) => line.text.toUpperCase().includes("CUSTOMER ORDER INFORMATION"));
    if (customerOrderInfoLine) {
        return Math.ceil(customerOrderInfoLine.centerY + 120);
    }
    return CONFIG.defaultHeaderHeight;
}
function hasPoLikeNumber(text) {
    return /\b[A-Z0-9-]*F\d{4,}\b/i.test(text);
}
function isLikelyRowAnchor(line, headerHeight) {
    if (line.centerY <= headerHeight)
        return false;
    const upper = line.text.toUpperCase();
    if (/\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(line.text)) {
        return true;
    }
    if (hasPoLikeNumber(line.text) &&
        (upper.includes("INV") ||
            upper.includes("SKU") ||
            upper.includes("ROLL") ||
            upper.includes("PKGS") ||
            upper.includes("WGT") ||
            upper.includes("NMFC") ||
            upper.includes("CLASS"))) {
        return true;
    }
    return hasPoLikeNumber(line.text);
}
function scoreRowAnchor(line) {
    const upper = line.text.toUpperCase();
    let score = 0;
    if (/\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(line.text))
        score += 6;
    if (upper.includes("PO"))
        score += 3;
    if (upper.includes("INV"))
        score += 2;
    if (upper.includes("SKU"))
        score += 2;
    if (upper.includes("PKGS"))
        score += 1;
    if (upper.includes("WGT"))
        score += 1;
    if (upper.includes("NMFC"))
        score += 1;
    if (upper.includes("CLASS"))
        score += 1;
    if (hasPoLikeNumber(line.text))
        score += 2;
    return score;
}
function mergeNearbyAnchors(candidates) {
    if (candidates.length === 0)
        return [];
    const clusters = [];
    for (const candidate of candidates.sort((a, b) => a.centerY - b.centerY)) {
        const lastCluster = clusters[clusters.length - 1];
        const lastLine = lastCluster?.[lastCluster.length - 1];
        if (lastLine && Math.abs(candidate.centerY - lastLine.centerY) <= 70) {
            lastCluster.push(candidate);
        }
        else {
            clusters.push([candidate]);
        }
    }
    return clusters.map((cluster) => {
        return [...cluster].sort((a, b) => {
            const scoreDiff = scoreRowAnchor(b) - scoreRowAnchor(a);
            if (scoreDiff !== 0)
                return scoreDiff;
            const poBiasA = /\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(a.text) ? 1 : 0;
            const poBiasB = /\bPO:?\s*[A-Z0-9-]*F\d{4,}\b/i.test(b.text) ? 1 : 0;
            if (poBiasB !== poBiasA)
                return poBiasB - poBiasA;
            return a.centerY - b.centerY;
        })[0];
    });
}
function findRowAnchors(lines, headerHeight) {
    const candidates = lines.filter((line) => isLikelyRowAnchor(line, headerHeight));
    return mergeNearbyAnchors(candidates).sort((a, b) => a.centerY - b.centerY);
}
function extractPoFromNearbyLines(lines, anchorY) {
    const nearby = lines
        .filter((line) => Math.abs(line.centerY - anchorY) < 170)
        .sort((a, b) => Math.abs(a.centerY - anchorY) - Math.abs(b.centerY - anchorY));
    for (const line of nearby) {
        const match = line.text.match(/\bPO:?\s*([A-Z0-9-]*F\d{4,})\b/i);
        if (match)
            return match[1].toUpperCase();
    }
    for (const line of nearby) {
        const match = line.text.match(/\b([A-Z0-9-]*F\d{4,})\b/i);
        if (match)
            return match[1].toUpperCase();
    }
    return "";
}
function buildRows(rowAnchors, lines, imageHeight, headerHeight) {
    const rows = [];
    for (let i = 0; i < rowAnchors.length; i++) {
        const anchor = rowAnchors[i];
        const prevAnchor = rowAnchors[i - 1];
        const nextAnchor = rowAnchors[i + 1];
        const poNumber = extractPoFromNearbyLines(lines, anchor.centerY);
        if (!poNumber) {
            console.warn(`Row ${i} skipped: No PO number found near PO anchor line`);
            continue;
        }
        const topBoundary = prevAnchor
            ? Math.floor((prevAnchor.maxY + anchor.minY) / 2)
            : headerHeight;
        const bottomBoundary = nextAnchor
            ? Math.ceil((anchor.maxY + nextAnchor.minY) / 2)
            : Math.min(imageHeight, anchor.maxY + 180);
        const minY = Math.max(headerHeight, Math.min(anchor.minY - CONFIG.rowTopPadding, topBoundary - CONFIG.rowBoundaryPadding));
        const maxY = Math.min(imageHeight, Math.max(anchor.maxY + CONFIG.rowBottomPadding, bottomBoundary + CONFIG.rowBoundaryPadding));
        if (maxY <= minY + 50) {
            console.warn(`Row ${i} skipped: invalid crop bounds (${minY}-${maxY}) for anchorY=${anchor.centerY}`);
            continue;
        }
        rows.push({
            index: i,
            minY,
            maxY,
            po: poNumber,
            anchorY: anchor.centerY,
            sourceText: anchor.text,
        });
    }
    return rows;
}
async function deleteExistingSubSplits(splitId, bucketName) {
    const subSplitsRef = db.collection(`splits/${splitId}/subSplits`);
    const snapshot = await subSplitsRef.get();
    if (snapshot.empty)
        return;
    const bucket = admin.storage().bucket(bucketName);
    const batch = db.batch();
    for (const doc of snapshot.docs) {
        const imagePath = doc.data().imagePath;
        if (imagePath) {
            await bucket
                .file(imagePath)
                .delete()
                .catch((e) => console.warn("Failed to delete old image:", e.message));
        }
        batch.delete(doc.ref);
    }
    await batch.commit();
}
// ==================== MAIN FUNCTION ====================
exports.processShawBol = functions.storage.onObjectFinalized({
    region: "us-central1",
    memory: CONFIG.memory,
    timeoutSeconds: 300,
}, async (event) => {
    const filePath = event.data.name ?? "";
    const bucketName = event.data.bucket ?? "";
    const match = filePath.match(SPLIT_PATH_REGEX);
    if (!match || !bucketName)
        return;
    const splitId = match[1];
    const splitRef = db.doc(`splits/${splitId}`);
    const bucket = admin.storage().bucket(bucketName);
    const tempFile = path.join(os.tmpdir(), `shaw_bol_${splitId}_${Date.now()}.jpg`);
    try {
        // Lock with transaction
        await db.runTransaction(async (tx) => {
            const snap = await tx.get(splitRef);
            if (!snap.exists)
                throw new Error(`Split document not found: ${splitId}`);
            const status = snap.data()?.status;
            if (status !== undefined &&
                ["processing", "completed", "failed"].includes(status)) {
                throw new Error("already_processed");
            }
            tx.update(splitRef, {
                status: "processing",
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
                errorMessage: admin.firestore.FieldValue.delete(),
            });
        });
        console.log(`Starting processing for split ${splitId}`);
        await deleteExistingSubSplits(splitId, bucketName);
        await bucket.file(filePath).download({ destination: tempFile });
        const imageBuffer = await fs.readFile(tempFile);
        const metadata = await (0, sharp_1.default)(imageBuffer).metadata();
        if (!metadata.width || !metadata.height) {
            throw new Error("Could not determine image dimensions.");
        }
        const imageWidth = metadata.width;
        const imageHeight = metadata.height;
        console.log(`Image dimensions: ${imageWidth}x${imageHeight}`);
        // OCR
        const [result] = await vision.documentTextDetection({
            image: { content: imageBuffer },
        });
        const page = result.fullTextAnnotation?.pages?.[0];
        if (!page)
            throw new Error("No OCR page returned from Vision.");
        const words = buildWordsFromVisionPage(page);
        const lines = groupWordsIntoLines(words);
        console.log(`OCR complete: ${words.length} words, ${lines.length} lines detected`);
        const headerHeight = Math.min(findHeaderHeight(lines), imageHeight);
        console.log(`Detected header height: ${headerHeight}px`);
        console.log("Candidate anchor lines:", lines
            .map((line) => ({
            text: line.text,
            minY: line.minY,
            maxY: line.maxY,
            height: line.maxY - line.minY,
            centerY: line.centerY,
            belowHeaderByCenter: line.centerY > headerHeight,
            hasPoLikeNumber: hasPoLikeNumber(line.text),
        }))
            .filter((line) => line.hasPoLikeNumber));
        const rowAnchors = findRowAnchors(lines, headerHeight);
        console.log(`Found ${rowAnchors.length} PO row anchors`);
        console.log("Merged PO row anchors:", rowAnchors.map((a) => ({
            text: a.text,
            minY: a.minY,
            maxY: a.maxY,
            height: a.maxY - a.minY,
            centerY: a.centerY,
            po: extractPoFromNearbyLines(lines, a.centerY),
        })));
        if (rowAnchors.length === 0) {
            throw new Error("Could not find any PO-like row anchors.");
        }
        const rows = buildRows(rowAnchors, lines, imageHeight, headerHeight);
        console.log("Extracted rows:", rows.map((r) => ({
            po: r.po,
            minY: r.minY,
            maxY: r.maxY,
            height: r.maxY - r.minY,
            anchorY: r.anchorY,
            sourceText: r.sourceText,
        })));
        console.log("Row anchors:", rowAnchors.map((a) => ({
            text: a.text,
            minY: a.minY,
            maxY: a.maxY,
            height: a.maxY - a.minY,
            centerY: a.centerY,
        })));
        if (rows.length === 0) {
            throw new Error("No valid rows with PO numbers were detected.");
        }
        // Group by PO
        const poGroups = new Map();
        rows.forEach((row) => {
            if (!poGroups.has(row.po))
                poGroups.set(row.po, []);
            poGroups.get(row.po).push(row);
        });
        const orderedRows = [...rows].sort((a, b) => a.minY - b.minY);
        console.log(`Found ${poGroups.size} unique PO numbers`);
        let order = 0;
        for (const [poNumber, group] of poGroups.entries()) {
            order++;
            const subSplitRef = db.collection(`splits/${splitId}/subSplits`).doc();
            const subSplitId = subSplitRef.id;
            group.sort((a, b) => a.minY - b.minY);
            const headerBuffer = await (0, sharp_1.default)(imageBuffer)
                .extract({ left: 0, top: 0, width: imageWidth, height: headerHeight })
                .toBuffer();
            const firstRowTop = Math.min(...group.map((row) => row.minY));
            const lastRowBottom = Math.max(...group.map((row) => row.maxY));
            const lastGroupRow = [...group].sort((a, b) => a.maxY - b.maxY)[group.length - 1];
            const lastGroupRowIndex = orderedRows.findIndex((row) => row.index === lastGroupRow.index);
            const nextRow = lastGroupRowIndex >= 0
                ? orderedRows[lastGroupRowIndex + 1]
                : undefined;
            const naturalGroupBottom = lastRowBottom + CONFIG.groupBottomPadding;
            const cappedGroupBottom = nextRow
                ? Math.min(naturalGroupBottom, Math.max(lastRowBottom + 8, nextRow.minY - 10))
                : naturalGroupBottom;
            const groupTop = Math.max(0, firstRowTop - CONFIG.groupTopPadding);
            const groupBottom = Math.min(imageHeight, cappedGroupBottom);
            const groupHeight = groupBottom - groupTop;
            if (groupHeight <= 60) {
                console.warn(`Skipping PO ${poNumber}: continuous group crop too small (${groupHeight})`);
                continue;
            }
            console.log(`Continuous crop for PO ${poNumber}: ${groupTop} → ${groupBottom} (h=${groupHeight}, rows=${group.length}, nextRowMinY=${nextRow?.minY ?? "none"})`);
            const bodyBuffer = await (0, sharp_1.default)(imageBuffer)
                .extract({
                left: 0,
                top: groupTop,
                width: imageWidth,
                height: groupHeight,
            })
                .toBuffer();
            const outputHeight = Math.max(headerHeight, groupBottom);
            const subImageBuffer = await (0, sharp_1.default)({
                create: {
                    width: imageWidth,
                    height: outputHeight,
                    channels: 4,
                    background: { r: 255, g: 255, b: 255, alpha: 1 },
                },
            })
                .composite([
                { input: headerBuffer, top: 0, left: 0 },
                { input: bodyBuffer, top: groupTop, left: 0 },
            ])
                .jpeg({ quality: CONFIG.jpegQuality })
                .toBuffer();
            const imagePath = `splits/${splitId}/subSplits/${subSplitId}/image.jpg`;
            const outputFile = bucket.file(imagePath);
            await outputFile.save(subImageBuffer, {
                metadata: { contentType: "image/jpeg" },
            });
            const imageUrl = buildStorageDownloadUrl(bucketName, imagePath);
            await subSplitRef.set({
                poNumber,
                order,
                rowCount: group.length,
                imagePath,
                imageUrl,
                storageBucket: bucketName,
                cropTop: groupTop,
                cropBottom: groupBottom,
                cropHeight: groupHeight,
                outputHeight,
                status: "generated",
                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                updatedAt: admin.firestore.FieldValue.serverTimestamp(),
            });
            console.log(`✅ Created sub-split for PO ${poNumber} (${group.length} rows)`);
        }
        await splitRef.update({
            status: "completed",
            subSplitCount: poGroups.size,
            processedAt: admin.firestore.FieldValue.serverTimestamp(),
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        });
        console.log(`✅ Successfully completed split ${splitId} with ${poGroups.size} sub-splits.`);
    }
    catch (error) {
        const message = error.message || "Unknown error";
        if (message === "already_processed") {
            console.log(`Split ${splitId} was already being processed.`);
            return;
        }
        console.error(`❌ Processing failed for ${splitId}:`, error);
        await splitRef.set({
            status: "failed",
            errorMessage: message,
            updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        }, { merge: true });
    }
    finally {
        await fs.unlink(tempFile).catch(() => { });
    }
});
