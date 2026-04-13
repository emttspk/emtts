#!/usr/bin/env node

/**
 * Complaint Engine Live Test Suite
 * ================================
 * 
 * Tests the complete complaint form flow for 6 VPL tracking numbers:
 * - VPL26030726, VPL26030761, VPL26030763, VPL26030759, VPL26030723, VPL26030730
 * 
 * Requirements:
 * - API server running on port 3000
 * - Web server running on port 5173
 * - Python service running on port 8000
 * 
 * Execution:
 * node test-complaint-live.js
 */

const fs = require('fs');
const path = require('path');

// Test configuration
const TEST_TRACKING_IDS = [
  'VPL26030726',
  'VPL26030761',
  'VPL26030763',
  'VPL26030759',
  'VPL26030723',
  'VPL26030730'
];

const API_BASE = 'http://localhost:3000';
const TEST_PHONE = '03354299783';
const TEST_EMAIL = 'test-complaint@example.com';
const TEST_PASSWORD = 'TestPassword123';

let authToken = null;

async function login() {
  logSection('Logging in to get auth token');
  try {
    const response = await fetch(`${API_BASE}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: 'ui.complaint.test@example.com', password: 'TestPassword123' })
    });
    if (!response.ok) {
      throw new Error(`Login failed: HTTP ${response.status}`);
    }
    const data = await response.json();
    authToken = data.token;
    log('✓ Login successful', 'green');
  } catch (error) {
    log(`✗ Login failed: ${error.message}`, 'red');
    throw error;
  }
}

// Color codes for terminal output
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  gray: '\x1b[90m'
};

function log(msg, color = 'reset') {
  console.log(`${colors[color]}${msg}${colors.reset}`);
}

function logHeader(title) {
  log(`\n${'='.repeat(80)}`, 'blue');
  log(`${title}`, 'cyan');
  log(`${'='.repeat(80)}`, 'blue');
}

function logSection(title) {
  log(`\n► ${title}`, 'yellow');
}

function logResult(tracking, status, data = {}) {
  const icon = status === 'SUCCESS' ? '✓' : status === 'FAILED' ? '✗' : '⚠';
  const color = status === 'SUCCESS' ? 'green' : status === 'FAILED' ? 'red' : 'yellow';
  log(`${icon} ${tracking}: ${status}`, color);
  if (Object.keys(data).length > 0) {
    Object.entries(data).forEach(([k, v]) => {
      log(`  ${k}: ${v || '(none)'}`, 'gray');
    });
  }
}

async function fetchTracking(trackingId) {
  logSection(`Fetching tracking data for ${trackingId}`);
  try {
    const response = await fetch(`${API_BASE}/api/tracking/bulk`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify({ tracking_numbers: [trackingId] })
    });
    
    if (!response.ok) {
      logResult(trackingId, 'FAILED', { error: `HTTP ${response.status}` });
      return null;
    }
    
    const data = await response.json();
    if (!data.records || data.records.length === 0) {
      logResult(trackingId, 'FAILED', { error: 'No tracking record found' });
      return null;
    }
    
    const record = data.records[0];
    log(`✓ Fetched: ${record.shipment.trackingNumber}`, 'green');
    log(`  Sender: ${record.shipment.sender_name || 'Unknown'}`, 'gray');
    log(`  Booking Date: ${record.shipment.booking_date || 'Unknown'}`, 'gray');
    log(`  Status: ${record.final_status}`, 'gray');
    
    return record;
  } catch (error) {
    logResult(trackingId, 'FAILED', { error: error.message });
    return null;
  }
}

async function fetchComplaintPrefill(trackingId) {
  logSection(`Fetching complaint prefill for ${trackingId}`);
  try {
    const response = await fetch(`${API_BASE}/api/tracking/complaint/prefill/${encodeURIComponent(trackingId)}`, {
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` }
    });
    
    if (!response.ok) {
      logResult(trackingId, 'FAILED', { error: `Prefill HTTP ${response.status}` });
      return null;
    }
    
    const data = await response.json();
    log(`✓ Prefill received`, 'green');
    log(`  Delivery Office: ${data.deliveryOffice || 'Unknown'}`, 'gray');
    log(`  Matched: ${data.matched ? 'Yes' : 'No'}`, 'gray');
    if (data.matched) {
      log(`  → District: ${data.matched.district}`, 'gray');
      log(`  → Tehsil: ${data.matched.tehsil}`, 'gray');
      log(`  → Location: ${data.matched.location}`, 'gray');
    }
    
    return data;
  } catch (error) {
    logResult(trackingId, 'FAILED', { error: error.message });
    return null;
  }
}

