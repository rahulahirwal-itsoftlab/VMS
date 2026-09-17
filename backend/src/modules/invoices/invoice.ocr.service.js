import fs from 'fs/promises';
import path from 'path';
import sharp from 'sharp';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { createWorker, OEM, PSM } from 'tesseract.js';
import englishLanguage from '@tesseract.js-data/eng';

const OCR_CAPABLE_MIME_TYPES = new Set([
  'application/pdf',
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/tiff',
]);

const PDF_INTERNAL_TOKENS = /(?:%PDF-\d|\/(?:Type|Page|Pages|MediaBox|Resources|Contents|Font|BaseFont)\b|\b(?:endobj|endstream|xref|startxref)\b)/gi;
const MONTH_NAME = String.raw`(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:t(?:ember)?)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)`;
const DATE_VALUE = String.raw`([0-3]?\d[./-][01]?\d[./-](?:\d{4}|\d{2})|\d{4}[./-][01]?\d[./-][0-3]?\d|[0-3]?\d[\s-]+${MONTH_NAME}[\s,-]+(?:\d{4}|\d{2})|${MONTH_NAME}[\s-]+[0-3]?\d,?[\s-]+(?:\d{4}|\d{2}))`;
const MONEY_VALUE = String.raw`(?:₹|Rs\.?|INR|USD|\$)?\s*([-+]?\d[\d,]*(?:\.\d{1,2})?)`;
const GSTIN_PATTERN = /\b\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]\b/gi;
const PAN_PATTERN = /\b[A-Z]{5}\d{4}[A-Z]\b/g;
const OCR_TARGET_WIDTH = Number(process.env.OCR_TARGET_WIDTH || 2400);
const OCR_MAX_WIDTH = Number(process.env.OCR_MAX_WIDTH || 3200);
const PDF_RENDER_SCALE = Number(process.env.OCR_PDF_RENDER_SCALE || 2.5);
const OCR_MAX_PAGES = Math.max(1, Number(process.env.OCR_MAX_PAGES || 3));
const OCR_MAX_FALLBACK_PASSES = Math.max(0, Number(process.env.OCR_MAX_FALLBACK_PASSES || 3));
const OCR_MIN_ACCEPTABLE_SCORE = 92;
const OCR_PRIMARY_IMAGE_CANDIDATES = Object.freeze([
  { label: 'enhanced', options: { threshold: false } },
  { label: 'adaptive-threshold', options: { threshold: true } },
]);
const OCR_FALLBACK_IMAGE_CANDIDATES = Object.freeze([
  { label: 'strong-sharpen', options: { threshold: false, sharpen: 1.35 } },
  { label: 'low-dpi-upscale', options: { threshold: false, sharpen: 1.6, denoise: 1, contrast: true } },
  { label: 'denoise-threshold', options: { threshold: true, denoise: 2 } },
  { label: 'dark-image-normalized', options: { threshold: false, sharpen: 1.2, denoise: 2, gamma: 1.4, contrast: true } },
  { label: 'dark-image-threshold', options: { threshold: true, sharpen: 1.4, denoise: 2, gamma: 1.35, contrast: true } },
  { label: 'blur-recovery', options: { threshold: false, sharpen: 1.9, denoise: 1, contrast: true } },
  { label: 'deskew-left', options: { threshold: false, skew: -1.2 } },
  { label: 'deskew-right', options: { threshold: false, skew: 1.2 } },
  { label: 'deskew-left-strong', options: { threshold: false, skew: -2.4, sharpen: 1.35 } },
  { label: 'deskew-right-strong', options: { threshold: false, skew: 2.4, sharpen: 1.35 } },
  { label: 'deskew-left-threshold', options: { threshold: true, skew: -1.2 } },
  { label: 'deskew-right-threshold', options: { threshold: true, skew: 1.2 } },
  { label: 'rotate-90', options: { threshold: false, rotation: 90 } },
  { label: 'rotate-270', options: { threshold: false, rotation: 270 } },
  { label: 'rotate-180', options: { threshold: false, rotation: 180 } },
]);
const regexCache = new Map();

const ocrDebugEnabled = () =>
  process.env.NODE_ENV !== 'production'
  || process.env.DEBUG_OCR_FLOW === 'true'
  || process.env.DEBUG_INVOICE_FLOW === 'true'; 

const debugOcrStage = (label, details = {}) => {
  if (!ocrDebugEnabled()) return;
  const normalized = String(label || '').toUpperCase();
  const prefix = normalized.includes('NORMAL')
    || normalized.includes('PARS')
    || normalized.includes('FIELD')
    ? '[OCR NORMALIZATION]'
    : '[OCR EXTRACTION]';
  console.log(prefix, label, details);
};

const nowMs = () => Date.now();
const elapsedMs = (startedAt) => Date.now() - startedAt;
const perfTime = (label) => {
  try { console.time(label); } catch {}
};
const perfTimeEnd = (label) => {
  try { console.timeEnd(label); } catch {}
};

if (!globalThis.DOMMatrix) globalThis.DOMMatrix = DOMMatrix;
if (!globalThis.ImageData) globalThis.ImageData = ImageData;
if (!globalThis.Path2D) globalThis.Path2D = Path2D;

let workerPromise;
let recognitionQueue = Promise.resolve();

export const shouldAttemptOcr = (file) => {
  if (!file) return false;
  const mime = String(file.mimetype || file.type || '').toLowerCase();
  const name = file.originalname || file.name || '';
  return OCR_CAPABLE_MIME_TYPES.has(mime) || /\.(pdf|png|jpe?g|tiff?)$/i.test(name);
};

const readFileBuffer = async (file) => {
  debugOcrStage('[OCR EXTRACT] file read started', {
    originalFileName: file?.originalname || file?.name || null,
    mimeType: file?.mimetype || file?.type || null,
    fileSize: file?.size || null,
    hasMemoryBuffer: Buffer.isBuffer(file?.buffer),
    hasDiskPath: Boolean(file?.path),
  });
  if (Buffer.isBuffer(file?.buffer)) {
    debugOcrStage('[OCR EXTRACT] file read completed', {
      source: 'memory',
      bytes: file.buffer.length,
    });
    return file.buffer;
  }
  if (file?.path) {
    const buffer = await fs.readFile(file.path);
    debugOcrStage('[OCR EXTRACT] file read completed', {
      source: 'disk',
      bytes: buffer.length,
    });
    return buffer;
  }
  throw new Error('The uploaded document could not be read.');
};

const detectDocumentType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return null;
  if (buffer.subarray(0, 5).toString('ascii') === '%PDF-') return 'application/pdf';
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return 'image/jpeg';
  if ((buffer[0] === 0x49 && buffer[1] === 0x49 && buffer[2] === 0x2a && buffer[3] === 0x00) || (buffer[0] === 0x4d && buffer[1] === 0x4d && buffer[2] === 0x00 && buffer[3] === 0x2a)) return 'image/tiff';
  return null;
};

const getOcrWorker = async () => {
  if (!workerPromise) {
    workerPromise = createWorker('eng', OEM.LSTM_ONLY, {
      langPath: englishLanguage.langPath,
      gzip: englishLanguage.gzip,
      cacheMethod: 'readOnly',
      logger: () => {},
    }).then(async (worker) => {
      await worker.setParameters({
        tessedit_pageseg_mode: PSM.AUTO,
        preserve_interword_spaces: '1',
        user_defined_dpi: '450',
        tessedit_do_invert: '1',
        textord_tablefind_recognize_tables: '1',
        textord_tabfind_find_tables: '1',
        tessedit_enable_dict_correction: '1',
        tessedit_enable_bigram_correction: '1',
      });
      return worker;
    }).catch((error) => {
      workerPromise = null;
      throw error;
    });
  }
  return workerPromise;
};

