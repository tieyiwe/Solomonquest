import { Router, type IRouter } from "express";
import { requireAuth, type AuthenticatedRequest } from "../middlewares/auth";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } from "docx";
import * as pdfParseModule from "pdf-parse";
const pdfParse: (buf: Buffer) => Promise<{ text: string; numpages: number }> =
  (pdfParseModule as any).default ?? (pdfParseModule as any);
import multer from "multer";

const router: IRouter = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// POST /convert/pdf-to-docx
// Accepts a PDF file, returns a DOCX file download
router.post(
  "/convert/pdf-to-docx",
  requireAuth,
  upload.single("file"),
  async (req: AuthenticatedRequest, res): Promise<void> => {
    const role = req.userRole;
    if (role !== "teacher" && role !== "admin" && role !== "super_admin") {
      res.status(403).json({ error: "Only teachers and admins can convert files" });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: "No file uploaded" });
      return;
    }

    if (req.file.mimetype !== "application/pdf") {
      res.status(400).json({ error: "Only PDF files are supported" });
      return;
    }

    try {
      const parsed = await pdfParse(req.file.buffer);
      const rawText = parsed.text || "";

      // Split into lines, create paragraphs
      const lines = rawText.split("\n");

      const docParagraphs = lines.map((line) => {
        const trimmed = line.trim();
        if (!trimmed) {
          return new Paragraph({ children: [new TextRun("")], spacing: { after: 80 } });
        }
        return new Paragraph({
          children: [new TextRun({ text: trimmed, size: 24 })],
          spacing: { after: 80 },
          alignment: AlignmentType.LEFT,
        });
      });

      const originalName = req.file.originalname.replace(/\.pdf$/i, "");

      const doc = new Document({
        sections: [
          {
            properties: {},
            children: [
              new Paragraph({
                text: `Converted from: ${originalName}`,
                heading: HeadingLevel.HEADING_3,
                spacing: { after: 200 },
              }),
              new Paragraph({
                children: [
                  new TextRun({
                    text: `Pages: ${parsed.numpages} · Converted on ${new Date().toLocaleDateString()}`,
                    italics: true,
                    size: 20,
                    color: "888888",
                  }),
                ],
                spacing: { after: 400 },
              }),
              ...docParagraphs,
            ],
          },
        ],
      });

      const buffer = await Packer.toBuffer(doc);
      const filename = `${originalName}.docx`;

      res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.wordprocessingml.document");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(buffer);
    } catch (err: any) {
      res.status(500).json({ error: "Failed to convert PDF: " + (err.message ?? "Unknown error") });
    }
  }
);

export default router;