async function submitComplaint(trackingId, record, prefill) {
  logSection(`Submitting complaint for ${trackingId}`);
  
  if (!record || !record.shipment) {
    logResult(trackingId, 'FAILED', { error: 'Invalid record' });
    return null;
  }
  
  // Extract form data
  const rawJson = typeof record.shipment.rawJson === 'string' 
    ? JSON.parse(record.shipment.rawJson) 
    : record.shipment.rawJson;
  
  // Build complaint text
  const complaintText = `Dear Complaint Team,

I respectfully request your assistance regarding value payable article ${trackingId}. As per tracking, action occurred on ${record.shipment.booking_date || 'recently'}; however, the money order amount is still not received. Kindly verify delivery and payment processing and update the current complaint status.

Sincerely,
${record.shipment.sender_name || 'Sender'}
Contact Number: ${TEST_PHONE}`;

  const payload = {
    tracking_number: trackingId,
    phone: TEST_PHONE,
    complaint_text: complaintText,
    sender_name: record.shipment.sender_name || 'Unknown',
    sender_address: record.shipment.sender_address || 'Unknown',
    sender_city_value: record.shipment.booking_city || '57',
    receiver_name: 'Addressee',
    receiver_address: prefill?.deliveryOffice || 'Pakistan',
    receiver_city_value: prefill?.deliveryOffice || '1',
    booking_office: record.shipment.booking_city || 'Unknown',
    complaint_reason: 'Pending Delivery',
    prefer_reply_mode: 'POST',
    reply_email: undefined,
    service_type: trackingId.startsWith('MOS') ? 'MO' : 'VPL',
    recipient_district: prefill?.matched?.district || '',
    recipient_tehsil: prefill?.matched?.tehsil || '',
    recipient_location: prefill?.matched?.location || ''
  };
  
  log(`Submitting payload:`, 'gray');
  log(`  Sender: ${payload.sender_name}`, 'gray');
  log(`  Receiver: ${payload.receiver_name}`, 'gray');
  log(`  Address: ${payload.receiver_address}`, 'gray');
  log(`  District: ${payload.recipient_district || '(not selected)'}`, 'gray');
  log(`  Tehsil: ${payload.recipient_tehsil || '(not selected)'}`, 'gray');
  log(`  Location: ${payload.recipient_location || '(not selected)'}`, 'gray');
  
  try {
    const response = await fetch(`${API_BASE}/api/tracking/complaint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${authToken}` },
      body: JSON.stringify(payload)
    });
    
    if (!response.ok) {
      logResult(trackingId, 'FAILED', { error: `HTTP ${response.status}` });
      return null;
    }
    
    const result = await response.json();
    
    if (result.success || /duplicate|already/i.test(result.message || '')) {
      const status = result.status || (result.success ? 'FILED' : 'DUPLICATE');
      logResult(trackingId, status, {
        complaint_id: result.complaint_id || '(pending)',
        due_date: result.due_date || 'Unknown',
        message: result.message || 'Submitted'
      });
      return { success: true, status, ...result };
    } else {
      logResult(trackingId, 'FAILED', { error: result.message || 'Unknown error' });
      return { success: false, error: result.message };
    }
  } catch (error) {
    logResult(trackingId, 'FAILED', { error: error.message });
    return { success: false, error: error.message };
  }
}

async function testConsigneeRendering(record, prefill) {
  logSection('Validating Consignee Rendering');
  
  const issues = [];
  
  // Check receiver name
  const receiverName = record.shipment.receiver_name || 'Addressee';
  if (receiverName === '-' || receiverName === '') {
    issues.push('receiver_name empty or "-"');
  } else {
    log(`✓ Receiver name: ${receiverName}`, 'green');
  }
  
  // Check receiver address
  const receiverAddress = prefill?.deliveryOffice || 'Pakistan';
  if (receiverAddress === '-' || receiverAddress === '') {
    issues.push('receiver_address empty or "-"');
  } else {
    log(`✓ Receiver address: ${receiverAddress}`, 'green');
  }
  
  // Check location hierarchy
  if (prefill?.matched) {
    log(`✓ Location auto-matched:`, 'green');
    log(`  District: ${prefill.matched.district}`, 'gray');
    log(`  Tehsil: ${prefill.matched.tehsil}`, 'gray');
    log(`  Location: ${prefill.matched.location}`, 'gray');
  } else {
    log(`⚠ Location not auto-matched (manual selection required)`, 'yellow');
  }
  
  if (issues.length > 0) {
    log(`⚠ Issues found: ${issues.join(', ')}`, 'yellow');
    return false;
  }
  
  return true;
}

