import { 
  parseAddress, 
  normalizeStreetName, 
  generateBlockIdFromAddress,
  detectBlockBoundaries,
  assignBlockIds,
  validateBlockAssignments
} from '../lib/block-detector-v2.js';

// Test data for Detroit addresses
const detroitTestCases = [
  // Standard residential addresses
  {
    input: "1234 Woodward Ave",
    expected: {
      houseNumber: 1234,
      streetName: "woodward",
      blockId: "woodward_1200_1299"
    }
  },
  // Numbered streets (Mile roads)
  {
    input: "15000 7 Mile Rd",
    expected: {
      houseNumber: 15000,
      streetName: "7_mile_rd",
      blockId: "7_mile_rd_15000_15099"
    }
  },
  // Directional prefixes
  {
    input: "500 E Jefferson Ave",
    expected: {
      houseNumber: 500,
      streetName: "e_jefferson",
      blockId: "e_jefferson_500_599"
    }
  },
  // Multi-unit addresses
  {
    input: "1234-1236 Main St",
    expected: {
      houseNumber: 1234,
      streetName: "main",
      blockId: "main_1200_1299"
    }
  },
  // Edge case: Block boundary
  {
    input: "1299 Woodward Ave",
    expected: {
      houseNumber: 1299,
      streetName: "woodward",
      blockId: "woodward_1200_1299"
    }
  },
  // Edge case: Start of block
  {
    input: "1200 Woodward Ave",
    expected: {
      houseNumber: 1200,
      streetName: "woodward",
      blockId: "woodward_1200_1299"
    }
  }
];

// Test parseAddress function
console.log('Testing parseAddress...');
detroitTestCases.forEach(testCase => {
  const result = parseAddress(testCase.input);
  const success = result && result.houseNumber === testCase.expected.houseNumber;
  console.log(`  ${success ? '✓' : '✗'} ${testCase.input} -> ${result ? result.houseNumber : 'null'}`);
  if (!success && result) {
    console.log(`    Expected: ${testCase.expected.houseNumber}, Got: ${result.houseNumber}`);
  }
});

// Test generateBlockIdFromAddress
console.log('\nTesting generateBlockIdFromAddress...');
detroitTestCases.forEach(testCase => {
  const parsed = parseAddress(testCase.input);
  const blockId = generateBlockIdFromAddress(parsed);
  const success = blockId === testCase.expected.blockId;
  console.log(`  ${success ? '✓' : '✗'} ${testCase.input} -> ${blockId}`);
  if (!success) {
    console.log(`    Expected: ${testCase.expected.blockId}, Got: ${blockId}`);
  }
});

// Test sample parcel dataset
const sampleParcels = [
  // Woodward Ave - continuous block
  { parcel_id: "001", address: "1201 Woodward Ave" },
  { parcel_id: "002", address: "1205 Woodward Ave" },
  { parcel_id: "003", address: "1209 Woodward Ave" },
  { parcel_id: "004", address: "1215 Woodward Ave" },
  { parcel_id: "005", address: "1225 Woodward Ave" },
  { parcel_id: "006", address: "1235 Woodward Ave" },
  { parcel_id: "007", address: "1245 Woodward Ave" },
  { parcel_id: "008", address: "1255 Woodward Ave" },
  
  // Gap indicating cross street
  { parcel_id: "009", address: "1301 Woodward Ave" },
  { parcel_id: "010", address: "1305 Woodward Ave" },
  { parcel_id: "011", address: "1315 Woodward Ave" },
  
  // Different street
  { parcel_id: "012", address: "500 E Jefferson Ave" },
  { parcel_id: "013", address: "510 E Jefferson Ave" },
  { parcel_id: "014", address: "520 E Jefferson Ave" },
  
  // Invalid addresses
  { parcel_id: "015", address: "Woodward Ave" }, // No number
  { parcel_id: "016", address: "" }, // Empty
  { parcel_id: "017", address: null }, // Null
];

// Test assignBlockIds
console.log('\nTesting assignBlockIds...');
const assignmentResult = assignBlockIds(sampleParcels);
console.log(`  Total parcels: ${assignmentResult.summary.totalParcels}`);
console.log(`  Successfully assigned: ${assignmentResult.summary.successfullyAssigned}`);
console.log(`  Parse errors: ${assignmentResult.summary.parseErrors}`);
console.log(`  Unique blocks: ${assignmentResult.summary.uniqueBlocks}`);
console.log(`  Unique streets: ${assignmentResult.summary.uniqueStreets}`);

console.log('\nBlock Statistics:');
Object.entries(assignmentResult.blockStats).forEach(([blockId, stats]) => {
  console.log(`  ${blockId}: ${stats.count} parcels (${stats.minNumber}-${stats.maxNumber})`);
});

// Test natural boundary detection
console.log('\nTesting detectBlockBoundaries...');
const woodwardParcels = sampleParcels.filter(p => p.address && p.address.includes('Woodward'));
const boundaries = detectBlockBoundaries(woodwardParcels);
console.log(`  Found ${boundaries.length} natural boundaries on Woodward:`);
boundaries.forEach((boundary, i) => {
  console.log(`    Block ${i + 1}: ${boundary.start}-${boundary.end} (${boundary.addresses.length} parcels)`);
});

// Test validation
console.log('\nTesting validateBlockAssignments...');
const validation = validateBlockAssignments(assignmentResult);
console.log(`  Validation result: ${validation.valid ? 'VALID' : 'INVALID'}`);
if (validation.issues.length > 0) {
  console.log('  Issues found:');
  validation.issues.forEach(issue => {
    console.log(`    [${issue.severity}] ${issue.type}: ${issue.message}`);
  });
}

// Performance test
console.log('\nPerformance Test...');
const largeParcels = [];
for (let i = 0; i < 10000; i++) {
  largeParcels.push({
    parcel_id: `P${i}`,
    address: `${1000 + (i % 500)} ${['Woodward Ave', 'Main St', 'Jefferson Ave'][i % 3]}`
  });
}

const startTime = Date.now();
const largeResult = assignBlockIds(largeParcels);
const endTime = Date.now();

console.log(`  Processed ${largeParcels.length} parcels in ${endTime - startTime}ms`);
console.log(`  Speed: ${Math.round(largeParcels.length / ((endTime - startTime) / 1000))} parcels/second`);

// Export test results for verification
export const testResults = {
  addressParsing: detroitTestCases,
  sampleAssignment: assignmentResult,
  performanceMetrics: {
    parcelsProcessed: largeParcels.length,
    timeMs: endTime - startTime,
    parcelsPerSecond: Math.round(largeParcels.length / ((endTime - startTime) / 1000))
  }
};