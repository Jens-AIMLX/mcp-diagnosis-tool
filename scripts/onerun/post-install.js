#!/usr/bin/env node

/**
 * Post-installation script for CognitiveVisualReq MCP Server
 * Sets up directories, checks dependencies, and provides setup guidance
 */

const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

const PACKAGE_VERSION = '0.5.0';

console.log(`🎯 CognitiveVisualReq MCP Server v${PACKAGE_VERSION} - Post-Installation Setup`);
console.log('=' .repeat(70));

// Create necessary directories
function createDirectories() {
  console.log('📁 Creating necessary directories...');
  
  const directories = [
    'screenshots',
    'reports', 
    'archive',
    'archive/screenshots',
    'archive/reports',
    'archive/calibration',
    'archive/difference',
    'calibration',
    'difference'
  ];

  let created = 0;
  directories.forEach(dir => {
    const dirPath = path.join(process.cwd(), dir);
    if (!fs.existsSync(dirPath)) {
      fs.mkdirSync(dirPath, { recursive: true });
      console.log(`  ✅ Created: ${dir}/`);
      created++;
    } else {
      console.log(`  ℹ️  Exists: ${dir}/`);
    }
  });

  console.log(`📊 Created ${created} new directories\n`);
}

// Check Python dependencies
function checkPythonDependencies() {
  console.log('🐍 Checking Python dependencies...');
  
  try {
    // Check if Python is available
    const pythonVersion = execSync('python --version 2>&1', { encoding: 'utf8' }).trim();
    console.log(`  ✅ Python found: ${pythonVersion}`);
    
    // Check required packages
    const requiredPackages = ['pytesseract', 'pillow'];
    const missingPackages = [];
    
    for (const pkg of requiredPackages) {
      try {
        execSync(`python -c "import ${pkg.replace('-', '_')}"`, { stdio: 'ignore' });
        console.log(`  ✅ ${pkg} is installed`);
      } catch (error) {
        console.log(`  ❌ ${pkg} is missing`);
        missingPackages.push(pkg);
      }
    }
    
    if (missingPackages.length > 0) {
      console.log('\n⚠️  Missing Python packages detected!');
      console.log('📝 To install missing packages, run:');
      console.log(`   pip install ${missingPackages.join(' ')}`);
      console.log('');
    } else {
      console.log('  🎉 All Python dependencies are satisfied!\n');
    }
    
  } catch (error) {
    console.log('  ❌ Python not found or not accessible');
    console.log('  📝 Please install Python 3.8+ and ensure it\'s in your PATH');
    console.log('  🔗 Download from: https://www.python.org/downloads/\n');
  }
}

// Check system dependencies
function checkSystemDependencies() {
  console.log('🔧 Checking system dependencies...');
  
  // Check Node.js version
  const nodeVersion = process.version;
  const majorVersion = parseInt(nodeVersion.slice(1).split('.')[0]);
  
  if (majorVersion >= 16) {
    console.log(`  ✅ Node.js version: ${nodeVersion}`);
  } else {
    console.log(`  ⚠️  Node.js version: ${nodeVersion} (recommend 16+)`);
  }
  
  // Check npm version
  try {
    const npmVersion = execSync('npm --version', { encoding: 'utf8' }).trim();
    console.log(`  ✅ npm version: ${npmVersion}`);
  } catch (error) {
    console.log('  ❌ npm not found');
  }
  
  console.log('');
}