const preprocessImage = async (buffer, {
  threshold = false,
  rotation = 0,
  skew = 0,
  sharpen = 1,
  denoise = 1,
  gamma = 1,
  contrast = false,
  normalize = true,
  grayscale = true,
} = {}) => {
  perfTime('[OCR PERF] Image preprocessing');
  const image = sharp(buffer, { failOn: 'error', limitInputPixels: 160_000_000 }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width || 0;
  const targetWidth = width > 0
    ? Math.min(OCR_MAX_WIDTH, Math.max(width, OCR_TARGET_WIDTH))
    : OCR_TARGET_WIDTH;
  let pipeline = image
    .flatten({ background: '#ffffff' })
    .resize(width > 0 && width < targetWidth ? { width: targetWidth, withoutEnlargement: false } : undefined);

  if (rotation) pipeline = pipeline.rotate(rotation, { background: '#ffffff' });
  if (skew) pipeline = pipeline.rotate(skew, { background: '#ffffff' });

  if (grayscale) pipeline = pipeline.grayscale();
  if (normalize) pipeline = pipeline.normalise();
  pipeline = pipeline.clahe({ width: 64, height: 64 });
  if (contrast) pipeline = pipeline.linear(1.2, -12);
  if (gamma && gamma !== 1) pipeline = pipeline.gamma(gamma);
  pipeline = pipeline
    .median(denoise)
    .sharpen({ sigma: threshold ? 1.15 * sharpen : 0.9 * sharpen, m1: 1.2, m2: 2.2 });

  if (threshold) pipeline = pipeline.threshold(175, { grayscale: true });

  try {
    return await pipeline
      .png({ compressionLevel: 6, adaptiveFiltering: true })
      .toBuffer();
  } finally {
    perfTimeEnd('[OCR PERF] Image preprocessing');
  }
};

const buildOcrImageCandidates = async (buffer, candidates = OCR_PRIMARY_IMAGE_CANDIDATES) => {
  const prepared = [];
  for (const candidate of candidates) {
    prepared.push({
      ...candidate,
      buffer: await preprocessImage(buffer, candidate.options),
    });
  }
  return prepared;
};

const recognizeImage = async (buffer) => {
  const recognizePrepared = async (prepared) => {
    const worker = await getOcrWorker();
    const startedAt = nowMs();
    console.info('[OCR] OCR Started', {
      imageBytes: Buffer.isBuffer(prepared) ? prepared.length : null,
    });
    perfTime('[OCR PERF] Tesseract');
    let result;
    try {
      result = await worker.recognize(prepared);
    } finally {
      perfTimeEnd('[OCR PERF] Tesseract');
    }
    console.info('[OCR TIMING]', {
      stage: 'tesseract',
      tesseractMs: elapsedMs(startedAt),
      imageBytes: Buffer.isBuffer(prepared) ? prepared.length : null,
    });
    return {
      text: result.data?.text || '',
      confidence: Math.max(0, Math.min(100, Math.round(result.data?.confidence || 0))),
    };
  };
  const run = async () => {
    const primaryCandidates = await buildOcrImageCandidates(buffer);
    const primaryResults = [];
    for (const candidate of primaryCandidates) {
      const recognized = await recognizePrepared(candidate.buffer);
      primaryResults.push({ ...recognized, preprocessing: candidate.label, score: scoreOcrText(recognized) });
    }
    let best = primaryResults.sort((left, right) => right.score - left.score)[0];
    let allResults = [...primaryResults];

    if (
      best?.score < OCR_MIN_ACCEPTABLE_SCORE
      && !isMeaningfulInvoiceText(best?.text)
      && OCR_MAX_FALLBACK_PASSES > 0
    ) {
      const fallbackCandidates = await buildOcrImageCandidates(
        buffer,
        OCR_FALLBACK_IMAGE_CANDIDATES.slice(0, OCR_MAX_FALLBACK_PASSES),
      );
      const fallbackResults = [];
      for (const candidate of fallbackCandidates) {
        const recognized = await recognizePrepared(candidate.buffer);
        fallbackResults.push({ ...recognized, preprocessing: candidate.label, score: scoreOcrText(recognized) });
      }
      allResults = [...primaryResults, ...fallbackResults];
      best = allResults.sort((left, right) => right.score - left.score)[0];
    }
    const merged = mergeRecognizedTexts(allResults);
    best = {
      ...best,
      text: merged.text || best?.text || '',
      mergedPasses: merged.mergedPasses || [],
    };

    debugOcrStage('[OCR EXTRACT] best preprocessing selected', {
      preprocessing: best?.preprocessing || null,
      confidence: best?.confidence || 0,
      score: best?.score || 0,
      textLength: String(best?.text || '').length,
      mergedPasses: best?.mergedPasses?.length || 0,
    });

    return {
      text: best?.text || '',
      confidence: best?.confidence || 0,
      preprocessing: best?.preprocessing || null,
      mergedPasses: best?.mergedPasses || [],
    };
  };
  const recognition = recognitionQueue.then(run, run);
  recognitionQueue = recognition.catch(() => {});
  return recognition;
};

const cleanText = (value) => String(value || '')
  .normalize('NFKC')
  .replace(/\u0000/g, '')
  .replace(/[\u200B-\u200D\uFEFF]/g, '')
  .replace(/[^\S\r\n]+/g, ' ')
  .replace(/ *\r?\n */g, '\n')
  .replace(/\n{3,}/g, '\n\n')
  .trim();

export const isMeaningfulInvoiceText = (value) => {
  const text = cleanText(value);
  if (text.length < 20) return false;
  const internalTokens = text.match(PDF_INTERNAL_TOKENS) || [];
  const words = text.match(/[A-Za-z0-9₹][A-Za-z0-9₹.,:/#&()@+-]*/g) || [];
  const readableChars = (text.match(/[A-Za-z0-9₹]/g) || []).length;
  const readableRatio = readableChars / Math.max(text.length, 1);
  return readableRatio >= 0.35 && words.length >= 4 && internalTokens.length <= Math.max(2, words.length * 0.08);
};

const scoreOcrText = ({ text = '', confidence = 0 } = {}) => {
  const normalized = cleanText(text);
  const fieldSignals = [
    /invoice|inv\.?|bill/i,
    /p\.?\s*o\.?|purchase\s*order/i,
    /vendor|supplier|seller/i,
    /gst(?:in|\s*number|\s*registration)?/i,
    /grand\s*total|invoice\s*total|amount\s*payable|total\s*amount/i,
    /cgst|sgst|igst|taxable|tax/i,
    /qty|quantity|uom|unit\s*price|line\s*total|description/i,
  ].reduce((count, pattern) => count + (pattern.test(normalized) ? 1 : 0), 0);
  const readableLengthScore = Math.min(25, normalized.length / 80);
  const meaningfulBonus = isMeaningfulInvoiceText(normalized) ? 20 : 0;
  return Math.round(confidence + readableLengthScore + meaningfulBonus + (fieldSignals * 8));
};

const normalizeLineForDedupe = (value) => String(value || '')
  .toLowerCase()
  .replace(/[^\w.%/-]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const mergeRecognizedTexts = (results = []) => {
  const sorted = [...results]
    .filter((result) => isMeaningfulInvoiceText(result.text))
    .sort((left, right) => right.score - left.score);
  const best = sorted[0] || results.sort((left, right) => right.score - left.score)[0] || {};
  const lines = [];
  const seen = new Set();
  const addLines = (text) => {
    String(text || '').split('\n').map((line) => line.trim()).filter(Boolean).forEach((line) => {
      const key = normalizeLineForDedupe(line);
      if (!key || seen.has(key)) return;
      seen.add(key);
      lines.push(line);
    });
  };
  addLines(best.text);
  sorted.slice(1).forEach((result) => addLines(result.text));
  return {
    ...best,
    text: cleanText(lines.join('\n')),
    mergedPasses: sorted.map((result) => ({
      preprocessing: result.preprocessing,
      confidence: result.confidence,
      score: result.score,
      textLength: String(result.text || '').length,
    })),
  };
};

const collectMissingExtractedFields = (extractedData = {}) => {
  const sections = ['header', 'vendor', 'company', 'bank', 'references', 'totals', 'terms'];
  return sections.flatMap((section) =>
    Object.entries(extractedData[section] || {})
      .filter(([, value]) => value === null || value === undefined || value === '')
      .map(([field]) => `${section}.${field}`),
  );
};

const isMeaningfulEmbeddedPdfText = (value) => {
  const text = cleanText(value);
  if (!isMeaningfulInvoiceText(text)) return false;
  const wordCount = (text.match(/[A-Za-z0-9₹][A-Za-z0-9₹.,:/#&()@+-]*/g) || []).length;
  const invoiceSignals = [
    /invoice/i,
    /\b(?:PO|purchase\s*order)\b/i,
    /\b(?:GSTIN|PAN|HSN|SAC)\b/i,
    /\b(?:subtotal|grand\s*total|taxable\s*amount)\b/i,
    /\b(?:vendor|supplier|buyer|bill\s*to)\b/i,
  ].filter((pattern) => pattern.test(text)).length;
  return (text.length >= 80 && wordCount >= 12) || invoiceSignals >= 2;
};

const textItemsToLines = (items) => {
  const lines = [];
  let current = [];
  let currentY = null;
  for (const item of items) {
    if (!item?.str) continue;
    const y = Math.round(item.transform?.[5] || 0);
    if (currentY !== null && Math.abs(y - currentY) > 3 && current.length) {
      lines.push(current.join(' '));
      current = [];
    }
    current.push(item.str);
    currentY = y;
    if (item.hasEOL) {
      lines.push(current.join(' '));
      current = [];
      currentY = null;
    }
  }
  if (current.length) lines.push(current.join(' '));
  return cleanText(lines.join('\n'));
};

const renderPdfPage = async (page, scale = PDF_RENDER_SCALE) => {
  const startedAt = nowMs();
  perfTime('[OCR PERF] PDF rendering');
  const viewport = page.getViewport({ scale });
  const canvas = createCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const context = canvas.getContext('2d');
  context.fillStyle = '#ffffff';
  context.fillRect(0, 0, canvas.width, canvas.height);
  try {
    await page.render({ canvasContext: context, viewport }).promise;
  } finally {
    perfTimeEnd('[OCR PERF] PDF rendering');
  }
  console.info('[OCR TIMING]', {
    stage: 'pdfRender',
    pdfRenderMs: elapsedMs(startedAt),
    width: canvas.width,
    height: canvas.height,
    scale,
  });
  return canvas.toBuffer('image/png');
};

const extractPdf = async (buffer) => {
  const startedAt = nowMs();
  perfTime('[OCR PERF] PDF parsing');
  const { getDocument } = await import('pdfjs-dist/legacy/build/pdf.mjs');
  debugOcrStage('[OCR] Starting document preprocessing', {
    documentKind: 'PDF',
    fileSize: buffer.length,
  });
  const loadingTask = getDocument({
    data: new Uint8Array(buffer),
    useSystemFonts: true,
    disableFontFace: false,
    isEvalSupported: false,
  });
  const document = await loadingTask.promise;
  const pagesToProcess = Math.min(document.numPages, OCR_MAX_PAGES);
  console.info('[OCR] PDF Loaded', {
    pageCount: document.numPages,
    pagesToProcess,
    fileSize: buffer.length,
    renderScale: PDF_RENDER_SCALE,
  });
  const pages = [];
  if (ocrDebugEnabled()) console.log('[OCR] Number of pages:', document.numPages);
  debugOcrStage('[OCR] Extracting text from all pages', {
    pageCount: document.numPages,
    pagesToProcess,
    pageLimitApplied: document.numPages > pagesToProcess,
  });
  try {
    for (let pageNumber = 1; pageNumber <= pagesToProcess; pageNumber += 1) {
      const pageStartedAt = nowMs();
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent({ includeMarkedContent: false });
      const embeddedText = textItemsToLines(content.items);
      if (isMeaningfulEmbeddedPdfText(embeddedText)) {
        const embeddedScore = scoreOcrText({ text: embeddedText, confidence: 98 });
        pages.push({ pageNumber, source: 'PDF_TEXT', text: embeddedText, confidence: 98, mergedFromOcr: false, mergedPasses: [] });
        debugOcrStage('[OCR EXTRACT] PDF page processed', {
          pageNumber,
          source: 'PDF_TEXT',
          confidence: 98,
          textLength: embeddedText.length,
          meaningful: true,
          embeddedScore,
          pageMs: elapsedMs(pageStartedAt),
        });
      } else {
        const image = await renderPdfPage(page);
        const recognized = await recognizeImage(image);
        pages.push({ pageNumber, source: 'OCR', ...recognized });
        debugOcrStage('[OCR EXTRACT] PDF page processed', {
          pageNumber,
          source: 'OCR',
          confidence: recognized.confidence,
          textLength: String(recognized.text || '').length,
          meaningful: isMeaningfulInvoiceText(recognized.text),
          reason: 'Embedded PDF text was missing or not meaningful; OCR fallback was used.',
          pageMs: elapsedMs(pageStartedAt),
        });
      }
      page.cleanup();
    }
  } finally {
    if (typeof document.cleanup === 'function') await document.cleanup();
    if (typeof loadingTask.destroy === 'function') await loadingTask.destroy();
  }
  try {
    console.info('[OCR] PDF parsed', {
      pageCount: pages.length,
      totalPages: document.numPages,
      pageLimitApplied: document.numPages > pages.length,
      pages: pages.map((page) => ({
        pageNumber: page.pageNumber,
        source: page.source,
        confidence: page.confidence,
        textLength: String(page.text || '').length,
      })),
    });
    console.info('[OCR TIMING]', {
      stage: 'pdfExtraction',
      pdfExtractionMs: elapsedMs(startedAt),
      pagesProcessed: pages.length,
      totalPages: document.numPages,
    });
    return pages;
  } finally {
    perfTimeEnd('[OCR PERF] PDF parsing');
  }
};

const extractDocumentText = async (file, buffer) => {
  const detectedType = detectDocumentType(buffer);
  if (!detectedType) throw new Error('The uploaded file content is not a supported PDF, PNG, JPEG, or TIFF document.');
  debugOcrStage('[OCR EXTRACT] document type detected', {
    originalFileName: file?.originalname || file?.name || null,
    declaredMimeType: file?.mimetype || file?.type || null,
    detectedType,
    fileSize: buffer.length,
    requiresPdfTextExtraction: detectedType === 'application/pdf',
    requiresImageOcr: detectedType !== 'application/pdf',
  });
  if (detectedType === 'application/pdf') return extractPdf(buffer);
  debugOcrStage('[OCR] Starting document preprocessing', {
    documentKind: 'IMAGE',
    detectedType,
    fileSize: buffer.length,
  });
  if (ocrDebugEnabled()) console.log('[OCR] Number of pages:', 1);
  debugOcrStage('[OCR] Extracting text from all pages', {
    pageCount: 1,
    source: 'OCR',
  });
  const recognized = await recognizeImage(buffer);
  debugOcrStage('[OCR EXTRACT] image OCR completed', {
    source: 'OCR',
    confidence: recognized.confidence,
    textLength: String(recognized.text || '').length,
    meaningful: isMeaningfulInvoiceText(recognized.text),
  });
  return [{ pageNumber: 1, source: 'OCR', ...recognized }];
};

const firstMatch = (text, patterns, transform = (value) => value.trim()) => {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return { value: transform(match[1]), confidence: pattern.confidence || 90 };
  }
  return { value: null, confidence: 0 };
};

const labelledPattern = (labels, valuePattern, flags = 'im', confidence = 94) => {
  const expression = new RegExp(String.raw`(?:${labels})(?=[ \t:#.–-])[ \t]*(?:No\.?|Number|#)?[ \t]*[:\-–]?[ \t]*${valuePattern}`, flags);
  expression.confidence = confidence;
  return expression;
};

const ROBUST_LABEL_SEPARATOR = String.raw`[ \t:;=#|/\\._\-–—]*`;
const ROBUST_LABEL_NUMBER_WORD = String.raw`(?:N[ \t]*[o0]\.?|Num(?:ber)?|Number|#)`;

const robustLabelledPattern = (labels, valuePattern, flags = 'im', confidence = 94) => {
  const expression = new RegExp(String.raw`(?:^|[^\w])(?:${labels})${ROBUST_LABEL_SEPARATOR}(?:${ROBUST_LABEL_NUMBER_WORD}${ROBUST_LABEL_SEPARATOR})?${valuePattern}`, flags);
  expression.confidence = confidence;
  return expression;
};

const KEYWORD_ALIASES = {
  invoiceNumber: [
    'Invoice Number', 'Invoice No', 'Invoice #', 'Inv Number', 'Inv No', 'Inv #',
    'Bill Number', 'Bill No', 'Bill #', 'Tax Invoice Number', 'Tax Invoice No',
    'Tax Invoice #', 'Tax Invoice', 'Document Number', 'Voucher Number',
  ],
  vendorCode: [
    'Vendor Code', 'Vendor ID', 'Vendor No', 'Vendor Number', 'Code',
    'Supplier Code', 'Supplier ID', 'Supplier No', 'Supplier Number',
    'Seller Code', 'Party Code',
  ],
  poNumber: [
    'PO', 'P.O.', 'P.O. No', 'P.O. Number', 'PO No', 'PO Number', 'PO Ref', 'PO Reference', 'Purchase Order',
    'Purchase Order No', 'Purchase Order Number', 'Purchase Order Ref',
    'Buyer Order', 'Order Reference', 'Customer PO',
  ],
  grnNumber: [
    'GRN', 'GRN No', 'GRN Number', 'Goods Receipt', 'Goods Receipt No',
    'Goods Receipt Number', 'Goods Receipt Note', 'Receipt Note',
  ],
  deliveryChallanNumber: [
    'DC', 'DC No', 'DC Number', 'Delivery Challan', 'Delivery Challan No',
    'Delivery Challan Number', 'Delivery Note', 'Challan No', 'Challan Number',
    'Dispatch Document',
  ],
  subtotal: [
    'Subtotal', 'Sub Total', 'Taxable Amount', 'Taxable Value', 'Basic Amount',
    'Basic Value', 'Assessable Amount', 'Assessable Value', 'Item Total',
    'Goods Value', 'Gross Amount', 'Before Tax Amount',
  ],
  grandTotal: [
    'Grand Total', 'Total Amount', 'Invoice Amount', 'Invoice Total',
    'Net Amount', 'Net Payable', 'Amount Payable', 'Total Payable',
    'Payable Amount', 'Bill Amount',
  ],
  invoiceDate: ['Invoice Date', 'Inv Date', 'Invoice Dt', 'Inv Dt', 'Bill Date', 'Date of Invoice'],
  receiptDate: ['Receipt Date', 'Received Date', 'Invoice Receipt Date', 'Invoice Received Date', 'Date Received'],
  dueDate: ['Due Date', 'Payment Due Date', 'Payment Due', 'Due', 'Due On', 'Pay By', 'Due Dt', 'Payment Date'],
  poDate: ['PO Date', 'Purchase Order Date', 'Order Date'],
  status: ['Invoice Status', 'Payment Status', 'Status'],
  priority: ['Priority', 'Invoice Priority', 'Payment Priority', 'Urgency'],
  invoiceCategory: ['Invoice Category', 'Invoice Type', 'Document Type', 'Category'],
  currency: ['Currency', 'Invoice Currency', 'Billing Currency'],
  paymentTerms: ['Payment Terms', 'Credit Terms', 'Credit Days', 'Terms of Payment', 'Payment Condition', 'Terms'],
  vendorName: ['Vendor Name', 'Vendor', 'Supplier Name', 'Supplier', 'Seller Name', 'Company Name', 'Billed From', 'From'],
  vendorCategory: ['Vendor Category', 'Supplier Category'],
  vendorType: ['Vendor Type', 'Supplier Type'],
  contactPerson: ['Contact Person', 'Vendor Contact', 'Supplier Contact', 'Contact'],
  phone: ['Vendor Phone', 'Vendor Mobile', 'Supplier Phone', 'Supplier Mobile', 'Phone', 'Mobile'],
  email: ['Vendor Email', 'Supplier Email', 'Seller Email', 'Email'],
  vendorAddress: ['Vendor Address', 'Supplier Address', 'Seller Address', 'Address'],
  discount: ['Total Discount', 'Discount', 'Less Discount', 'Trade Discount'],
  taxableAmount: ['Taxable Amount', 'Taxable Value', 'Assessable Amount', 'Assessable Value', 'Taxable Total'],
  cgst: ['CGST', 'CGST Amount', 'CGST Total', 'Central GST'],
  sgst: ['SGST', 'SGST Amount', 'SGST Total', 'State GST'],
  igst: ['IGST', 'IGST Amount', 'IGST Total', 'Integrated GST'],
  gstTotal: ['GST Total', 'Total GST', 'Tax Total', 'Total Tax', 'GST Amount', 'Tax Amount'],
  roundOff: ['Round Off', 'Rounded Off', 'Rounding Off', 'Rounding Adjustment'],
  amountInWords: ['Amount in Words', 'Rupees in Words', 'Total in Words', 'Invoice Amount in Words'],
  remarks: ['Remarks', 'Remark', 'Notes', 'Narration', 'Comments'],
  bankName: ['Bank Name', 'Vendor Bank Name', 'Beneficiary Bank Name', 'Beneficiary Bank'],
  branch: ['Branch', 'Branch Name', 'Bank Branch'],
  accountHolder: ['Account Holder', 'Account Name', 'A/C Name', 'Beneficiary Name'],
  accountNumber: ['Account Number', 'Account No', 'Acc Number', 'Acc No', 'A/C'],
  ifsc: ['IFSC', 'IFSC Code', 'Bank IFSC'],
};

export const OCR_FIELD_EXTRACTION_MAP = Object.freeze({
  invoice: {
    invoiceNumber: KEYWORD_ALIASES.invoiceNumber,
    invoiceDate: KEYWORD_ALIASES.invoiceDate,
    receiptDate: KEYWORD_ALIASES.receiptDate,
    dueDate: KEYWORD_ALIASES.dueDate,
    invoiceCategory: KEYWORD_ALIASES.invoiceCategory,
    currency: KEYWORD_ALIASES.currency,
    paymentTerms: KEYWORD_ALIASES.paymentTerms,
  },
  vendor: {
    vendorCode: KEYWORD_ALIASES.vendorCode,
    vendorName: KEYWORD_ALIASES.vendorName,
    gstNumber: ['GSTIN', 'GST Number', 'GST No', 'GST Identification Number'],
    pan: ['PAN', 'PAN Number'],
    email: KEYWORD_ALIASES.email,
    phone: KEYWORD_ALIASES.phone,
  },
  references: {
    poNumber: KEYWORD_ALIASES.poNumber,
    grnNumber: KEYWORD_ALIASES.grnNumber,
    deliveryChallanNumber: KEYWORD_ALIASES.deliveryChallanNumber,
  },
  items: {
    itemCode: ['Item Code', 'Product Code', 'SKU'],
    itemName: ['Item Name', 'Product Name', 'Description'],
    description: ['Description', 'Item Description', 'Product Description'],
    quantity: ['Quantity', 'Qty'],
    unit: ['Unit', 'UOM'],
    unitPrice: ['Unit Price', 'Rate', 'Price'],
    taxableAmount: ['Taxable Amount', 'Taxable Value'],
    cgst: ['CGST', 'CGST %', 'CGST Amount'],
    sgst: ['SGST', 'SGST %', 'SGST Amount'],
    igst: ['IGST', 'IGST %', 'IGST Amount'],
    gstAmount: ['GST', 'GST Amount'],
  },
  totals: {
    subtotal: ['Subtotal', 'Sub Total', 'Taxable Amount', 'Taxable Total'],
    grandTotal: KEYWORD_ALIASES.grandTotal,
    discount: KEYWORD_ALIASES.discount,
    taxableAmount: KEYWORD_ALIASES.taxableAmount,
    cgst: KEYWORD_ALIASES.cgst,
    sgst: KEYWORD_ALIASES.sgst,
    igst: KEYWORD_ALIASES.igst,
    totalTax: KEYWORD_ALIASES.gstTotal,
    otherCharges: ['Other Charges', 'Freight', 'Shipping Charges', 'Packing Charges', 'Handling Charges', 'Additional Charges'],
    roundOff: KEYWORD_ALIASES.roundOff,
  },
  payment: {
    paymentTerms: KEYWORD_ALIASES.paymentTerms,
    bankName: KEYWORD_ALIASES.bankName,
    accountHolder: KEYWORD_ALIASES.accountHolder,
    accountNumber: KEYWORD_ALIASES.accountNumber,
    ifsc: KEYWORD_ALIASES.ifsc,
    branch: KEYWORD_ALIASES.branch,
  },
});

const OCR_LABEL_CHAR_CLASSES = {
  a: '[a@]', b: '[b8]', c: '[c(<]', d: '[d]', e: '[e3]', g: '[g69]',
  i: '[iIl1!|]', l: '[lI1|]', n: '[n]', o: '[oO0]', p: '[p]', q: '[q9]',
  r: '[r]', s: '[sS5$]', t: '[tT7]', v: '[v]', y: '[y]', z: '[z2]',
};

const escapeRegexLiteral = (value) => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const fuzzyLabelWord = (word) => {
  if (word === '#') return String.raw`(?:#|${ROBUST_LABEL_NUMBER_WORD})`;
  return [...word].map((char) => {
    if (/\s/.test(char) || /[./_-]/.test(char)) return ROBUST_LABEL_SEPARATOR;
    const lower = char.toLowerCase();
    return OCR_LABEL_CHAR_CLASSES[lower] || escapeRegexLiteral(char);
  }).join(ROBUST_LABEL_SEPARATOR);
};

const fuzzyAliasPattern = (alias) => String(alias || '')
  .trim()
  .split(/\s+/)
  .filter(Boolean)
  .map(fuzzyLabelWord)
  .join(ROBUST_LABEL_SEPARATOR);

const fuzzyLabelledPattern = (aliases, valuePattern, flags = 'im', confidence = 86) => {
  const cacheKey = `fuzzy:${flags}:${confidence}:${valuePattern}:${aliases.join('\u001f')}`;
  if (regexCache.has(cacheKey)) return regexCache.get(cacheKey);
  const labels = aliases.map(fuzzyAliasPattern).filter(Boolean).join('|');
  const expression = new RegExp(String.raw`(?:^|[^\w])(?:${labels})${ROBUST_LABEL_SEPARATOR}(?:${ROBUST_LABEL_NUMBER_WORD}${ROBUST_LABEL_SEPARATOR})?${valuePattern}`, flags);
  expression.confidence = confidence;
  regexCache.set(cacheKey, expression);
  return expression;
};

const labelledKeywordPattern = (aliases, valuePattern, flags = 'im', confidence = 94) => {
  const cacheKey = `exact:${flags}:${confidence}:${valuePattern}:${aliases.join('\u001f')}`;
  if (regexCache.has(cacheKey)) return regexCache.get(cacheKey);
  const labels = aliases.map((alias) =>
    escapeRegexLiteral(alias)
      .replace(/\\ /g, String.raw`\s*`)
      .replace(/\\#/g, '#'),
  ).join('|');
  const expression = robustLabelledPattern(labels, valuePattern, flags, confidence);
  regexCache.set(cacheKey, expression);
  return expression;
};

const normalizeKeywordLabel = (value) => String(value || '')
  .normalize('NFKC')
  .toLowerCase()
  .replace(/[0]/g, 'o')
  .replace(/[1!|]/g, 'l')
  .replace(/[5$]/g, 's')
  .replace(/[6]/g, 'g')
  .replace(/[7]/g, 't')
  .replace(/[^a-z#]+/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const levenshteinDistance = (left, right) => {
  const a = normalizeKeywordLabel(left);
  const b = normalizeKeywordLabel(right);
  if (a === b) return 0;
  if (!a) return b.length;
  if (!b) return a.length;
  const distances = Array.from({ length: b.length + 1 }, (_, index) => index);
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = distances[0];
    distances[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const insert = distances[j] + 1;
      const remove = distances[j - 1] + 1;
      const replace = diagonal + (a[i - 1] === b[j - 1] ? 0 : 1);
      diagonal = distances[j];
      distances[j] = Math.min(insert, remove, replace);
    }
  }
  return distances[b.length];
};

const keywordSimilarity = (left, right) => {
  const a = normalizeKeywordLabel(left);
  const b = normalizeKeywordLabel(right);
  return 1 - (levenshteinDistance(a, b) / Math.max(a.length, b.length, 1));
};

const findFuzzyLineValue = (text, aliases, valuePattern, transform) => {
  const valueRegex = new RegExp(String.raw`^\s*${valuePattern}`, 'i');
  const separatorPattern = /[:;=#|/\\._\-\s]{1,}/g;
  const lines = String(text || '').split('\n').map((line) => line.trim()).filter(Boolean);
  for (const line of lines) {
    const matches = [...line.matchAll(separatorPattern)].filter((match) => match.index > 1);
    for (const match of matches) {
      const labelCandidate = line.slice(0, match.index).trim();
      const bestScore = Math.max(...aliases.map((alias) => keywordSimilarity(labelCandidate, alias)));
      if (bestScore < 0.82) continue;
      const rawValue = line.slice(match.index + match[0].length).replace(/^[#:=|/\\._\-\s]+/g, '').trim();
      const valueMatch = rawValue.match(valueRegex);
      if (valueMatch?.[1] || valueMatch?.[0]) {
        return { value: transform(valueMatch[1] || valueMatch[0]), confidence: Math.round(70 + (bestScore * 18)) };
      }
    }
  }
  return { value: null, confidence: 0 };
};

const findKeywordValue = (text, aliases, valuePattern, transform = (value) => value.trim(), confidence = 94) => {
  const exact = firstMatch(text, [labelledKeywordPattern(aliases, valuePattern, 'im', confidence)], transform);
  if (exact.value !== null && exact.value !== '') return exact;
  const fuzzyRegex = firstMatch(text, [fuzzyLabelledPattern(aliases, valuePattern, 'im', Math.max(78, confidence - 8))], transform);
  if (fuzzyRegex.value !== null && fuzzyRegex.value !== '') return fuzzyRegex;
  return findFuzzyLineValue(text, aliases, valuePattern, transform);
};

const normalizeDate = (value) => {
  if (!value) return null;
  const monthNames = {
    jan: 1, january: 1,
    feb: 2, february: 2,
    mar: 3, march: 3,
    apr: 4, april: 4,
    may: 5,
    jun: 6, june: 6,
    jul: 7, july: 7,
    aug: 8, august: 8,
    sep: 9, sept: 9, september: 9,
    oct: 10, october: 10,
    nov: 11, november: 11,
    dec: 12, december: 12,
  };
  const text = value.trim().replace(/,/g, '').replace(/\s+/g, ' ');
  const namedDate = text.match(new RegExp(String.raw`^(?:(\d{1,2})\s+(${MONTH_NAME})|(${MONTH_NAME})\s+(\d{1,2}))\s+(\d{2,4})$`, 'i'));
  if (namedDate) {
    const day = Number(namedDate[1] || namedDate[4]);
    const month = monthNames[String(namedDate[2] || namedDate[3]).toLowerCase()];
    let year = Number(namedDate[5]);
    if (year < 100) year += year >= 70 ? 1900 : 2000;
    const parsed = new Date(Date.UTC(year, month - 1, day));
    if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
    return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
  }
  const parts = text.split(/[./-]/).map(Number);
  if (parts.length !== 3 || parts.some(Number.isNaN)) return null;
  let [first, second, third] = parts;
  let year;
  let month;
  let day;
  if (first > 999) [year, month, day] = [first, second, third];
  else {
    [day, month, year] = [first, second, third];
    if (year < 100) year += year >= 70 ? 1900 : 2000;
  }
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (parsed.getUTCFullYear() !== year || parsed.getUTCMonth() !== month - 1 || parsed.getUTCDate() !== day) return null;
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const numberValue = (value) => {
  const parsed = Number(String(value || '').replace(/,/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
};

const boundedScore = (value) => Math.max(0, Math.min(100, Math.round(Number(value) || 0)));

const normalizeCurrency = (value) => {
  const normalized = String(value || '').trim().toUpperCase().replace(/\./g, '');
  if (/^(₹|Â₹|â‚¹|RS|INR|RUPEES?)$/.test(normalized)) return 'INR';
  return /^(INR|USD|EUR|GBP|AED)$/.test(normalized) ? normalized : null;
};

const cleanTextValue = (value) => String(value || '')
  .replace(/\s{2,}.*$/, '')
  .replace(/[|]+$/g, '')
  .trim();

const normalizeOcrTyposForParsing = (value) => String(value || '')
  .replace(/\r\n?/g, '\n')
  .replace(/[“”]/g, '"')
  .replace(/[‘’]/g, "'")
  .replace(/[‐‑‒–—−]/g, '-')
  .replace(/₹/g, 'INR ')
  .replace(/\b[lI1]nvoice\b/gi, 'Invoice')
  .replace(/\b[lI1]nv\b/gi, 'Inv')
  .replace(/\bB[il1]ll\b/gi, 'Bill')
  .replace(/\bP[O0]\b/gi, 'PO')
  .replace(/\bP\s*[O0]\b/gi, 'PO')
  .replace(/\bG\s*R\s*N\b/gi, 'GRN')
  .replace(/\bD\s*C\b/gi, 'DC')
  .replace(/\bG[S5]\s*T\s*[lI1]?\s*N\b/gi, 'GSTIN')
  .replace(/\bG[S5]\s*T\b/gi, 'GST')
  .replace(/\b[Pp][Aa][Nn]\b/g, 'PAN')
  .replace(/\b[I1]F[S5]C\b/gi, 'IFSC')
  .replace(/\bA[\/\\]C\b/gi, 'Account')
  .replace(/\bQuant[il1]ty\b/gi, 'Quantity')
  .replace(/\bUn[il1]t\s*Pr[il1]ce\b/gi, 'Unit Price')
  .replace(/\bTaxab[il1]e\b/gi, 'Taxable')
  .replace(/\bTota[il1]\b/gi, 'Total')
  .replace(/\bTerme\b/gi, 'Terms');

const NEXT_FIELD_LABELS = String.raw`Tax\s*Invoice\s*(?:No\.?|Number|#)?|Invoice\s*(?:No\.?|Number|#|Date|Dt\.?)|Inv\.?\s*(?:No\.?|Number|#|Date|Dt\.?)|Bill\s*(?:No\.?|Number|#|Date)|Due\s*Date|Date|Payment\s*(?:Due|Terms?|Terme)|Credit\s*Days?|PO\s*(?:No\.?|Number|#|Date)?|Purchase\s*Order(?:\s*(?:No\.?|Number|#|Date))?|GRN(?:\s*(?:No\.?|Number|#))?|Goods\s*Receipt(?:\s*Note)?|Delivery\s*Challan(?:\s*(?:No\.?|Number|#))?|Delivery\s*Note|DC(?:\s*(?:No\.?|Number|#))?|Vendor\s*(?:Name|Code|ID|No\.?|Number|GSTIN|GST|PAN|Bank|Email|Phone|Mobile|Address)|Supplier\s*(?:Name|Code|ID|No\.?|Number|GSTIN|GST|PAN|Bank|Email|Phone|Mobile|Address)|Company\s*(?:Name|Code)?|GSTIN|GST\s*(?:Number|Registration\s*Number)?|PAN(?:\s*Number)?|Contact\s*Person|Email|Phone|Mobile|Currency|Item\s*(?:Code|Name|Description|Total)|Product\s*(?:Code|Name)|Description|Quantity|Qty|UOM|Unit\s*Price|Unit|Price|Rate|Taxable\s*(?:Amount|Value)|GST\s*(?:Rate|Amount|%)|Tax\s*(?:Rate|Amount|Total)?|CGST|SGST|IGST|Subtotal|Sub\s*Total|Grand\s*Total|Total\s*Amount|Line\s*Total|Round\s*Off|Discount|Bank\s*Name|Branch|Account\s*(?:Holder|Name|Number|No)|A\/C|IFSC`;

const trimAtNextLabel = (value) => cleanTextValue(String(value || '')
  .replace(new RegExp(String.raw`\s+(?:${NEXT_FIELD_LABELS})\b[\s:#.=/-]*.*$`, 'i'), ''));

const cleanIdentifier = (value) => String(value || '')
  .replace(/^[#:=|/\\._\-\s]+|[#:=|/\\._\-\s]+$/g, '')
  .replace(/\s+/g, '')
  .toUpperCase();

const cleanLabelledIdentifier = (value) => cleanIdentifier(trimAtNextLabel(value));

const cleanInvoiceIdentifier = (value) => cleanLabelledIdentifier(value)
  .replace(/^1NV/, 'INV')
  .replace(/^LNV/, 'INV')
  .replace(/^I[NM][VY]/, 'INV');

const cleanPoIdentifier = (value) => {
  const cleaned = cleanLabelledIdentifier(value)
    .replace(/^P0/, 'PO')
    .replace(/^P\/?O([/-])?/, 'PO$1');
  if (/^\d{4}\/\d{4,8}$/.test(cleaned)) return `PO/${cleaned}`;
  if (/^\d{4}-\d{4,8}$/.test(cleaned)) return `PO-${cleaned}`;
  return cleaned;
};

const cleanGrnIdentifier = (value) => {
  const cleaned = cleanLabelledIdentifier(value)
    .replace(/^6RN/, 'GRN')
    .replace(/^G[PR][NM]/, 'GRN');
  if (/^\d{4}\/\d{4,8}$/.test(cleaned)) return `GRN/${cleaned}`;
  if (/^\d{4}-\d{4,8}$/.test(cleaned)) return `GRN-${cleaned}`;
  return cleaned;
};

const cleanDeliveryChallanIdentifier = (value) => {
  const cleaned = cleanLabelledIdentifier(value)
    .replace(/^D0/, 'DC')
    .replace(/^0C/, 'DC');
  if (/^\d{4}\/\d{4,8}$/.test(cleaned)) return `DC/${cleaned}`;
  if (/^\d{4}-\d{4,8}$/.test(cleaned)) return `DC-${cleaned}`;
  return cleaned;
};

const cleanVendorCodeIdentifier = (value) => cleanLabelledIdentifier(value)
  .replace(/^VNO/, 'VND')
  .replace(/^VMD/, 'VND');

const cleanTaxIdentifier = (value) => cleanLabelledIdentifier(value)
  .replace(/[^A-Z0-9]/g, '');

const parseUomFromLine = (line) => {
  const match = String(line || '').match(/\b(NOS?|PCS?|PIECES?|EA|EACH|KG|KGS|GM|GMS|LTR|LITRE|LITER|ML|MTR|METER|METRE|BOX|PACK|PKT|SET|UNIT|HRS?|DAYS?)\b/i);
  return match ? match[1].toUpperCase() : null;
};

const nonMoneyTokens = (line) => String(line || '')
  .split(/\s+/)
  .map((token) => token.replace(/[|,]/g, '').trim())
  .filter(Boolean);

const looksLikeItemCode = (token) =>
  /^[A-Z0-9][A-Z0-9./_-]{1,29}$/i.test(token || '')
  && /\d/.test(token || '');

const extractParty = (text, role) => {
  const vendor = role === 'vendor';
  const nameLabels = vendor
    ? 'Vendor\\s*Name|Supplier\\s*Name|Company\\s*Name|Seller\\s*Name|Billed\\s*From|From'
    : 'Buyer(?:\\s*Name)?|Company(?:\\s*Name)?|Bill(?:ed)?\\s*To|Ship\\s*To';
  const name = vendor ? findKeywordValue(
    text,
    KEYWORD_ALIASES.vendorName,
    String.raw`([^\n|]{2,100})`,
    trimAtNextLabel,
    88,
  ) : firstMatch(text, [
    labelledPattern(nameLabels, String.raw`([^\n|]{2,100})`, 'im', 88),
  ], trimAtNextLabel);
  if (vendor && !name.value) {
    const genericName = firstMatch(text, [
      Object.assign(
        /(?:^|\n)\s*(?:Vendor|Supplier|Seller)\s+((?!(?:Code|ID|No\.?|Number|GST|GSTIN|PAN|Email|Phone|Mobile|Address)\b)[^\n|]{2,100})/im,
        { confidence: 74 },
      ),
    ], trimAtNextLabel);
    Object.assign(name, genericName);
  }

  const address = vendor ? findKeywordValue(
    text,
    KEYWORD_ALIASES.vendorAddress,
    String.raw`([^\n]{5,200}(?:\n(?!\s*(?:PO|P\.?\s*O\.?|GRN|DC|Delivery\s*Challan|Challan|Invoice|Bill|GST|GSTIN|PAN|Email|Phone|Mobile|Currency|Payment|Subtotal|Sub\s*Total|Taxable|CGST|SGST|IGST|Grand\s*Total)\b)(?![A-Za-z][A-Za-z\s]{0,40}\s*:)[^\n]{3,120})?)`,
    trimAtNextLabel,
    82,
  ) : firstMatch(text, [
    labelledPattern(
      vendor ? 'Vendor\\s*Address|Supplier\\s*Address|Address' : 'Buyer\\s*Address|Billing\\s*Address',
      String.raw`([^\n]{5,200}(?:\n(?!\s*(?:PO|P\.?\s*O\.?|GRN|DC|Delivery\s*Challan|Challan|Invoice|Bill|GST|GSTIN|PAN|Email|Phone|Mobile|Currency|Payment|Subtotal|Sub\s*Total|Taxable|CGST|SGST|IGST|Grand\s*Total)\b)(?![A-Za-z][A-Za-z\s]{0,40}\s*:)[^\n]{3,120})?)`,
      'im',
      82,
    ),
  ]);

  return { name, address };
};

const findContextualIdentifier = (text, pattern, labels) => {
  const labelled = firstMatch(text, [
    robustLabelledPattern(labels, `(${pattern.source.replace(/^\\b|\\b$/g, '')})`, 'im', 96),
  ], (value) => (/^(₹|Rs\.?|INR)$/i.test(String(value).trim()) ? 'INR' : value.toUpperCase()));
  if (labelled.value) return labelled;
  const values = [...text.matchAll(new RegExp(pattern.source, 'gi'))];
  if (values.length === 1) return { value: values[0][0].toUpperCase(), confidence: 72 };
  return { value: null, confidence: 0 };
};

const findContextualValue = (text, valuePattern, labels, transform = (value) => value.trim()) => {
  const labelled = firstMatch(text, [robustLabelledPattern(labels, valuePattern, 'im', 94)], transform);
  if (labelled.value) return labelled;
  const capturePattern = new RegExp(valuePattern, 'gi');
  const values = [...text.matchAll(capturePattern)].map((match) => transform(match[1] || match[0]));
  const unique = [...new Set(values)];
  return unique.length === 1 ? { value: unique[0], confidence: 72 } : { value: null, confidence: 0 };
};

const findTaxIdentifier = (text, pattern, labels, validator) => {
  const exact = findContextualIdentifier(text, pattern, labels);
  if (exact.value) return { value: cleanTaxIdentifier(exact.value), confidence: exact.confidence };
  const loose = firstMatch(text, [
    robustLabelledPattern(labels, String.raw`([A-Z0-9][A-Z0-9\s._-]{8,32})`, 'im', 84),
  ], cleanTaxIdentifier);
  if (loose.value && validator(loose.value)) return loose;
  const compactText = cleanTaxIdentifier(text);
  const compactMatches = [...compactText.matchAll(new RegExp(pattern.source, 'gi'))].map((match) => cleanTaxIdentifier(match[0]));
  const unique = [...new Set(compactMatches)];
  return unique.length === 1 ? { value: unique[0], confidence: 68 } : { value: null, confidence: 0 };
};

const isValidGstin = (value) => /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/i.test(cleanTaxIdentifier(value));
const isValidPan = (value) => /^[A-Z]{5}\d{4}[A-Z]$/i.test(cleanTaxIdentifier(value));

const detectBusinessDocumentType = (text) => {
  const rules = [
    ['CREDIT_NOTE', /\bcredit\s*note\b/i],
    ['DEBIT_NOTE', /\bdebit\s*note\b/i],
    ['PROFORMA_INVOICE', /\bpro[\s-]*forma\s*invoice\b/i],
    ['TAX_INVOICE', /\btax\s*invoice\b/i],
    ['INVOICE', /\b(?:invoice|bill)\s*(?:no|number|#|date)\b/i],
    ['DELIVERY_CHALLAN', /(?:^|\n)\s*delivery\s*challan(?:\s*(?:no|number|#))?/im],
    ['GRN', /(?:^|\n)\s*(?:goods\s*receipt\s*note|GRN)(?:\s*(?:no|number|#))?/im],
    ['PURCHASE_ORDER', /\b(?:purchase\s*order|P\.?\s*O\.?)\s*(?:no|number|#|date)\b/i],
  ];
  for (const [type, pattern] of rules) {
    if (pattern.test(text)) return type;
  }
  return 'UNKNOWN';
};

const parseLineItemLine = (line, tableHeader = '') => {
  if (/^(?:sub\s*total|taxable\s*(?:amount|value)|cgst|sgst|igst|cess|tax\s*total|grand\s*total|amount\s*in\s*words|page\s+\d+)/i.test(line)) return null;
  const amounts = [...line.matchAll(/-?\d[\d,]*(?:\.\d{1,3})?%?/g)];
  if (amounts.length < 3) return null;
  const rawValues = amounts.map((match) => match[0]);
  const headerHasHsn = /\bhsn|sac\b/i.test(tableHeader);
  const headerHasItemCode = /\b(?:item|material|product|part)\s*(?:code|no\.?|number)|\bsku\b/i.test(tableHeader);
  const headerHasUom = /\buom\b|\bunit\b/i.test(tableHeader);
  const leadingItemCodeMatch = headerHasItemCode
    ? line.match(/^\s*(?:\d+[.)]\s*)?([A-Z0-9][A-Z0-9./_-]{0,29})\s+(.+)$/i)
    : null;
  const hsnIndex = headerHasHsn
    ? rawValues.findIndex((value) => /^\d{4,8}$/.test(value.replace(/,/g, '')))
    : -1;
  const leadingCodeConsumesFirstNumber = Boolean(
    leadingItemCodeMatch
    && amounts[0]
    && leadingItemCodeMatch[1].replace(/,/g, '') === amounts[0][0].replace(/,/g, ''),
  );
  const valueOffset = hsnIndex >= 0 ? hsnIndex + 1 : leadingCodeConsumesFirstNumber ? 1 : 0;
  const descriptionEnd = hsnIndex >= 0
    ? amounts[hsnIndex].index
    : leadingCodeConsumesFirstNumber && amounts[1]
      ? amounts[1].index
      : amounts[0].index;
  const textPrefix = line.slice(0, descriptionEnd).replace(/^\s*\d+[.)]?\s+/, '').trim();
  const tokens = nonMoneyTokens(textPrefix);
  const possibleItemCode = leadingItemCodeMatch?.[1]
    ? cleanIdentifier(leadingItemCodeMatch[1])
    : headerHasItemCode || looksLikeItemCode(tokens[0] || '')
      ? cleanIdentifier(tokens[0] || '')
      : null;
  const codePrefixPattern = possibleItemCode ? new RegExp(`^${escapeRegexLiteral(possibleItemCode)}\\s*`, 'i') : null;
  const rawDescription = cleanTextValue(possibleItemCode
    ? textPrefix.replace(codePrefixPattern, '')
    : textPrefix);
  if (!rawDescription || rawDescription.length < 2 || /^(?:invoice|date|po|grn|challan|gstin|phone|total)/i.test(rawDescription)) return null;

  const values = rawValues.map((value) => numberValue(value.replace('%', '')));
  const possibleHsn = hsnIndex >= 0 ? rawValues[hsnIndex].replace(/,/g, '') : null;
  if (values.length - valueOffset < 3) return null;
  const quantity = values[valueOffset];
  const unitPrice = values[valueOffset + 1];
  const preliminaryTotal = values.at(-1);
  if (!(quantity > 0) || unitPrice === null || preliminaryTotal === null) return null;

  const percentages = rawValues.filter((value) => value.includes('%')).map((value) => numberValue(value.replace('%', '')));
  const headerHasCgst = /\bcgst\b/i.test(tableHeader);
  const headerHasSgst = /\bsgst\b/i.test(tableHeader);
  const headerHasIgst = /\bigst\b/i.test(tableHeader);
  const headerHasDiscount = /\bdiscount|disc\.?\b/i.test(tableHeader);
  const taxRate = percentages[0] ?? null;
  const numericValues = rawValues
    .map((value, index) => ({ value: values[index], raw: value, index }))
    .filter((entry) => !entry.raw.includes('%') && Number.isFinite(entry.value));
  const total = numericValues.at(-1)?.value ?? preliminaryTotal;
  const numericAfterBase = numericValues
    .filter((entry) => entry.index > valueOffset + 1 && entry.value !== total)
    .map((entry) => entry.value);
  const expectedTaxable = quantity * unitPrice;
  const taxableFromMath = numericAfterBase.find((value) => Math.abs(value - expectedTaxable) <= Math.max(1, expectedTaxable * 0.01));
  const taxableIndex = values.length - valueOffset >= 4 ? valueOffset + 2 : null;
  const taxable = taxableFromMath
    ?? (/\btaxable|basic|assessable\b/i.test(tableHeader) && numericAfterBase.length ? numericAfterBase.at(-1) : null)
    ?? (taxableIndex !== null ? values[taxableIndex] : expectedTaxable);
  const expectedGstAmount = taxRate !== null && taxable !== null ? taxable * (taxRate / 100) : null;
  const gstAmountFromRate = expectedGstAmount !== null
    ? numericAfterBase.find((value) => Math.abs(value - expectedGstAmount) <= Math.max(1, expectedGstAmount * 0.02))
    : null;
  const gstAmount = gstAmountFromRate ?? (numericValues.length >= 4 ? numericValues.at(-2)?.value ?? null : null);
  const unit = headerHasUom ? parseUomFromLine(line) : parseUomFromLine(textPrefix);

  return {
    itemName: rawDescription,
    description: rawDescription,
    itemCode: possibleItemCode,
    hsnSac: possibleHsn,
    hsnCode: possibleHsn,
    quantity,
    unit,
    uom: unit,
    unitPrice,
    discount: headerHasDiscount ? 0 : null,
    taxableAmount: taxable,
    taxRate,
    gstRate: taxRate,
    cgstRate: headerHasCgst ? percentages[0] ?? null : null,
    cgstAmount: headerHasCgst ? gstAmount : null,
    cgst: null,
    sgstRate: headerHasSgst ? percentages[headerHasCgst ? 1 : 0] ?? null : null,
    sgstAmount: headerHasSgst ? gstAmount : null,
    sgst: null,
    igstRate: headerHasIgst ? percentages[0] ?? null : null,
    igstAmount: headerHasIgst ? gstAmount : null,
    igst: null,
    gstAmount,
    taxAmount: gstAmount,
    cess: null,
    lineTotal: total,
    total,
  };
};

const extractLineItems = (text, allowContinuation = false, inheritedHeader = '') => {
  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean);
  const headerIndex = lines.findIndex((line) =>
    /description|particulars|item\s*(?:name|description)|product|material|service|hsn|sac/i.test(line)
    && /qty|quantity|uom|unit|rate|price|taxable|gst|amount|total/i.test(line)
  );
  if (headerIndex < 0 && !allowContinuation) return [];
  const tableHeader = headerIndex >= 0 ? lines[headerIndex] : inheritedHeader;
  const items = [];
  for (const line of lines.slice(Math.max(0, headerIndex + 1))) {
    const item = parseLineItemLine(line, tableHeader);
    if (item) items.push(item);
  }
  return items.slice(0, 500);
};

const extractLabelledLineItems = (text) => {
  let itemSection = String(text || '').match(
    /(?:^|\n)\s*(?:items?|invoice\s*items?|item\s*details?|line\s*items?|line\s*item)\s*:?\s*\n([\s\S]*?)(?=\n\s*(?:financial\s*summary|tax\s*summary|vendor\s*payment|payment\s*details|bank\s*details|subtotal|sub\s*total|grand\s*total|amount\s*in\s*words)\b|$)/i,
  )?.[1] || text;
  if (itemSection === text) {
    const firstItemIndex = String(text || '').search(/\b(?:Item\s*Code|Item\s*Name|Product\s*Code|Product\s*Name|Description|Particulars)\b/i);
    if (firstItemIndex >= 0) itemSection = String(text || '').slice(firstItemIndex);
  }

  const valueFromSection = (labels, valuePattern, transform = (value) => value.trim(), confidence = 88) =>
    firstMatch(itemSection, [labelledPattern(labels, valuePattern, 'im', confidence)], transform);

  const itemCode = valueFromSection(
    String.raw`Item\s*Code|Item\s*ID|Item\s*No\.?|Item\s*Number|Product\s*Code|Product\s*ID|Product\s*No\.?|SKU|Part\s*No\.?|Material\s*Code|Material\s*No\.?|Code`,
    String.raw`([A-Z0-9][A-Z0-9./_-]{0,39})`,
    (value) => value.toUpperCase(),
    92,
  );
  const itemName = valueFromSection(
    String.raw`Item\s*Name|Product\s*Name|Material\s*Name|Service\s*Name|Description|Particulars`,
    String.raw`([^\n|]{2,120})`,
    trimAtNextLabel,
    90,
  );
  const description = valueFromSection(
    String.raw`Description|Item\s*Description|Product\s*Description|Particulars`,
    String.raw`([^\n|]{2,160})`,
    trimAtNextLabel,
    86,
  );
  const hsnCode = valueFromSection(
    String.raw`HSN(?:\s*/\s*SAC)?|SAC|HSN\s*Code|SAC\s*Code`,
    String.raw`([A-Z0-9][A-Z0-9./_-]{2,19})`,
    (value) => value.toUpperCase(),
    88,
  );
  const quantity = valueFromSection(String.raw`Quantity|Qty|QTY|No\.?\s*of\s*Units?|Units?|Pcs`, MONEY_VALUE, numberValue, 92);
  const unit = valueFromSection(
    String.raw`UOM|Unit(?!\s*Price)`,
    String.raw`([A-Z]{1,12})`,
    (value) => value.toUpperCase(),
    86,
  );
  const unitFromQuantity = firstMatch(itemSection, [
    Object.assign(/\b(?:Quantity|Qty)\b[\s:#.=/-]*[-+]?\d[\d,]*(?:\.\d{1,2})?\s+([A-Z]{1,12})\b/i, { confidence: 84 }),
  ], (value) => value.toUpperCase());
  const resolvedUnit = unit.value || unitFromQuantity.value;
  const unitPrice = valueFromSection(String.raw`Unit\s*Price|Unit\s*Rate|Rate|Price|Basic\s*Rate|Item\s*Rate`, MONEY_VALUE, numberValue, 92);
  const discount = valueFromSection(String.raw`Discount|Disc\.?`, MONEY_VALUE, numberValue, 82);
  const taxableAmount = valueFromSection(String.raw`Taxable\s*(?:Amount|Value)`, MONEY_VALUE, numberValue, 92);
  const gstRate = valueFromSection(
    String.raw`GST\s*(?:Rate|%)?|GST|Tax\s*Rate`,
    String.raw`(\d{1,2}(?:\.\d{1,2})?)\s*%?`,
    numberValue,
    86,
  );
  const gstAmount = valueFromSection(String.raw`GST\s*Amount|Tax\s*Amount`, MONEY_VALUE, numberValue, 90);
  const igstAmount = valueFromSection(String.raw`IGST(?:\s*(?:Amount|Total))?|Integrated\s*GST`, MONEY_VALUE, numberValue, 90);
  const lineTotal = valueFromSection(String.raw`Line\s*Total|Item\s*Total|Total\s*Amount`, MONEY_VALUE, numberValue, 92);
  const resolvedGstAmount = gstAmount.value ?? igstAmount.value;

  const resolvedLineTotal = lineTotal.value ?? (
    quantity.value !== null && unitPrice.value !== null && resolvedGstAmount !== null
      ? (quantity.value * unitPrice.value) + resolvedGstAmount
      : taxableAmount.value
  );

  if (!itemCode.value && !itemName.value && !description.value) return [];
  const resolvedName = itemName.value || description.value || itemCode.value;

  return [{
    itemCode: itemCode.value,
    itemName: resolvedName,
    description: description.value || resolvedName,
    hsnSac: hsnCode.value,
    hsnCode: hsnCode.value,
    quantity: quantity.value,
    unit: resolvedUnit,
    uom: resolvedUnit,
    unitPrice: unitPrice.value,
    discount: discount.value,
    taxableAmount: taxableAmount.value,
    gstRate: gstRate.value,
    taxRate: gstRate.value,
    gstAmount: resolvedGstAmount,
    taxAmount: resolvedGstAmount,
    cgstAmount: null,
    sgstAmount: null,
    igstAmount: igstAmount.value,
    total: resolvedLineTotal,
    lineTotal: resolvedLineTotal,
  }];
};

const extractAllLineItems = (pageResults, combinedText) => {
  const items = [];
  let tableStarted = false;
  let inheritedHeader = '';
  for (const page of pageResults) {
    const headerLine = String(page.text || '').split('\n').find((line) =>
      /description|particulars|item\s*(?:name|description)|product|material|service|hsn|sac/i.test(line)
      && /qty|quantity|uom|unit|rate|price|taxable|gst|amount|total/i.test(line)
    );
    const hasHeader = Boolean(headerLine);
    if (headerLine) inheritedHeader = headerLine;
    const pageItems = extractLineItems(page.text || '', tableStarted && !hasHeader, inheritedHeader);
    if (hasHeader || pageItems.length) tableStarted = true;
    items.push(...pageItems);
  }
  if (!items.length) items.push(...extractLineItems(combinedText));
  if (!items.length) items.push(...extractLabelledLineItems(combinedText));
  const seen = new Set();
  return items.filter((item) => {
    const normalizedDescription = normalizeLineForDedupe(item.description || item.itemName)
      .replace(/\b(service|product|item|goods)\b/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    const key = [
      item.itemCode || '',
      normalizedDescription,
      item.hsnSac || item.hsnCode || '',
      Number(item.quantity || 0).toFixed(3),
      Number(item.unitPrice || 0).toFixed(2),
      Number(item.total || item.lineTotal || 0).toFixed(2),
    ].join('|').toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 500);
};

export const normalizeVendorName = (str = '') => String(str || '')
  .toLowerCase()
  .replace(/\./g, ' ')
  .replace(/\blmt\b/g, 'ltd')
  .replace(/\blimited\b/g, 'ltd')
  .replace(/\bpvt\b/g, 'private')
  .replace(/[^a-z0-9\s]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim();

const parseInvoice = (text, fileName, documentConfidence, pageResults) => {
  const documentType = detectBusinessDocumentType(text);
  const invoiceNumber = findKeywordValue(
    text,
    KEYWORD_ALIASES.invoiceNumber,
    String.raw`([A-Z0-9][A-Z0-9 \t./_-]{1,49})`,
    cleanInvoiceIdentifier,
    97,
  );
  if (!invoiceNumber.value) {
    const fallback = firstMatch(text, [
      Object.assign(/\b((?:INV|BILL|TAXINV)[-/]?[A-Z0-9][A-Z0-9./_-]{3,38})\b/i, { confidence: 82 }),
    ], cleanInvoiceIdentifier);
    Object.assign(invoiceNumber, fallback);
  }
  const poNumber = findKeywordValue(
    text,
    KEYWORD_ALIASES.poNumber,
    String.raw`([A-Z0-9][A-Z0-9 \t./_-]{1,49})`,
    cleanPoIdentifier,
    97,
  );
  if (!poNumber.value) {
    const fallback = firstMatch(text, [
      Object.assign(/\b(PO[/_-]\d{4}[/_-]\d{4,8})\b/i, { confidence: 96 }),
      Object.assign(/\b(PO[-/][A-Z0-9][A-Z0-9/-]{3,38})\b/i, { confidence: 88 }),
      Object.assign(/\b(P[O0][-/][A-Z0-9][A-Z0-9/-]{3,38})\b/i, { confidence: 82 }),
    ], cleanPoIdentifier);
    Object.assign(poNumber, fallback);
  }
  const grnNumber = findKeywordValue(
    text,
    KEYWORD_ALIASES.grnNumber,
    String.raw`([A-Z0-9][A-Z0-9 \t./_-]{1,49})`,
    cleanGrnIdentifier,
    95,
  );
  const deliveryChallanNumber = findKeywordValue(
    text,
    KEYWORD_ALIASES.deliveryChallanNumber,
    String.raw`([A-Z0-9][A-Z0-9 \t./_-]{1,49})`,
    cleanDeliveryChallanIdentifier,
    95,
  );
  const quotationNumber = firstMatch(text, [
    labelledPattern('Quotation|Quote|RFQ', String.raw`([A-Z0-9][A-Z0-9./_-]{2,39})`, 'im', 90),
  ], (value) => value.toUpperCase());
  const contractNumber = firstMatch(text, [
    labelledPattern('Contract|Agreement', String.raw`([A-Z0-9][A-Z0-9./_-]{2,39})`, 'im', 90),
  ], (value) => value.toUpperCase());

  const invoiceDate = findKeywordValue(text, KEYWORD_ALIASES.invoiceDate, DATE_VALUE, normalizeDate, 96);
  const receiptDate = findKeywordValue(text, KEYWORD_ALIASES.receiptDate, DATE_VALUE, normalizeDate, 92);
  const dueDate = findKeywordValue(text, KEYWORD_ALIASES.dueDate, DATE_VALUE, normalizeDate, 96);
  const poDate = findKeywordValue(text, KEYWORD_ALIASES.poDate, DATE_VALUE, normalizeDate, 94);
  if (!poDate.value) {
    const sameLinePoDate = firstMatch(text, [
      Object.assign(new RegExp(String.raw`(?:PO|P\.?\s*O\.?|Purchase\s*Order)[^\n]{0,80}\bDate\b[\s:#.=/-]*${DATE_VALUE}`, 'im'), { confidence: 86 }),
    ], normalizeDate);
    Object.assign(poDate, sameLinePoDate);
  }
  const invoiceStatus = findKeywordValue(
    text,
    KEYWORD_ALIASES.status,
    String.raw`([A-Z][A-Z _-]{2,40})`,
    (value) => cleanTextValue(value).toUpperCase(),
    84,
  );
  const priority = findKeywordValue(
    text,
    KEYWORD_ALIASES.priority,
    String.raw`([A-Z][A-Z _-]{2,30})`,
    (value) => cleanTextValue(value).toUpperCase(),
    82,
  );

  const vendorParty = extractParty(text, 'vendor');
  const companyParty = extractParty(text, 'company');
  const vendorGstin = findTaxIdentifier(text, GSTIN_PATTERN, 'Vendor\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?|Supplier\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?|Seller\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?|GSTIN|GST|GST\\s*Number|GST\\s*Registration\\s*Number', isValidGstin);
  if (vendorGstin.value) vendorGstin.value = cleanTaxIdentifier(vendorGstin.value);
  const companyGstin = findTaxIdentifier(text, GSTIN_PATTERN, 'Buyer\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?|Company\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?|Bill\\s*To\\s*GST(?:IN|\\s*Number|\\s*Registration\\s*Number)?', isValidGstin);
  if (companyGstin.value) companyGstin.value = cleanTaxIdentifier(companyGstin.value);
  if (companyGstin.value === vendorGstin.value) {
    const gstins = [...new Set((text.match(GSTIN_PATTERN) || []).map((value) => value.toUpperCase()))];
    if (gstins.length > 1) {
      companyGstin.value = gstins.find((value) => value !== vendorGstin.value) || null;
      companyGstin.confidence = companyGstin.value ? 70 : 0;
    } else {
      companyGstin.value = null;
      companyGstin.confidence = 0;
    }
  }
  const pan = findTaxIdentifier(text, PAN_PATTERN, 'Vendor\\s*PAN(?:\\s*Number)?|Supplier\\s*PAN(?:\\s*Number)?|PAN(?:\\s*Number)?', isValidPan);
  if (pan.value) pan.value = cleanTaxIdentifier(pan.value);
  const companyPan = findTaxIdentifier(text, PAN_PATTERN, 'Buyer\\s*PAN|Company\\s*PAN', isValidPan);
  if (companyPan.value) companyPan.value = cleanTaxIdentifier(companyPan.value);
  if (companyPan.value === pan.value) {
    companyPan.value = null;
    companyPan.confidence = 0;
  }
  const vendorCode = findKeywordValue(
    text,
    KEYWORD_ALIASES.vendorCode,
    String.raw`([A-Z0-9][A-Z0-9 \t./_-]{1,49})`,
    cleanVendorCodeIdentifier,
    95,
  );
  if (!vendorCode.value) {
    const fallback = firstMatch(text, [
      Object.assign(/\b(VND[-/][A-Z0-9][A-Z0-9/-]{3,38})\b/i, { confidence: 90 }),
    ], cleanVendorCodeIdentifier);
    Object.assign(vendorCode, fallback);
  }
  const vendorCategory = findKeywordValue(text, KEYWORD_ALIASES.vendorCategory, String.raw`([^\n|]{2,80})`, trimAtNextLabel, 84);
  const vendorType = findKeywordValue(text, KEYWORD_ALIASES.vendorType, String.raw`([^\n|]{2,80})`, trimAtNextLabel, 84);
  const contactPerson = findKeywordValue(text, KEYWORD_ALIASES.contactPerson, String.raw`([^\n|]{2,100})`, trimAtNextLabel, 88);
  const email = findContextualValue(
    text,
    String.raw`\b([A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,})\b`,
    'Vendor\\s*Email|Supplier\\s*Email|Seller\\s*Email|Email',
  );
  const phone = findContextualValue(
    text,
    String.raw`((?:\+91[\s-]?)?[6-9]\d{9})\b`,
    'Vendor\\s*(?:Phone|Mobile)|Supplier\\s*(?:Phone|Mobile)|Seller\\s*(?:Phone|Mobile)|Phone|Mobile',
    (value) => value.replace(/\s+/g, ''),
  );

  const paymentTerms = firstMatch(text, [
    labelledKeywordPattern(KEYWORD_ALIASES.paymentTerms, String.raw`([^\n|]{2,60})`, 'im', 94),
    fuzzyLabelledPattern(KEYWORD_ALIASES.paymentTerms, String.raw`([^\n|]{2,60})`, 'im', 86),
    Object.assign(/\b(Net\s*\d{1,3}|Credit\s*Days?\s*:?\s*\d{1,3})\b/i, { confidence: 76 }),
  ], trimAtNextLabel);
  const currency = firstMatch(text, [
    labelledKeywordPattern(KEYWORD_ALIASES.currency, String.raw`([A-Z]{3})`, 'im', 96),
    fuzzyLabelledPattern(KEYWORD_ALIASES.currency, String.raw`([A-Z]{3})`, 'im', 88),
    Object.assign(/\b(INR|USD|EUR|GBP|AED)\b/i, { confidence: 78 }),
    Object.assign(/(₹|Rs\.?|INR)/i, { confidence: 74 }),
  ], (value) => value.toUpperCase());
  if (currency.value) currency.value = normalizeCurrency(currency.value);
  const invoiceCategory = findKeywordValue(
    text,
    KEYWORD_ALIASES.invoiceCategory,
    String.raw`([A-Z][A-Z _-]{2,50})`,
    (value) => cleanTextValue(value).toUpperCase().replace(/\s+/g, '_'),
    82,
  );
  const category = invoiceCategory.value || (/\bcredit\s*note\b/i.test(text) ? 'CREDIT_NOTE'
    : /\bdebit\s*note\b/i.test(text) ? 'DEBIT_NOTE'
      : /\bproforma\b/i.test(text) ? 'PROFORMA_INVOICE'
        : /\btax\s*invoice\b/i.test(text) ? 'TAX_INVOICE'
          : null);

  const bankName = findKeywordValue(text, KEYWORD_ALIASES.bankName, String.raw`([^\n|]{2,80})`, trimAtNextLabel, 88);
  const accountName = findKeywordValue(text, KEYWORD_ALIASES.accountHolder, String.raw`([^\n|]{2,100})`, trimAtNextLabel, 90);
  const accountNumber = findKeywordValue(text, KEYWORD_ALIASES.accountNumber, String.raw`([A-Z*Xx\d]*\d[A-Z*Xx\d]{3,23})`, cleanIdentifier, 94);
  if (!accountNumber.value) {
    const bareAccountNumber = firstMatch(text, [
      Object.assign(/\bAccount\b(?!\s*(?:Holder|Name|No\.?|Number))[\s:#.=/-]*([A-Z*Xx\d]*\d[A-Z*Xx\d]{3,23})/im, { confidence: 82 }),
    ], cleanIdentifier);
    Object.assign(accountNumber, bareAccountNumber);
  }
  const ifscCode = firstMatch(text, [Object.assign(/\b([A-Z]{4}0[A-Z0-9]{6})\b/i, { confidence: 96 })], (value) => value.toUpperCase());
  const bankBranch = findKeywordValue(text, KEYWORD_ALIASES.branch, String.raw`([^\n|]{2,80})`, trimAtNextLabel, 86);
  const upiId = firstMatch(text, [labelledPattern('UPI(?:\\s*ID)?', String.raw`([A-Z0-9._-]{2,100}@[A-Z0-9._-]{2,50})`, 'im', 92)]);

  const money = (labels, confidence = 92) => firstMatch(text, [labelledPattern(labels, MONEY_VALUE, 'im', confidence)], numberValue);
  const subtotal = findKeywordValue(text, KEYWORD_ALIASES.subtotal, MONEY_VALUE, numberValue, 94);
  const totalDiscount = findKeywordValue(text, KEYWORD_ALIASES.discount, MONEY_VALUE, numberValue, 92);
  const taxableAmount = findKeywordValue(text, KEYWORD_ALIASES.taxableAmount, MONEY_VALUE, numberValue, 92);
  const cgstTotal = findKeywordValue(text, KEYWORD_ALIASES.cgst, MONEY_VALUE, numberValue, 92);
  const sgstTotal = findKeywordValue(text, KEYWORD_ALIASES.sgst, MONEY_VALUE, numberValue, 92);
  const igstTotal = findKeywordValue(text, KEYWORD_ALIASES.igst, MONEY_VALUE, numberValue, 92);
  const cessTotal = money('Cess(?:\\s*Total)?');
  const otherCharges = money(String.raw`Other\s*Charges?|Freight|Shipping\s*Charges?|Packing\s*Charges?|Handling\s*Charges?|Additional\s*Charges?`);
  const roundOff = findKeywordValue(text, KEYWORD_ALIASES.roundOff, MONEY_VALUE, numberValue, 88);
  const taxTotal = findKeywordValue(text, KEYWORD_ALIASES.gstTotal, MONEY_VALUE, numberValue, 92);
  const grandTotal = findKeywordValue(text, KEYWORD_ALIASES.grandTotal, MONEY_VALUE, numberValue, 97);
  const derivedTaxTotal = taxTotal.value ?? (
    [cgstTotal.value, sgstTotal.value, igstTotal.value, cessTotal.value].some((value) => value !== null)
      ? Number(cgstTotal.value || 0) + Number(sgstTotal.value || 0) + Number(igstTotal.value || 0) + Number(cessTotal.value || 0)
      : null
  );
  const derivedTaxableAmount = taxableAmount.value ?? subtotal.value;
  const amountInWords = findKeywordValue(text, KEYWORD_ALIASES.amountInWords, String.raw`([^\n]{3,200})`, trimAtNextLabel, 90);
  const deliveryTerms = firstMatch(text, [labelledPattern('Delivery\\s*Terms?', String.raw`([^\n|]{2,200})`, 'im', 86)]);
  const warrantyTerms = firstMatch(text, [labelledPattern('Warranty(?:\\s*Terms?)?', String.raw`([^\n|]{2,200})`, 'im', 86)]);
  const notes = firstMatch(text, [labelledPattern('Notes?', String.raw`([^\n]{2,300})`, 'im', 80)]);
  const remarks = findKeywordValue(text, KEYWORD_ALIASES.remarks, String.raw`([^\n]{2,300})`, cleanTextValue, 82);
  const lineItems = extractAllLineItems(pageResults, text);

  const fieldConfidence = {
    header: {
      invoiceNumber: invoiceNumber.confidence,
      invoiceDate: invoiceDate.value ? invoiceDate.confidence : 0,
      receiptDate: receiptDate.value ? receiptDate.confidence : 0,
      dueDate: dueDate.value ? dueDate.confidence : 0,
      currency: currency.confidence,
      paymentTerms: paymentTerms.confidence,
      status: invoiceStatus.confidence,
      priority: priority.confidence,
      invoiceCategory: invoiceCategory.confidence || (category ? 85 : 0),
    },
    vendor: {
      vendorName: vendorParty.name.confidence,
      vendorCode: vendorCode.confidence,
      vendorCategory: vendorCategory.confidence,
      vendorType: vendorType.confidence,
      address: vendorParty.address.confidence,
      gstin: vendorGstin.confidence,
      pan: pan.confidence,
      contactPerson: contactPerson.confidence,
      email: email.confidence,
      phone: phone.confidence,
    },
    company: {
      companyName: companyParty.name.confidence,
      companyGstin: companyGstin.confidence,
      companyPan: companyPan.confidence,
      address: companyParty.address.confidence,
    },
    references: {
      poNumber: poNumber.confidence,
      poDate: poDate.confidence,
      grnNumber: grnNumber.confidence,
      deliveryChallanNumber: deliveryChallanNumber.confidence,
      quotationNumber: quotationNumber.confidence,
      contractNumber: contractNumber.confidence,
    },
    bank: {
      bankName: bankName.confidence,
      accountName: accountName.confidence,
      accountHolder: accountName.confidence,
      accountNumber: accountNumber.confidence,
      ifscCode: ifscCode.confidence,
      branch: bankBranch.confidence,
      upiId: upiId.confidence,
    },
    totals: {
      subtotal: subtotal.confidence,
      totalDiscount: totalDiscount.confidence,
      taxableAmount: taxableAmount.confidence,
      cgstTotal: cgstTotal.confidence,
      sgstTotal: sgstTotal.confidence,
      igstTotal: igstTotal.confidence,
      cessTotal: cessTotal.confidence,
      otherCharges: otherCharges.confidence,
      roundOff: roundOff.confidence,
      taxTotal: taxTotal.confidence,
      grandTotal: grandTotal.confidence,
      amountInWords: amountInWords.confidence,
    },
    lineItems: lineItems.map(() => 70),
    terms: {
      paymentTerms: paymentTerms.confidence,
      deliveryTerms: deliveryTerms.confidence,
      warrantyTerms: warrantyTerms.confidence,
      notes: notes.confidence,
      remarks: remarks.confidence,
    },
  };

  const keyFields = documentType === 'PURCHASE_ORDER'
    ? [poNumber, poDate, vendorGstin, grandTotal]
    : [invoiceNumber, invoiceDate, vendorGstin, poNumber, grandTotal];
  const foundKeyFields = keyFields.filter((field) => field.value !== null).length;
  const structuredConfidence = keyFields.reduce((sum, field) => sum + field.confidence, 0) / keyFields.length;
  const pageCoverage = pageResults.length
    ? Math.round((pageResults.filter((page) => Number.isInteger(page.pageNumber)).length / pageResults.length) * 100)
    : 0;
  const textCoverage = pageResults.length
    ? Math.round((pageResults.filter((page) => isMeaningfulInvoiceText(page.text)).length / pageResults.length) * 100)
    : 0;
  const tableConfidence = lineItems.length ? 85 : 0;
  const typeConfidence = documentType === 'UNKNOWN' ? 0 : 95;
  const hasMinimumIdentity = documentType === 'PURCHASE_ORDER'
    ? Boolean(poNumber.value && grandTotal.value !== null)
    : Boolean(invoiceNumber.value && invoiceDate.value && grandTotal.value !== null);
  const present = (value) => value !== undefined && value !== null && value !== '';

  const taxValue = derivedTaxTotal ?? cgstTotal.value ?? sgstTotal.value ?? igstTotal.value;
  const itemValue = lineItems.length ? 'lineItems' : null;
  const coreFieldChecks = [
    { field: 'invoiceNumber', label: 'Invoice Number', value: invoiceNumber.value },
    { field: 'invoiceDate', label: 'Invoice Date', value: invoiceDate.value },
    { field: 'vendorCode', label: 'Vendor Code', value: vendorCode.value },
    { field: 'vendorName', label: 'Vendor Name', value: vendorParty.name.value },
    { field: 'gst', label: 'GST', value: vendorGstin.value },
    { field: 'poNumber', label: 'PO', value: poNumber.value },
    { field: 'items', label: 'Items', value: itemValue },
    { field: 'subtotal', label: 'Subtotal', value: subtotal.value },
    { field: 'gstTotal', label: 'GST Total', value: taxValue },
    { field: 'grandTotal', label: 'Grand Total', value: grandTotal.value },
    { field: 'paymentTerms', label: 'Payment Terms', value: paymentTerms.value },
  ];
  const coreFieldsExtracted = coreFieldChecks.filter((field) => present(field.value)).length;
  const coreTotalFields = coreFieldChecks.length;
  const coreFieldCoverage = Math.round((coreFieldsExtracted / coreTotalFields) * 100);

  const coverageValues = [
    invoiceNumber.value, invoiceDate.value, receiptDate.value, dueDate.value, currency.value, paymentTerms.value, invoiceStatus.value, priority.value, category,
    vendorParty.name.value, vendorCode.value, vendorCategory.value, vendorType.value, vendorParty.address.value,
    vendorGstin.value, pan.value, contactPerson.value, email.value, phone.value,
    companyParty.name.value, companyParty.address.value, companyGstin.value, companyPan.value,
    poNumber.value, poDate.value, grnNumber.value, deliveryChallanNumber.value, quotationNumber.value, contractNumber.value,
    bankName.value, accountName.value, accountNumber.value, ifscCode.value, bankBranch.value, upiId.value,
    subtotal.value, totalDiscount.value, derivedTaxableAmount, cgstTotal.value, sgstTotal.value, igstTotal.value,
    cessTotal.value, otherCharges.value, roundOff.value, derivedTaxTotal, grandTotal.value, amountInWords.value,
    deliveryTerms.value, warrantyTerms.value, notes.value, remarks.value,
  ];
  const optionalFieldsExtracted = coverageValues.filter((value) => value !== null && value !== '').length;
  const optionalTotalFields = coverageValues.length;
  const fieldsExtracted = coreFieldsExtracted;
  const totalFields = coreTotalFields;
  const fieldCoverage = coreFieldCoverage;
  const weightedConfidenceChecks = Object.fromEntries(
    coreFieldChecks.map((field) => [field.field, present(field.value) ? 1 : 0]),
  );
  const weightedExtractionConfidence = coreFieldCoverage;
  const expectedEvidence = [
    invoiceNumber,
    invoiceDate,
    receiptDate,
    dueDate,
    vendorCode,
    vendorParty.name,
    vendorGstin,
    pan,
    poNumber,
    grnNumber,
    deliveryChallanNumber,
    paymentTerms,
    currency,
    subtotal,
    taxableAmount,
    taxTotal,
    cgstTotal,
    sgstTotal,
    igstTotal,
    grandTotal,
    bankName,
    accountName,
    accountNumber,
    ifscCode,
    bankBranch,
  ].filter((field) => present(field.value));
  const averageExtractedFieldConfidence = expectedEvidence.length
    ? expectedEvidence.reduce((sum, field) => sum + Number(field.confidence || 0), 0) / expectedEvidence.length
    : 0;
  const identityEvidenceScore = boundedScore((foundKeyFields / keyFields.length) * 100);
  const amountEvidenceScore = boundedScore(
    [subtotal.value, derivedTaxableAmount, derivedTaxTotal, grandTotal.value]
      .filter((value) => value !== null && value !== '').length * 25,
  );
  const referenceEvidenceScore = boundedScore(
    [poNumber.value, grnNumber.value, deliveryChallanNumber.value]
      .filter((value) => value !== null && value !== '').length * 34,
  );
  const itemEvidenceScore = lineItems.length ? Math.min(95, 70 + Math.min(25, lineItems.length * 5)) : 0;
  const extractionQualityConfidence = boundedScore(
    (documentConfidence * 0.25)
    + (averageExtractedFieldConfidence * 0.25)
    + (identityEvidenceScore * 0.20)
    + (amountEvidenceScore * 0.12)
    + (referenceEvidenceScore * 0.08)
    + (itemEvidenceScore * 0.07)
    + (textCoverage * 0.03),
  );
  const confidenceBreakdown = {
    documentConfidence,
    structuredConfidence: Math.round(structuredConfidence),
    pageCoverage,
    textCoverage,
    typeConfidence,
    tableConfidence,
    extractionQualityConfidence,
    averageExtractedFieldConfidence: Math.round(averageExtractedFieldConfidence),
    identityEvidenceScore,
    amountEvidenceScore,
    referenceEvidenceScore,
    itemEvidenceScore,
    fieldCoverage: coreFieldCoverage,
    allFieldCoverage: Math.round((optionalFieldsExtracted / optionalTotalFields) * 100),
    weightedExtractionConfidence,
    weightedConfidenceChecks,
    coreFields: coreFieldChecks.map(({ field, label, value }) => ({
      field,
      label,
      extracted: present(value),
    })),
    fieldsExtracted,
    totalFields,
    coreFieldsExtracted,
    coreTotalFields,
    optionalFieldsExtracted,
    optionalTotalFields,
    foundKeyFields,
    totalKeyFields: keyFields.length,
  };
  const confidence = extractionQualityConfidence;
  const status = hasMinimumIdentity && pageCoverage === 100 && confidence >= 80
    ? 'SUCCESS'
    : foundKeyFields >= 2 && confidence >= 35
      ? 'PARTIAL_DATA'
      : 'LOW_CONFIDENCE';
  const extractedTotalsForLog = {
    subtotal: subtotal.value,
    discount: totalDiscount.value,
    taxableAmount: derivedTaxableAmount,
    cgst: cgstTotal.value,
    sgst: sgstTotal.value,
    igst: igstTotal.value,
    totalTax: derivedTaxTotal,
    otherCharges: otherCharges.value,
    roundOff: roundOff.value,
    grandTotal: grandTotal.value,
  };
  const structuredItems = lineItems.map((item) => ({
    ...item,
    itemCode: item.itemCode || null,
    itemName: item.itemName || item.description || null,
    description: item.description || item.itemName || null,
    quantity: item.quantity ?? null,
    unit: item.unit || item.uom || null,
    unitPrice: item.unitPrice ?? null,
    taxableAmount: item.taxableAmount ?? null,
    cgst: item.cgst ?? item.cgstAmount ?? 0,
    sgst: item.sgst ?? item.sgstAmount ?? 0,
    igst: item.igst ?? item.igstAmount ?? 0,
    gstAmount: item.gstAmount ?? item.taxAmount ?? (
      Number(item.cgst ?? item.cgstAmount ?? 0)
      + Number(item.sgst ?? item.sgstAmount ?? 0)
      + Number(item.igst ?? item.igstAmount ?? 0)
    ),
    lineTotal: item.lineTotal ?? item.total ?? null,
  }));
  const structuredInvoice = {
    invoiceNumber: invoiceNumber.value,
    invoiceDate: invoiceDate.value,
    receiptDate: receiptDate.value,
    dueDate: dueDate.value,
    invoiceCategory: category,
    currency: currency.value,
    paymentTerms: paymentTerms.value,
  };
  const structuredVendor = {
    vendorCode: vendorCode.value,
    vendorName: vendorParty.name.value,
    gstNumber: vendorGstin.value,
    pan: pan.value,
    email: email.value,
    phone: phone.value,
  };
  const structuredTotals = {
    subtotal: subtotal.value,
    discount: totalDiscount.value,
    taxableAmount: derivedTaxableAmount,
    cgst: cgstTotal.value,
    sgst: sgstTotal.value,
    igst: igstTotal.value,
    totalTax: derivedTaxTotal,
    otherCharges: otherCharges.value,
    roundOff: roundOff.value,
    grandTotal: grandTotal.value,
  };
  const structuredPayment = {
    bankName: bankName.value,
    accountHolder: accountName.value,
    accountNumber: accountNumber.value,
    ifsc: ifscCode.value,
    ifscCode: ifscCode.value,
    branch: bankBranch.value,
  };
  if (ocrDebugEnabled()) {
    console.log('[OCR] Invoice Number:', invoiceNumber.value);
    console.log('[OCR] Invoice Date:', invoiceDate.value);
    console.log('[OCR] Receipt Date:', receiptDate.value);
    console.log('[OCR] Due Date:', dueDate.value);
    console.log('[OCR] PO Number:', poNumber.value);
    console.log('[OCR] GRN Number:', grnNumber.value);
    console.log('[OCR] Delivery Challan Number:', deliveryChallanNumber.value);
    console.log('[OCR] Vendor Name:', vendorParty.name.value);
    console.log('[OCR] Vendor Code:', vendorCode.value);
    console.log('[OCR] GST Number:', vendorGstin.value);
    console.log('[OCR] PAN Number:', pan.value);
    console.log('[OCR] Extracted item count:', lineItems?.length || 0);
    console.log('[OCR] Extracted totals:', extractedTotalsForLog);
    console.log('[OCR] Calculated OCR confidence:', confidence);
  }
  console.info('[OCR] Regex Matched', {
    invoiceNumber: Boolean(invoiceNumber.value),
    invoiceDate: Boolean(invoiceDate.value),
    receiptDate: Boolean(receiptDate.value),
    dueDate: Boolean(dueDate.value),
    vendorName: Boolean(vendorParty.name.value),
    vendorCode: Boolean(vendorCode.value),
    gst: Boolean(vendorGstin.value),
    pan: Boolean(pan.value),
    poNumber: Boolean(poNumber.value),
    grnNumber: Boolean(grnNumber.value),
    deliveryChallanNumber: Boolean(deliveryChallanNumber.value),
    bankDetails: Boolean(bankName.value || accountNumber.value || ifscCode.value || bankBranch.value),
    totals: Boolean(grandTotal.value || derivedTaxTotal !== null || derivedTaxableAmount !== null),
    lineItems: lineItems.length,
  });
  if (vendorCode.value) console.info('[OCR] Vendor Code Found', { vendorCode: vendorCode.value });
  if (poNumber.value) console.info('[OCR] PO Found', { poNumber: poNumber.value });
  const missingCriticalFields = coreFieldChecks
    .filter((field) => !present(field.value))
    .map((field) => field.field);

  debugOcrStage('[OCR EXTRACT] field parsing summary', {
    fileName,
    documentType,
    status,
    confidence,
    confidenceBreakdown,
    missingCriticalFields,
    extractedFieldPresence: {
      invoiceNumber: Boolean(invoiceNumber.value),
      invoiceDate: Boolean(invoiceDate.value),
      receiptDate: Boolean(receiptDate.value),
      dueDate: Boolean(dueDate.value),
      vendorName: Boolean(vendorParty.name.value),
      vendorCode: Boolean(vendorCode.value),
      vendorGstin: Boolean(vendorGstin.value),
      vendorPan: Boolean(pan.value),
      poNumber: Boolean(poNumber.value),
      grnNumber: Boolean(grnNumber.value),
      deliveryChallanNumber: Boolean(deliveryChallanNumber.value),
      subtotal: subtotal.value !== null,
      taxableAmount: derivedTaxableAmount !== null,
      taxTotal: derivedTaxTotal !== null,
      grandTotal: grandTotal.value !== null,
      lineItems: lineItems.length,
    },
  });

  return {
    status,
    confidence,
    extractedData: {
      sourceFileName: fileName,
      documentType,
      pageCount: pageResults.length,
      processingStatus: status,
      ocrConfidence: confidence,
      document: {
        documentType,
        pageCount: pageResults.length,
        pagesProcessed: pageResults.length,
        pageCoverage,
        textCoverage,
        pages: pageResults.map(({ pageNumber, source, confidence: pageConfidence, text: pageText }) => ({
          pageNumber,
          source,
          confidence: pageConfidence,
          textLength: String(pageText || '').length,
        })),
      },
      header: {
        invoiceNumber: invoiceNumber.value,
        invoiceDate: invoiceDate.value,
        receiptDate: receiptDate.value,
        dueDate: dueDate.value,
        invoiceType: documentType,
        currency: currency.value,
        paymentTerms: paymentTerms.value,
        status: invoiceStatus.value,
        priority: priority.value,
        invoiceCategory: category,
      },
      invoice: structuredInvoice,
      vendor: {
        name: vendorParty.name.value,
        vendorName: vendorParty.name.value,
        ...structuredVendor,
        vendorCode: vendorCode.value,
        vendorCategory: vendorCategory.value,
        vendorType: vendorType.value,
        vendorAddress: vendorParty.address.value,
        address: vendorParty.address.value,
        gstin: vendorGstin.value,
        gstNumber: vendorGstin.value,
        pan: pan.value,
        panNumber: pan.value,
        contactPerson: contactPerson.value,
        email: email.value,
        phone: phone.value,
      },
      company: {
        companyName: companyParty.name.value,
        companyAddress: companyParty.address.value,
        companyGstin: companyGstin.value,
        companyPan: companyPan.value,
        address: companyParty.address.value,
      },
      bank: {
        bankName: bankName.value,
        accountName: accountName.value,
        accountHolder: accountName.value,
        accountNumber: accountNumber.value,
        ifscCode: ifscCode.value,
        branch: bankBranch.value,
        upiId: upiId.value,
      },
      references: {
        poNumber: poNumber.value,
        poDate: poDate.value,
        grnNumber: grnNumber.value,
        deliveryChallanNumber: deliveryChallanNumber.value,
        quotationNumber: quotationNumber.value,
        contractNumber: contractNumber.value,
      },
      lineItems: structuredItems,
      items: structuredItems,
      totals: {
        subtotal: subtotal.value,
        discount: totalDiscount.value,
        totalDiscount: totalDiscount.value,
        taxableAmount: derivedTaxableAmount,
        cgst: cgstTotal.value,
        cgstTotal: cgstTotal.value,
        sgst: sgstTotal.value,
        sgstTotal: sgstTotal.value,
        igst: igstTotal.value,
        igstTotal: igstTotal.value,
        cessTotal: cessTotal.value,
        otherCharges: otherCharges.value,
        roundOff: roundOff.value,
        taxTotal: derivedTaxTotal,
        totalTax: derivedTaxTotal,
        grandTotal: grandTotal.value,
        amountInWords: amountInWords.value,
      },
      payment: structuredPayment,
      taxes: {
        cgst: cgstTotal.value,
        sgst: sgstTotal.value,
        igst: igstTotal.value,
        cess: cessTotal.value,
        taxTotal: derivedTaxTotal,
      },
      ocr: {
        confidence,
        sourceFileName: fileName,
        status,
      },
      terms: {
        paymentTerms: paymentTerms.value,
        deliveryTerms: deliveryTerms.value,
        warrantyTerms: warrantyTerms.value,
        notes: notes.value,
        remarks: remarks.value,
      },
      extractionSummary: {
        pagesProcessed: pageResults.length,
        totalPages: pageResults.length,
        pageCoverage,
        textCoverage,
        totalExpectedFields: coreTotalFields,
        fieldsDetected: coreFieldsExtracted,
        fieldsMissing: Math.max(0, coreTotalFields - coreFieldsExtracted),
        fieldsCorrectlyMapped: coreFieldsExtracted,
        fieldsIncorrectlyMapped: Math.max(0, coreTotalFields - coreFieldsExtracted),
        extractionCoverage: coreFieldCoverage,
        correctMappingRate: coreFieldCoverage,
        overallCorrectness: confidence,
        fieldsExtracted,
        totalFields,
        optionalFieldsDetected: optionalFieldsExtracted,
        optionalTotalFields,
        coreFieldsExtracted,
        coreTotalFields,
        fieldCoverage,
        confidenceBreakdown,
        missingCriticalFields,
        lineItemsExtracted: lineItems.length,
        documentType,
        overallConfidence: confidence,
        status: status === 'SUCCESS' ? 'READY_FOR_REVIEW' : status,
      },
      fieldConfidence,
      rawText: text,
      rawTextSummary: text.slice(0, 4000),
    },
  };
};

const failureResult = (status, reason) => ({
  status,
  confidence: 0,
  extractedData: { reason },
});

export const processInvoiceOcr = async (file) => {
  const totalStartedAt = nowMs();
  perfTime('[OCR PERF] Total OCR processing');
  if (!shouldAttemptOcr(file)) {
    debugOcrStage('[OCR EXTRACT] unsupported file rejected', {
      originalFileName: file?.originalname || file?.name || null,
      mimeType: file?.mimetype || file?.type || null,
    });
    perfTimeEnd('[OCR PERF] Total OCR processing');
    return failureResult('FAILED', 'Unsupported file format. Please upload a PDF, PNG, JPG, JPEG, or TIFF file.');
  }

  try {
    const fileReadStartedAt = nowMs();
    perfTime('[OCR PERF] File processing');
    let buffer;
    try {
      buffer = await readFileBuffer(file);
    } finally {
      perfTimeEnd('[OCR PERF] File processing');
    }
    console.info('[OCR TIMING]', {
      stage: 'fileRead',
      fileReadMs: elapsedMs(fileReadStartedAt),
      fileSize: buffer.length,
    });
    const extractionStartedAt = nowMs();
    const pageResults = await extractDocumentText(file, buffer);
    console.info('[OCR TIMING]', {
      stage: 'documentExtraction',
      documentExtractionMs: elapsedMs(extractionStartedAt),
      pagesProcessed: pageResults.length,
    });
    debugOcrStage('[OCR EXTRACT] text extraction completed', {
      originalFileName: file?.originalname || file?.name || null,
      totalPagesProcessed: pageResults.length,
      pages: pageResults.map((page) => ({
        pageNumber: page.pageNumber,
        source: page.source,
        confidence: page.confidence,
        textLength: String(page.text || '').length,
        meaningful: isMeaningfulInvoiceText(page.text),
      })),
    });
    const meaningfulPages = pageResults.filter((page) => isMeaningfulInvoiceText(page.text));
    debugOcrStage('[OCR EXTRACT] meaningful page filter completed', {
      totalPagesProcessed: pageResults.length,
      meaningfulPages: meaningfulPages.length,
      droppedPages: pageResults.length - meaningfulPages.length,
      droppedPageNumbers: pageResults
        .filter((page) => !isMeaningfulInvoiceText(page.text))
        .map((page) => page.pageNumber),
    });
    if (!meaningfulPages.length) {
      debugOcrStage('[OCR EXTRACT] failed before field parsing', {
        reason: 'No meaningful OCR/PDF text was extracted from any processed page.',
      });
      return failureResult('FAILED', 'Unable to extract readable invoice content. Please upload a clearer document.');
    }

    const text = normalizeOcrTyposForParsing(cleanText(meaningfulPages.map((page) => page.text).join('\n\n')));
    console.info('[OCR] Raw text', {
      length: text.length,
      rawText: text,
    });
    if (ocrDebugEnabled()) {
      console.log('[OCR] Raw extracted text length:', text?.length || 0);
      console.log('[OCR] Raw extracted text preview:', text?.slice(0, 2000));
    }
    if (!isMeaningfulInvoiceText(text)) {
      debugOcrStage('[OCR EXTRACT] failed before field parsing', {
        reason: 'Combined meaningful page text failed readability checks.',
        combinedTextLength: text.length,
      });
      return failureResult('FAILED', 'The document did not contain meaningful visible invoice text.');
    }

    const documentConfidence = Math.round(
      meaningfulPages.reduce((sum, page) => sum + page.confidence, 0) / meaningfulPages.length,
    );
    debugOcrStage('[OCR] Starting field extraction', {
      documentConfidence,
      meaningfulPages: meaningfulPages.length,
      combinedTextLength: text.length,
    });
    const parsingStartedAt = nowMs();
    perfTime('[OCR PERF] Field extraction');
    let parsed;
    try {
      parsed = parseInvoice(
        text,
        path.basename(file.originalname || file.name || 'uploaded_invoice'),
        documentConfidence,
        pageResults,
      );
    } finally {
      perfTimeEnd('[OCR PERF] Field extraction');
    }
    console.info('[OCR TIMING]', {
      stage: 'parsing',
      parsingMs: elapsedMs(parsingStartedAt),
    });
    const parsedData = parsed.extractedData || {};
    const failedFields = [
      ...(parsedData.extractionSummary?.missingCriticalFields || []),
      ...collectMissingExtractedFields(parsedData),
    ].filter((value, index, values) => value && values.indexOf(value) === index);
    console.info('[OCR] OCR completed', {
      status: parsed.status,
      confidence: parsed.confidence,
      pagesProcessed: pageResults.length,
      lineItemsExtracted: parsedData.lineItems?.length || 0,
    });
    console.info('[OCR] Parsed invoice fields', {
      header: parsedData.header || {},
      totals: parsedData.totals || {},
      lineItemsCount: parsedData.lineItems?.length || 0,
    });
    console.info('[OCR] Parsed vendor', parsedData.vendor || {});
    console.info('[OCR] Parsed PO', {
      poNumber: parsedData.references?.poNumber || null,
      poDate: parsedData.references?.poDate || null,
    });
    console.info('[OCR] Parsed GRN', {
      grnNumber: parsedData.references?.grnNumber || null,
    });
    console.info('[OCR] Parsed Delivery Challan', {
      deliveryChallanNumber: parsedData.references?.deliveryChallanNumber || null,
    });
    console.info('[OCR] Fields failed to extract', {
      count: failedFields.length,
      fields: failedFields,
    });
    debugOcrStage('[OCR EXTRACT] invoice parsing completed', {
      originalFileName: file?.originalname || file?.name || null,
      status: parsed.status,
      confidence: parsed.confidence,
      pageCount: parsed.extractedData?.document?.pageCount || 0,
      textCoverage: parsed.extractedData?.document?.textCoverage || 0,
      fieldsExtracted: parsed.extractedData?.extractionSummary?.fieldsExtracted || 0,
      totalFields: parsed.extractedData?.extractionSummary?.totalFields || 0,
      lineItemsExtracted: parsed.extractedData?.extractionSummary?.lineItemsExtracted || 0,
      missingCriticalFields: parsed.extractedData?.extractionSummary?.missingCriticalFields || [],
    });
    console.info('[OCR TIMING]', {
      stage: 'total',
      totalMs: elapsedMs(totalStartedAt),
      status: parsed.status,
      confidence: parsed.confidence,
    });
    perfTimeEnd('[OCR PERF] Total OCR processing');
    return parsed;
  } catch (error) {
    perfTimeEnd('[OCR PERF] Total OCR processing');
    const message = String(error?.message || '');
    if (/password|encrypted/i.test(message)) {
      return failureResult('FAILED', 'Password-protected PDFs are not supported. Please upload an unlocked document.');
    }
    if (/invalid pdf|missing pdf|format error|unexpected response/i.test(message)) {
      return failureResult('FAILED', 'The PDF is corrupted or invalid.');
    }
    console.error('[OCR Service] Invoice extraction failed:', {
      name: error?.name,
      message: error?.message,
    });
    return failureResult('FAILED', 'Unable to process the invoice document. Please try again with a clearer file.');
  }
};

export const shutdownInvoiceOcr = async () => {
  if (!workerPromise) return;
  const worker = await workerPromise;
  await worker.terminate();
  workerPromise = null;
  recognitionQueue = Promise.resolve();
};

export const __testables = {
  cleanText,
  detectDocumentType,
  parseInvoice,
  extractLineItems,
  normalizeDate,
};
