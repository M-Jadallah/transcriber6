// Word (.docx) generation with Arabic RTL support
import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  HeadingLevel,
  AlignmentType,
} from "docx";

export interface DocxOptions {
  title?: string;
  rtl?: boolean; // right-to-left (Arabic)
  font?: string;
}

export async function generateTextDocx(text: string, options: DocxOptions = {}): Promise<Buffer> {
  const { title, rtl = true, font = "Cairo" } = options;
  const lines = text.split(/\r?\n/);

  const paragraphs: Paragraph[] = [];

  if (title) {
    paragraphs.push(
      new Paragraph({
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        heading: HeadingLevel.HEADING_1,
        children: [
          new TextRun({
            text: title,
            bold: true,
            size: 32,
            rightToLeft: rtl,
            font,
          }),
        ],
      })
    );
    paragraphs.push(new Paragraph({ children: [] }));
  }

  for (const line of lines) {
    const isHeading = /^#{1,6}\s+/.test(line);
    const cleanLine = isHeading ? line.replace(/^#{1,6}\s+/, "") : line;
    paragraphs.push(
      new Paragraph({
        bidirectional: rtl,
        alignment: rtl ? AlignmentType.RIGHT : AlignmentType.LEFT,
        heading: isHeading ? HeadingLevel.HEADING_2 : undefined,
        children: [
          new TextRun({
            text: cleanLine,
            size: 24,
            rightToLeft: rtl,
            font,
          }),
        ],
      })
    );
  }

  const doc = new Document({
    creator: "YouTube Transcription Platform",
    title: title || "Transcript",
    sections: [{ properties: {}, children: paragraphs }],
  });

  return Packer.toBuffer(doc);
}

export async function generateJsonDocx(content: unknown, options: DocxOptions = {}): Promise<Buffer> {
  const text = "```json\n" + JSON.stringify(content, null, 2) + "\n```";
  return generateTextDocx(text, options);
}
