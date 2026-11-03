const BASE_URL = 'http://localhost:5000/api';

async function runTests() {
  console.log('=== STARTING CLIENT VAULT INTEGRATION TESTS ===');
  let passed = 0;
  let failed = 0;

  function assert(condition: boolean, desc: string) {
    if (condition) {
      console.log(`✅ PASS: ${desc}`);
      passed++;
    } else {
      console.error(`❌ FAIL: ${desc}`);
      failed++;
    }
  }

  // 1. Authenticate as Firm Owner (Kapil)
  console.log('\n--- 1. Authenticating as Firm Owner (Kapil) ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kapil@manavi.com', password: 'Admin@123' }),
  });
  const loginData = await loginRes.json();
  assert(loginRes.ok && !!loginData.token, 'Firm Owner login successful');
  const token = loginData.token;
  const orgId = loginData.user.organization.id;

  // 2. Query authorized clients before creation
  console.log('\n--- 2. Fetching current authorized clients ---');
  const initialClientsRes = await fetch(`${BASE_URL}/clients?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const initialClientsData = await initialClientsRes.json();
  assert(initialClientsData.success === true, 'Successfully fetched authorized clients list');
  const initialCount = initialClientsData.data.length;
  console.log(`Initial authorized client count: ${initialCount}`);

  // 3. Create a brand new client with unique timestamp and PAN
  const randNum = Math.floor(1000 + Math.random() * 9000);
  const testClientName = `Apex Robotics Labs ${Date.now()}`;
  const testClientPan = `APEXR${randNum}K`;

  console.log(`\n--- 3. Creating brand new client: "${testClientName}" ---`);
  const createClientRes = await fetch(`${BASE_URL}/clients`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      name: testClientName,
      clientType: 'PRIVATE_LIMITED',
      pan: testClientPan,
      gstin: `36AAACR${randNum}A1ZZ`,
      email: `finance@apexrobotics${randNum}.com`,
      mobile: '9876543210',
      status: 'ACTIVE',
    }),
  });
  const createClientData = await createClientRes.json();
  assert(createClientRes.status === 201 && createClientData.success === true, 'Client created successfully in backend');
  const createdClient = createClientData.client;
  assert(!!createdClient.id && createdClient.name === testClientName, 'Created client has valid UUID id and correct name');
  console.log(`Created Client ID: ${createdClient.id}`);

  // 4. Verify newly created client immediately appears in authorized clients endpoint (Requirement 1 & 3)
  console.log('\n--- 4. Verify client immediately appears in refreshed client list ---');
  const refreshedClientsRes = await fetch(`${BASE_URL}/clients?limit=100`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const refreshedClientsData = await refreshedClientsRes.json();
  const foundClient = (refreshedClientsData.data || []).find((c: any) => c.id === createdClient.id);
  assert(!!foundClient, 'Newly created client is present in authorized client list');
  assert(foundClient?.name === testClientName, 'Client name matches exactly');
  assert(foundClient?.organizationId === orgId, 'Client belongs to current user organization (tenant isolation)');

  // 5. Test uploading a document to vault with the selected client ID (Requirement 7)
  console.log('\n--- 5. Upload document to Client Vault with client ID ---');
  const docTitle = `Board Resolution FY 2026 - ${testClientName}`;
  const uploadDocRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: createdClient.id,
      name: docTitle,
      category: 'ROC',
      fileUrl: '/uploads/board_resolution_apex.pdf',
      fileSize: 452000,
      fileType: 'application/pdf',
    }),
  });
  const uploadDocData = await uploadDocRes.json();
  assert(uploadDocRes.status === 201 && uploadDocData.success === true, 'Vault document upload returned 201 Created');
  const createdDoc = uploadDocData.document;
  assert(createdDoc.clientId === createdClient.id, 'Document persisted in DB with exact selected client ID');
  assert(createdDoc.organizationId === orgId, 'Document persisted in DB with correct tenant organizationId');

  // 6. Query vault filtered by the new client's ID
  console.log('\n--- 6. Query vault by new client ID ---');
  const vaultQueryRes = await fetch(`${BASE_URL}/documents/vault?clientId=${createdClient.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const vaultQueryData = await vaultQueryRes.json();
  assert(vaultQueryData.success === true && Array.isArray(vaultQueryData.data), 'Vault query succeeded');
  const docInVault = (vaultQueryData.data || []).find((d: any) => d.id === createdDoc.id);
  assert(!!docInVault, 'Uploaded document retrieved from vault for this client');
  assert(docInVault?.client?.name === testClientName, 'Vault document returns linked client name');

  // 7. Test invalid / cross-tenant client ID upload rejection (Requirement 6 & 7)
  console.log('\n--- 7. Test upload rejection for non-existent / cross-tenant client ID ---');
  const fakeUuid = '00000000-0000-0000-0000-000000000000';
  const badUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      clientId: fakeUuid,
      name: 'Unauthorized Cross-Tenant Attempt',
      category: 'AUDIT',
    }),
  });
  const badUploadData = await badUploadRes.json();
  assert(badUploadRes.status === 404 && badUploadData.success === false, 'Upload with invalid/cross-tenant client was rejected with 404');

  // 8. Test Client role isolation (Role permissions - Requirement 6)
  console.log('\n--- 8. Testing Client Role isolation ---');
  const clientLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@amdairy.com', password: 'Client@123' }),
  });
  const clientLoginData = await clientLoginRes.json();
  if (clientLoginRes.ok && clientLoginData.token) {
    const clientToken = clientLoginData.token;
    const clientOnlyListRes = await fetch(`${BASE_URL}/clients`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    const clientOnlyListData = await clientOnlyListRes.json();
    const canSeeOthers = (clientOnlyListData.data || []).some((c: any) => c.id === createdClient.id);
    assert(!canSeeOthers, 'Client role user CANNOT see other clients in client list');
  } else {
    console.log('Skipping client role test: client user not active');
  }

  console.log(`\n========================================`);
  console.log(`RESULTS: ${passed} PASSED, ${failed} FAILED`);
  console.log(`========================================`);
  if (failed > 0) process.exit(1);
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
