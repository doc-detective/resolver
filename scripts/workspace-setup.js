#!/usr/bin/env node

const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

function execCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: "utf8",
      stdio: options.silent ? "pipe" : "inherit",
      ...options,
    });
  } catch (error) {
    if (!options.silent) {
      console.error(`Error executing command: ${command}`);
      console.error(error.message);
    }
    return null;
  }
}

function isInsideGitRepo() {
  const result = execCommand("git rev-parse --is-inside-work-tree", { silent: true });
  return result && result.trim() === "true";
}

function cloneOrUpdateRepo(repoUrl, targetPath, repoName) {
  console.log(`\n🔧 Setting up workspace for ${repoName}...`);
  
  if (fs.existsSync(targetPath)) {
    console.log(`📁 ${repoName} already exists, updating...`);
    process.chdir(targetPath);
    
    // Check if it's a git repository
    if (isInsideGitRepo()) {
      execCommand("git fetch --all");
      execCommand("git reset --hard origin/main");
      console.log(`✅ ${repoName} updated successfully`);
    } else {
      console.log(`⚠️  ${targetPath} exists but is not a git repository. Skipping update.`);
    }
    
    process.chdir(path.dirname(targetPath));
  } else {
    console.log(`📥 Cloning ${repoName}...`);
    const result = execCommand(`git clone ${repoUrl} ${path.basename(targetPath)}`);
    if (result !== null) {
      console.log(`✅ ${repoName} cloned successfully`);
    } else {
      console.log(`❌ Failed to clone ${repoName}`);
      return false;
    }
  }
  
  return true;
}

function installWorkspaceDependencies(workspacePath) {
  if (fs.existsSync(path.join(workspacePath, "package.json"))) {
    console.log(`📦 Installing dependencies for ${path.basename(workspacePath)}...`);
    process.chdir(workspacePath);
    execCommand("npm install");
    process.chdir("..");
  }
}

function main() {
  const workspacesDir = path.join(process.cwd(), "workspaces");
  
  // Skip if we're in CI environment or if NO_WORKSPACE_SETUP is set
  if (process.env.NO_WORKSPACE_SETUP || (process.env.CI === "true" && !process.env.FORCE_WORKSPACE_SETUP)) {
    console.log("⏭️  Skipping workspace setup (CI environment or NO_WORKSPACE_SETUP set)");
    return;
  }
  
  console.log("🚀 Setting up npm workspaces...");
  
  // Create workspaces directory if it doesn't exist
  if (!fs.existsSync(workspacesDir)) {
    fs.mkdirSync(workspacesDir, { recursive: true });
    console.log("📁 Created workspaces directory");
  }
  
  process.chdir(workspacesDir);
  
  // Clone or update doc-detective-common
  const commonRepoUrl = "https://github.com/doc-detective/common.git";
  const commonPath = path.join(workspacesDir, "doc-detective-common");
  
  if (cloneOrUpdateRepo(commonRepoUrl, commonPath, "doc-detective-common")) {
    installWorkspaceDependencies(commonPath);
  }
  
  // Return to project root
  process.chdir("..");
  
  console.log("\n🎉 Workspace setup complete!");
  console.log("💡 You can now develop both packages together using npm workspace commands:");
  console.log("   npm run test -w doc-detective-common");
  console.log("   npm run build -w doc-detective-common");
  console.log("   npm install <package> -w doc-detective-common");
}

// Run the script
if (require.main === module) {
  main();
}

module.exports = { main };