// Generate sample configuration
function generateSampleConfig() {
  console.log('⚙️  Generating sample configuration...');
  
  const sampleConfig = {
    "mcpServers": {
      "cognitive-visual-req": {
        "command": "cognitive-visual-req",
        "args": ["start"],
        "env": {
          "VISUAL_DIFF_DEFAULT_PRECALIBRATION": "ON",
          "VISUAL_DIFF_DEFAULT_OCR": "both",
          "VISUAL_DIFF_DEFAULT_COLOR": "elements",
          "VISUAL_DIFF_DEFAULT_DIMENSIONS": "both",
          "VISUAL_DIFF_DEFAULT_ELEMENTS": "both",
          "VISUAL_DIFF_DEFAULT_AREA_WEIGHT": "0.7",
          "VISUAL_DIFF_PROVIDE_REPORT": "ON",
          "REPORT_PATH": "./reports",
          "VISUAL_DIFF_AUTO_ARCHIVE": "ON",
          "ARCHIVE_PATH": "./archive",
          "VISUAL_DIFF_ARCHIVE_RETENTION_DAYS": "30",
          "VISUAL_DIFF_MAX_FILES_PER_DIR": "100"
        }
      }
    }
  };
  
  const configPath = path.join(process.cwd(), 'mcp-config-sample.json');
  
  if (!fs.existsSync(configPath)) {
    fs.writeFileSync(configPath, JSON.stringify(sampleConfig, null, 2));
    console.log(`  ✅ Created: mcp-config-sample.json`);
  } else {
    console.log(`  ℹ️  Sample config already exists: mcp-config-sample.json`);
  }
  
  console.log('');
}

// Show setup instructions
function showSetupInstructions() {
  console.log('📋 Setup Instructions');
  console.log('-' .repeat(30));
  
  console.log('1️⃣  **Test Installation**');
  console.log('   cognitive-visual-req test');
  console.log('   # or');
  console.log('   npx cognitive-visual-req test');
  console.log('');
  
  console.log('2️⃣  **Start MCP Server**');
  console.log('   cognitive-visual-req start');
  console.log('   # or for HTTP server mode');
  console.log('   cognitive-visual-req server --port 3200');
  console.log('');
  
  console.log('3️⃣  **Add to MCP Host Configuration**');
  console.log('   Copy the configuration from mcp-config-sample.json');
  console.log('   to your MCP host (Cursor, Claude Desktop, etc.)');
  console.log('');
  
  console.log('4️⃣  **Verify Health**');
  console.log('   cognitive-visual-req health');
  console.log('   # Check server is running properly');
  console.log('');
  
  console.log('📚 **Documentation**');
  console.log('   README_v0.5.md              - Complete user guide');
  console.log('   DEPLOYMENT_CHECKLIST_v0.5.md - Production deployment');
  console.log('   GitHub: https://github.com/cognitive-visual-req/mcp-server');
  console.log('');
}

// Show available commands
function showAvailableCommands() {
  console.log('🛠️  Available Commands');
  console.log('-' .repeat(30));
  
  const commands = [
    ['cognitive-visual-req start', 'Start MCP server'],
    ['cognitive-visual-req server', 'Start HTTP server'],
    ['cognitive-visual-req test', 'Run test suite'],
    ['cognitive-visual-req health', 'Check server health'],
    ['cognitive-visual-req help', 'Show help'],
    ['cognitive-visual-req version', 'Show version']
  ];
  
  commands.forEach(([cmd, desc]) => {
    console.log(`   ${cmd.padEnd(30)} ${desc}`);
  });
  
  console.log('');
}

// Main setup process
function main() {
  try {
    createDirectories();
    checkSystemDependencies();
    checkPythonDependencies();
    generateSampleConfig();
    showSetupInstructions();
    showAvailableCommands();
    
    console.log('🎉 Installation completed successfully!');
    console.log('🚀 Ready to start using CognitiveVisualReq MCP Server v' + PACKAGE_VERSION);
    console.log('');
    console.log('Next steps:');
    console.log('  1. Run: cognitive-visual-req test');
    console.log('  2. Configure your MCP host with the sample config');
    console.log('  3. Start using the visual analysis tools!');
    console.log('');
    
  } catch (error) {
    console.error('❌ Post-installation setup failed:', error.message);
    console.error('');
    console.error('Please check the error above and try manual setup:');
    console.error('  1. Create directories: screenshots, reports, archive');
    console.error('  2. Install Python dependencies: pip install pytesseract pillow');
    console.error('  3. Test installation: cognitive-visual-req test');
    process.exit(1);
  }
}

// Run post-install setup
main();
