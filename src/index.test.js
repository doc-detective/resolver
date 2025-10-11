const assert = require("assert");
const sinon = require("sinon");
const proxyquire = require("proxyquire");
const fs = require("fs");
const { detectTests, resolveTests, detectAndResolveTests } = require("./index");

before(async function () {
  const { expect } = await import("chai");
  global.expect = expect;
});

describe("detectTests", function () {
  let setConfigStub, qualifyFilesStub, parseTestsStub, logStub;
  let detectTests;
  let configInput, configResolved, files, specs;

  beforeEach(function () {
    configInput = { foo: "bar" };
    configResolved = { ...configInput, environment: "test" };
    files = ["file1.js", "file2.js"];
    specs = [{ name: "spec1" }, { name: "spec2" }];

    setConfigStub = sinon.stub().resolves(configResolved);
    qualifyFilesStub = sinon.stub().resolves(files);
    parseTestsStub = sinon.stub().resolves(specs);
    logStub = sinon.stub();

    detectTests = proxyquire("./index", {
      "./config": { setConfig: setConfigStub },
      "./utils": {
        qualifyFiles: qualifyFilesStub,
        parseTests: parseTestsStub,
        log: logStub,
      },
    }).detectTests;
  });

  afterEach(function () {
    sinon.restore();
  });

  it("should resolve config if environment is not set", async function () {
    await detectTests({ config: configInput });
    assert(setConfigStub.calledOnceWith({ config: configInput }));
    assert(qualifyFilesStub.calledOnceWith({ config: configResolved }));
    assert(parseTestsStub.calledOnceWith({ config: configResolved, files }));
    assert(logStub.calledWith(configResolved, "debug", "CONFIG:"));
    assert(logStub.calledWith(configResolved, "debug", configResolved));
  });

  it("should not resolve config if environment is set", async function () {
    const configWithEnv = { ...configInput, environment: "already" };
    await detectTests({ config: configWithEnv });
    assert(setConfigStub.notCalled);
    assert(qualifyFilesStub.calledOnceWith({ config: configWithEnv }));
    assert(parseTestsStub.calledOnceWith({ config: configWithEnv, files }));
  });

  it("should log files and specs", async function () {
    await detectTests({ config: configInput });
    assert(logStub.calledWith(configResolved, "debug", "FILES:"));
    assert(logStub.calledWith(configResolved, "debug", files));
    assert(logStub.calledWith(configResolved, "debug", "SPECS:"));
    assert(logStub.calledWith(configResolved, "info", specs));
  });

  it("should return the parsed specs", async function () {
    const result = await detectTests({ config: configInput });
    assert.strictEqual(result, specs);
  });

  it("should correctly parse a complicated input", async function () {
    // Simulate a config with complex structure and multiple files/specs
    const complicatedConfig = {
      foo: "bar",
      nested: { a: 1, b: [2, 3] },
      environment: undefined,
    };
    const complicatedResolved = {
      ...complicatedConfig,
      environment: "complicated",
    };
    const complicatedFiles = [
      "src/feature/alpha.js",
      "src/feature/beta.js",
      "src/feature/gamma.js",
    ];
    const complicatedSpecs = [
      { name: "alpha", steps: [1, 2, 3], meta: { tags: ["a", "b"] } },
      { name: "beta", steps: [4, 5], meta: { tags: ["b"] } },
      { name: "gamma", steps: [], meta: { tags: [] } },
    ];

    setConfigStub.resolves(complicatedResolved);
    qualifyFilesStub.resolves(complicatedFiles);
    parseTestsStub.resolves(complicatedSpecs);

    const result = await detectTests({ config: complicatedConfig });

    assert(setConfigStub.calledOnceWith({ config: complicatedConfig }));
    assert(qualifyFilesStub.calledOnceWith({ config: complicatedResolved }));
    assert(
      parseTestsStub.calledOnceWith({
        config: complicatedResolved,
        files: complicatedFiles,
      })
    );
    assert(logStub.calledWith(complicatedResolved, "debug", "FILES:"));
    assert(logStub.calledWith(complicatedResolved, "debug", complicatedFiles));
    assert(logStub.calledWith(complicatedResolved, "debug", "SPECS:"));
    assert(logStub.calledWith(complicatedResolved, "info", complicatedSpecs));
    assert.strictEqual(result, complicatedSpecs);
  });
});

