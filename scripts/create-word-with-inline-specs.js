const { Document, Paragraph, TextRun, Packer } = require("docx");
const fs = require("fs");
const path = require("path");

// Create a Word document with HTML comment syntax typed as plain text
const doc = new Document({
  sections: [
    {
      properties: {},
      children: [
        new Paragraph({
          children: [
            new TextRun({
              text: "Test Documentation with Inline Specifications",
              bold: true,
              size: 32,
            }),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: '<!-- test { "id": "word-inline-test" } -->',
              size: 20,
              font: "Courier New",
            }),
          ],
        }),
        new Paragraph({ text: "" }),
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
              text: " to continue.",
            }),
          ],
        }),
        new Paragraph({ text: "" }),
        new Paragraph({
          children: [
            new TextRun({
              text: '<!-- step { "goTo": "https://example.com" } -->',
              size: 20,
              font: "Courier New",
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
              text: " message.",
            }),
          ],
        }),
      ],
    },
  ],
});

const outputPath = path.join(__dirname, "../test/artifacts/sample-with-inline-specs.docx");
Packer.toBuffer(doc).then((buffer) => {
  fs.writeFileSync(outputPath, buffer);
  console.log(`Created test document with inline specifications: ${outputPath}`);
});