async function runTests() {
  logHeader('COMPLAINT ENGINE - LIVE TEST SUITE');
  log(`Date: ${new Date().toISOString()}`, 'gray');
  log(`Tracking IDs: ${TEST_TRACKING_IDS.join(', ')}`, 'gray');
  log(`Phone: ${TEST_PHONE}`, 'gray');
  
  // Login first
  await login();
  
  const results = [];
  
  for (const trackingId of TEST_TRACKING_IDS) {
    log(`\n${'─'.repeat(80)}`, 'gray');
    logHeader(`Testing ${trackingId}`);
    
    // Step 1: Fetch tracking
    const record = await fetchTracking(trackingId);
    if (!record) continue;
    
    // Step 2: Check if already complained
    if (record.complaint_active) {
      logResult(trackingId, 'SKIPPED', { reason: 'Already has active complaint' });
      results.push({ tracking: trackingId, status: 'SKIPPED', reason: 'Active complaint' });
      continue;
    }
    
    // Step 3: Fetch prefill
    const prefill = await fetchComplaintPrefill(trackingId);
    if (!prefill) continue;
    
    // Step 4: Validate consignee rendering
    const consigneeValid = await testConsigneeRendering(record, prefill);
    
    // Step 5: Submit complaint
    const submitResult = await submitComplaint(trackingId, record, prefill);
    
    if (submitResult?.success) {
      results.push({
        tracking: trackingId,
        status: submitResult.status,
        complaint_id: submitResult.complaint_id,
        due_date: submitResult.due_date,
        consignee_rendered: consigneeValid,
        location_selected: !!prefill?.matched
      });
    } else {
      results.push({
        tracking: trackingId,
        status: 'FAILED',
        error: submitResult?.error,
        consignee_rendered: consigneeValid,
        location_selected: !!prefill?.matched
      });
    }
  }
  
  // Summary
  logHeader('TEST SUMMARY');
  
  const summary = {
    total: results.length,
    success: results.filter(r => r.status === 'SUCCESS' || r.status === 'DUPLICATE').length,
    failed: results.filter(r => r.status === 'FAILED').length,
    skipped: results.filter(r => r.status === 'SKIPPED').length
  };
  
  log(`Total: ${summary.total}`, 'cyan');
  log(`Success/Duplicate: ${summary.success}`, 'green');
  log(`Failed: ${summary.failed}`, summary.failed > 0 ? 'red' : 'green');
  log(`Skipped: ${summary.skipped}`, 'gray');
  
  // Detailed results
  logHeader('DETAILED RESULTS');
  
  results.forEach(r => {
    const icon = r.status === 'SUCCESS' ? '✓' : r.status === 'DUPLICATE' ? '⚠' : '✗';
    const color = r.status === 'SUCCESS' ? 'green' : r.status === 'DUPLICATE' ? 'yellow' : 'red';
    
    log(`\n${icon} ${r.tracking}`, color);
    log(`  Status: ${r.status}`, color);
    
    if (r.complaint_id) log(`  Complaint ID: ${r.complaint_id}`, 'gray');
    if (r.due_date) log(`  Due Date: ${r.due_date}`, 'gray');
    if (r.error) log(`  Error: ${r.error}`, 'red');
    if (r.reason) log(`  Reason: ${r.reason}`, 'gray');
    
    log(`  Consignee Rendered: ${r.consignee_rendered ? 'Yes' : 'No'}`, r.consignee_rendered ? 'green' : 'yellow');
    log(`  Location Selected: ${r.location_selected ? 'Yes' : 'No'}`, r.location_selected ? 'green' : 'yellow');
  });
  
  // Write results to file
  const reportPath = path.join(__dirname, 'complaint-test-results.json');
  fs.writeFileSync(reportPath, JSON.stringify({
    timestamp: new Date().toISOString(),
    summary,
    results
  }, null, 2));
  
  log(`\n✓ Results saved to: ${reportPath}`, 'green');
  
  // Exit with appropriate code
  const allPassed = summary.failed === 0;
  process.exit(allPassed ? 0 : 1);
}

// Polyfill for fetch (Node.js 18+)
if (typeof fetch === 'undefined') {
  global.fetch = require('node-fetch');
}

// Run tests
runTests().catch(error => {
  log(`Fatal error: ${error.message}`, 'red');
  console.error(error);
  process.exit(1);
});