// Input/output comparisons.
const yamlInput = `
tests:
- steps:
  - httpRequest:
      url: http://localhost:8080/api/users
      method: post
      request:
        body:
          name: John Doe
          job: Software Engineer
      response:
        body:
          name: John Doe
          job: Software Engineer
  - httpRequest:
      url: http://localhost:8080/api/users
      method: post
      request:
        body:
          data:
            - first_name: George
              last_name: Bluth
              id: 1
      response:
        body:
          data:
            - first_name: George
              last_name: Bluth
    variables:
      ID: $$response.body.data[0].id
  - httpRequest:
      url: http://localhost:8080/api/users/$ID
      method: get
      timeout: 1000
    savePath: response.json
    maxVariation: 0
    overwrite: aboveVariation
`;

const markdownInlineYaml = `
# Doc Detective documentation overview

<!-- test
testId: doc-detective-docs
detectSteps: false
-->

[Doc Detective documentation](http://doc-detective.com) is split into a few key sections:

<!-- step checkLink: "https://doc-detective.com" -->

- The landing page discusses what Doc Detective is, what it does, and who might find it useful.
- [Get started](https://doc-detective.com/docs/get-started/intro) covers how to quickly get up and running with Doc Detective.

  <!-- step checkLink: "https://doc-detective.com/docs/get-started/intro" -->

Some pages also have unique headings. If you open [type](https://doc-detective.com/docs/get-started/actions/type) it has **Special keys**.

<!-- step goTo: "https://doc-detective.com/docs/get-started/actions/type" -->
<!-- step find: Special keys -->

![Search results.](reference.png){ .screenshot }
<!-- step screenshot: reference.png -->
`;

const ditaXmlInline = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">
<topic id="doc_detective_overview">
  <title>Doc Detective Documentation Overview</title>
  <?test testId: doc-detective-docs
detectSteps: false?>
  <body>
    <p>Doc Detective documentation is split into a few key sections:</p>
    <?step checkLink: "https://doc-detective.com"?>
    <ul>
      <li>The landing page discusses what Doc Detective is, what it does, and who might find it useful.</li>
      <li>The <xref href="https://doc-detective.com/docs/get-started/intro">Get started</xref> section covers how to quickly get up and running with Doc Detective.</li>
      <?step checkLink: "https://doc-detective.com/docs/get-started/intro"?>
    </ul>
    <p>Some pages also have unique headings. If you Go to the <xref href="https://doc-detective.com/docs/get-started/actions/type">type action page</xref>, it has a section on special keys.</p>
    <?step goTo: "https://doc-detective.com/docs/get-started/actions/type"?>
  </body>
</topic>
`;

const ditaXmlDetected = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">
<topic id="doc_detective_detected">
  <title>Doc Detective Documentation with Markup Detection</title>
  <?test testId: dita-detected-test?>
  <body>
    <p>This topic tests markup detection in DITA XML files.</p>
    <p>First, check the main <xref href="https://doc-detective.com">Doc Detective site</xref>.</p>
    <p>Then, Go to the <xref href="https://doc-detective.com/docs/get-started/intro">Get Started</xref> guide.</p>
    <ul>
      <li>Visit the <xref href="https://doc-detective.com/reference/">reference documentation</xref>.</li>
    </ul>
  </body>
</topic>
`;

const ditaXmlWindowsLineEndings = `<?xml version="1.0" encoding="UTF-8"?>\r
<!DOCTYPE topic PUBLIC "-//OASIS//DTD DITA Topic//EN" "topic.dtd">\r
<topic id="windows_line_endings_test">\r
  <title>Windows Line Endings Test</title>\r
  <?test testId: windows-test\r
detectSteps: true?>\r
  <body>\r
    <p>Testing with Windows CRLF line endings.</p>\r
    <?step checkLink: "https://example.com"?>\r
    <p>Check this <xref href="https://example.org">example link</xref>.</p>\r
  </body>\r
</topic>\r
`;

const markdownInput = `
# Doc Detective documentation overview

[Doc Detective documentation](https://doc-detective.com) is split into a few key sections:

- The landing page discusses what Doc Detective is, what it does, and who might find it useful.
- [Get started](https://doc-detective.com/get-started.html) covers how to quickly get up and running with Doc Detective.
- The [references](https://doc-detective.com/reference/) detail the various JSON objects that Doc Detective expects for [configs](https://doc-detective.com/reference/schemas/config.html), [test specifications](https://doc-detective.com/reference/schemas/specification.html), [tests](https://doc-detective.com/reference/schemas/test), actions, and more. Open [typeKeys](https://doc-detective.com/reference/schemas/typeKeys.html)--or any other schema--and you'll find three sections: **Description**, **Fields**, and **Examples**.

![Search results.](reference.png)
`;

