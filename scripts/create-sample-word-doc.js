const { Document, Paragraph, TextRun, Packer } = require("docx");
const fs = require("fs");
const path = require("path");

// Create a sample Word document with test specifications
const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "Sample Test Documentation",
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "This document demonstrates Doc Detective's Word format support.",
              size: 24,
            }),
          ],
        }),
        new Paragraph({ text: "" }), // Empty line
        new Paragraph({
          children: [
            new TextRun({
              text: "Test Instructions",
              bold: true,
              size: 28,
            }),
          ],
        }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Click ",
            }),
            new TextRun({
              text: "Submit",
              bold: true,
            }),
            new TextRun({
              text: " button to submit the form.",
            }),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Navigate to https://example.com to see more information.",
            }),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: "Look for the ",
            }),
            new TextRun({
              text: "Welcome",
              bold: true,
            }),
            new TextRun({
              text: " message on the page.",
            }),
          ],
        }),
      ],
    },
  ],
});

// Create test directory if it doesn't exist
const testDir = path.join(__dirname, "test", "artifacts");
if (!fs.existsSync(testDir)) {
  fs.mkdirSync(testDir, { recursive: true });
}

// Write document to file
const outputPath = path.join(testDir, "sample-test.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Sample Word document created: ${outputPath}`);
});
