const fs = require("fs");
const { detectTests } = require("./src/index");

// Test DITA content with various patterns
const ditaContent = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE task PUBLIC "-//OASIS//DTD DITA Task//EN" "task.dtd">
<task id="test-comprehensive">
  <title>Comprehensive DITA Test</title>
  <!-- test
testId: comprehensive-dita-test
detectSteps: true
-->
  <taskbody>
    <steps>
      <!-- Test 1: Click with uicontrol -->
      <step>
        <cmd>Click the <uicontrol>Submit</uicontrol> button.</cmd>
      </step>
      
      <!-- Test 2: Type with userinput and uicontrol -->
      <step>
        <cmd>Type <userinput>testuser</userinput> into the <uicontrol>Username</uicontrol> field</cmd>
      </step>
      
      <!-- Test 3: Navigate to URL -->
      <step>
        <cmd>Navigate to <xref href="https://example.com" format="html" scope="external">Example Site</xref></cmd>
      </step>
      
      <!-- Test 4: Run shell command -->
      <step>
        <cmd>Run the following command</cmd>
        <info>
          <codeblock outputclass="shell">echo "Hello World"</codeblock>
        </info>
      </step>
      
      <!-- Test 5: Verify system output -->
      <step>
        <cmd>Verify the output shows <systemoutput>Success</systemoutput></cmd>
      </step>
      
      <!-- Test 6: Window title verification -->
      <step>
        <cmd>Check that <wintitle>Login Dialog</wintitle> appears</cmd>
      </step>
      
      <!-- Test 7: External link check -->
      <step>
        <cmd>Check <xref href="https://docs.example.com" scope="external">documentation link</xref></cmd>
      </step>
      
      <!-- Test 8: Keyboard shortcut -->
      <step>
        <cmd>Press <shortcut>Ctrl+S</shortcut> to save</cmd>
      </step>
      
      <!-- Test 9: Command execution -->
      <step>
        <cmd>Execute <cmdname>npm install</cmdname></cmd>
      </step>
    </steps>
  </taskbody>
  <!-- test end -->
</task>
`;

async function runTest() {
  const tempFile = "temp_comprehensive_test.dita";
  
  try {
    // Write test file
    fs.writeFileSync(tempFile, ditaContent.trim());
    
    // Detect tests
    const config = {
      input: tempFile,
      detectSteps: true,
      logLevel: "error",
      fileTypes: [
        "markdown",
        "asciidoc", 
        "html",
        {
          name: "dita",
          extensions: ["dita", "ditamap", "xml"],
          inlineStatements: {
            testStart: [
              "<\\?doc-detective\\s+test\\s+([\\s\\S]*?)\\s*\\?>",
              "<!--\\s*test\\s*([\\s\\S]*?)\\s*-->",
            ],
            testEnd: [
              "<\\?doc-detective\\s+test\\s+end\\s*\\?>",
              "<!--\\s*test end\\s*([\\s\\S]*?)\\s*-->",
            ],
            ignoreStart: [
              "<\\?doc-detective\\s+test\\s+ignore\\s+start\\s*\\?>",
              "<!--\\s*test ignore start\\s*-->",
            ],
            ignoreEnd: [
              "<\\?doc-detective\\s+test\\s+ignore\\s+end\\s*\\?>",
              "<!--\\s*test ignore end\\s*-->",
            ],
            step: [
              "<\\?doc-detective\\s+step\\s+([\\s\\S]*?)\\s*\\?>",
              "<!--\\s*step\\s*([\\s\\S]*?)\\s*-->",
            ],
          },
          markup: []
        }
      ]
    };
    
    const result = await detectTests({ config });
    
    // Clean up
    fs.unlinkSync(tempFile);
    
    // Display results
    console.log("Test Results:");
    console.log("=============");
    console.log(`Number of specs detected: ${result.length}`);
    
    if (result.length > 0) {
      const spec = result[0];
      console.log(`\nSpec ID: ${spec.specId}`);
      console.log(`Number of tests: ${spec.tests.length}`);
      
      if (spec.tests.length > 0) {
        const test = spec.tests[0];
        console.log(`\nTest ID: ${test.testId}`);
        console.log(`Number of steps: ${test.steps.length}`);
        console.log("\nDetected steps:");
        test.steps.forEach((step, index) => {
          console.log(`\n${index + 1}. ${JSON.stringify(step, null, 2)}`);
        });
      }
    } else {
      console.log("No specs detected!");
    }
    
  } catch (error) {
    console.error("Error:", error.message);
    console.error(error.stack);
    // Clean up on error
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

runTest();