const codeInMarkdown = `
\`\`\`bash
# This is a bash code block
echo "Hello, World!"
\`\`\`

\`\`\`javascript
// This is a JavaScript code block
console.log("Hello, World!");
\`\`\`

\`\`\`python
# This is a Python code block
print("Hello, World!")
\`\`\`

\`\`\`bash testIgnore
# This is a bash code block that should be ignored
echo "This should not be detected as a test step"
\`\`\`
`;

describe("Input/output detect comparisons", async function () {
  it("should correctly parse YAML input", async function () {
    // Create temp yaml file
    const tempYamlFile = "temp.yaml";
    fs.writeFileSync(tempYamlFile, yamlInput.trim());
    const config = {
      input: tempYamlFile,
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempYamlFile); // Clean up temp file
    expect(results).to.contain.keys(["config", "specs", "resolvedTestsId"]);
    expect(results.specs).to.be.an("array").that.is.not.empty;
    expect(results.specs[0]).to.have.property("specId").that.is.a("string");
    expect(results.specs[0]).to.have.property("tests").that.is.an("array").that
      .is.not.empty;
    expect(results.specs[0].tests[0]).to.have.property("testId").that.is.a("string");
    expect(results.specs[0].tests[0])
      .to.have.property("contexts")
      .that.is.an("array").that.is.not.empty;
      const context = results.specs[0].tests[0].contexts[0];
    expect(context).to.have.property("contextId").that.is.a("string");
    expect(context).to.not.have.property("platform");
    expect(context).to.not.have.property("browser");
    expect(context)
      .to.have.property("steps")
      .that.is.an("array").that.is.not.empty;
    expect(context.steps).to.have.lengthOf(3);
  });

  it("should correctly parse markdown inline YAML input", async function () {
    // Create temp markdown file
    const tempMarkdownFile = "temp.md";
    fs.writeFileSync(tempMarkdownFile, markdownInlineYaml.trim());
    const config = {
      input: tempMarkdownFile,
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempMarkdownFile); // Clean up temp file
    const steps = results.specs[0].tests[0].contexts[0].steps;
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts[0].steps).to.be.an("array").that.has.lengthOf(5);
  });

  it("should correctly parse markdown detected input", async function () {
    // Create temp markdown file
    const tempMarkdownFile = "temp_full.md";
    fs.writeFileSync(tempMarkdownFile, markdownInput.trim());
    const config = {
      input: tempMarkdownFile,
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempMarkdownFile); // Clean up temp file
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts[0].steps).to.be.an("array").that.has.lengthOf(11);
  });

  it("should correctly parse code in markdown input", async function () {
    // Create temp markdown file
    const tempMarkdownFile = "temp_code.md";
    fs.writeFileSync(tempMarkdownFile, codeInMarkdown.trim());
    const config = {
      input: tempMarkdownFile,
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempMarkdownFile); // Clean up temp file
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts[0].steps).to.be.an("array").that.has.lengthOf(3);
  });

  it("should correctly parse DITA XML inline input", async function () {
    // Create temp DITA file
    const tempDitaFile = "temp.dita";
    fs.writeFileSync(tempDitaFile, ditaXmlInline.trim());
    const config = {
      input: tempDitaFile,
      fileTypes: [
        {
          name: "dita",
          extensions: ["dita", "xml"],
          inlineStatements: {
            testStart: ["<\\?test\\s+([\\s\\S]*?)\\?>"],
            testEnd: ["<\\?test\\s+end\\s*\\?>"],
            ignoreStart: ["<\\?test\\s+ignore\\s+start\\s*\\?>"],
            ignoreEnd: ["<\\?test\\s+ignore\\s+end\\s*\\?>"],
            step: ["<\\?step\\s+([\\s\\S]*?)\\?>"],
          },
          markup: [
            {
              name: "checkXref",
              regex: [
                '<xref\\s+(?:[^>]*\\s+)?href\\s*=\\s*"(https?:\\/\\/[^"]+)"[^>]*>',
              ],
              actions: ["checkLink"],
            },
            {
              name: "goToXref",
              regex: [
                '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b[^<]*<xref\\s+(?:[^>]*\\s+)?href\\s*=\\s*"(https?:\\/\\/[^"]+)"[^>]*>',
              ],
              actions: ["goTo"],
            },
          ],
        },
      ],
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempDitaFile); // Clean up temp file
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    const steps = results.specs[0].tests[0].contexts[0].steps;
    expect(steps).to.be.an("array").that.has.lengthOf(3);
    // Verify step properties - only processing instruction steps since detectSteps: false
    expect(steps[0]).to.have.property("checkLink");
    expect(steps[1]).to.have.property("checkLink");
    expect(steps[2]).to.have.property("goTo");
  });

  it("should correctly parse DITA XML with markup detection", async function () {
    // Create temp DITA file
    const tempDitaFile = "temp_detected.dita";
    fs.writeFileSync(tempDitaFile, ditaXmlDetected.trim());
    const config = {
      input: tempDitaFile,
      fileTypes: [
        {
          name: "dita",
          extensions: ["dita", "xml"],
          inlineStatements: {
            testStart: ["<\\?test\\s+([\\s\\S]*?)\\?>"],
            testEnd: ["<\\?test\\s+end\\s*\\?>"],
            ignoreStart: ["<\\?test\\s+ignore\\s+start\\s*\\?>"],
            ignoreEnd: ["<\\?test\\s+ignore\\s+end\\s*\\?>"],
            step: ["<\\?step\\s+([\\s\\S]*?)\\?>"],
          },
          markup: [
            {
              name: "checkXref",
              regex: [
                '<xref\\s+(?:[^>]*\\s+)?href\\s*=\\s*"(https?:\\/\\/[^"]+)"[^>]*>',
              ],
              actions: ["checkLink"],
            },
            {
              name: "goToXref",
              regex: [
                '\\b(?:[Gg]o\\s+to|[Oo]pen|[Nn]avigate\\s+to|[Vv]isit|[Aa]ccess|[Pp]roceed\\s+to|[Ll]aunch)\\b[^<]*<xref\\s+(?:[^>]*\\s+)?href\\s*=\\s*"(https?:\\/\\/[^"]+)"[^>]*>',
              ],
              actions: ["goTo"],
            },
          ],
        },
      ],
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempDitaFile); // Clean up temp file
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    const steps = results.specs[0].tests[0].contexts[0].steps;
    // Should detect markup patterns: checkXref for first link, goToXref for "Go to" link,
    // checkXref for Get Started xref, goToXref for "Visit" link, and checkXref for reference xref
    expect(steps).to.be.an("array").that.has.lengthOf(5);
    expect(steps[0]).to.have.property("checkLink");
    expect(steps[1]).to.have.property("goTo");
    expect(steps[2]).to.have.property("checkLink");
    expect(steps[3]).to.have.property("goTo"); // "Visit" should trigger goToXref
    expect(steps[4]).to.have.property("checkLink");
  });

  it("should correctly parse DITA XML with Windows line endings", async function () {
    // Create temp DITA file with Windows CRLF line endings
    const tempDitaFile = "temp_windows.dita";
    fs.writeFileSync(tempDitaFile, ditaXmlWindowsLineEndings.trim());
    const config = {
      input: tempDitaFile,
      fileTypes: [
        {
          name: "dita",
          extensions: ["dita", "xml"],
          inlineStatements: {
            testStart: ["<\\?test\\s+([\\s\\S]*?)\\?>"],
            testEnd: ["<\\?test\\s+end\\s*\\?>"],
            ignoreStart: ["<\\?test\\s+ignore\\s+start\\s*\\?>"],
            ignoreEnd: ["<\\?test\\s+ignore\\s+end\\s*\\?>"],
            step: ["<\\?step\\s+([\\s\\S]*?)\\?>"],
          },
          markup: [
            {
              name: "checkXref",
              regex: [
                '<xref\\s+(?:[^>]*\\s+)?href\\s*=\\s*"(https?:\\/\\/[^"]+)"[^>]*>',
              ],
              actions: ["checkLink"],
            },
          ],
        },
      ],
    };
    const results = await detectAndResolveTests({ config });
    fs.unlinkSync(tempDitaFile); // Clean up temp file
    expect(results.specs).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests).to.be.an("array").that.has.lengthOf(1);
    expect(results.specs[0].tests[0].contexts).to.be.an("array").that.has.lengthOf(1);
    const steps = results.specs[0].tests[0].contexts[0].steps;
    // Should parse test with Windows line endings and detect both step and xref
    expect(steps).to.be.an("array").that.has.lengthOf(2);
    expect(steps[0]).to.have.property("checkLink");
    expect(steps[1]).to.have.property("checkLink");
  });
});
