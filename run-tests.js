#!/usr/bin/env node

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

console.log('🧪 Running Block Detection Tests...\n');

// Run the test file
const testProcess = spawn('node', [join(__dirname, 'tests/block-detection.test.js')], {
  stdio: 'inherit'
});

testProcess.on('close', (code) => {
  if (code === 0) {
    console.log('\n✅ All tests completed successfully!');
    console.log('\n📊 To visualize block assignments:');
    console.log('   1. Open tools/block-visualizer.html in a web browser');
    console.log('   2. Click "Load Test Data" to see sample blocks');
    console.log('   3. Or load your own CSV file with address, lat, lng columns');
  } else {
    console.log('\n❌ Tests failed with exit code:', code);
  }
});