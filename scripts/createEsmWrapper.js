const fs = require("fs").promises;
const path = require("path");

async function createEsmWrapper() {
  const distDir = path.join(__dirname, "..", "dist");
  await fs.mkdir(distDir, { recursive: true });

  const esmContent = `// ESM wrapper for CommonJS output
import cjsModule from './index.js';
export const { detectTests, resolveTests, detectAndResolveTests } = cjsModule;
export default cjsModule;
`;

  await fs.writeFile(path.join(distDir, "index.mjs"), esmContent);
  console.log("Created ESM wrapper at dist/index.mjs");
}

createEsmWrapper().catch((error) => {
  console.error("Failed to create ESM wrapper:", error);
  process.exit(1);
});
