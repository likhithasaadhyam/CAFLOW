import fs from 'fs';
import path from 'path';

const BASE_URL = 'http://localhost:5000/api';
const UPLOAD_DIR = path.resolve(process.cwd(), 'uploads', 'vault');

interface TestResult {
  testName: string;
  passed: boolean;
  details: string;
}

const results: TestResult[] = [];

function record(testName: string, passed: boolean, details: string) {
  results.push({ testName, passed, details });
  if (passed) {
    console.log(`✅ PASS: ${testName} - ${details}`);
  } else {
    console.error(`❌ FAIL: ${testName} - ${details}`);
  }
}

async function runUploadTestSuite() {
  console.log('=====================================================');
  console.log('STARTING COMPLETE CLIENT VAULT UPLOAD TEST SUITE');
  console.log('=====================================================');

  // 1. Authenticate as Firm Owner (Kapil)
  console.log('\n--- 1. Authenticating as Firm Owner ---');
  const loginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'kapil@manavi.com', password: 'Admin@123' }),
  });
  const loginData = await loginRes.json();
  const token = loginData.token;
  const orgId = loginData.user.organization.id;
  record('Firm Owner Authentication', !!token, `Token obtained, orgId=${orgId}`);

  // 2. Fetch an authorized client to test with
  console.log('\n--- 2. Fetching Authorized Client ---');
  const clientsRes = await fetch(`${BASE_URL}/clients?limit=5`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const clientsData = await clientsRes.json();
  const testClient = clientsData.data[0];
  record('Authorized Client Retrieved', !!testClient?.id, `Target client: ${testClient.name} (${testClient.id})`);

  // Helper to build multipart body with boundary
  function createMultipartBody(fields: Record<string, string>, file?: { name: string; filename: string; contentType: string; data: Buffer }) {
    const boundary = '----WebKitFormBoundary' + Math.random().toString(36).substring(2);
    const parts: Buffer[] = [];

    for (const [key, val] of Object.entries(fields)) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${key}"\r\n\r\n${val}\r\n`));
    }

    if (file) {
      parts.push(Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${file.name}"; filename="${file.filename}"\r\nContent-Type: ${file.contentType}\r\n\r\n`));
      parts.push(file.data);
      parts.push(Buffer.from('\r\n'));
    }

    parts.push(Buffer.from(`--${boundary}--\r\n`));
    const body = Buffer.concat(parts);

    return {
      contentType: `multipart/form-data; boundary=${boundary}`,
      body,
    };
  }

  let pdfDocId = '';
  let pdfDiskFilename = '';

  // 3. Test uploading a valid PDF file
  console.log('\n--- 3. Upload Valid PDF Document ---');
  const pdfContent = Buffer.from('%PDF-1.4\n1 0 obj\n<< /Title (Audit Report FY 2026) >>\nendobj\ntrailer\n<< /Root 1 0 R >>\n%%EOF');
  const pdfMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: 'Statutory Audit Report FY 2025-26',
      category: 'AUDIT',
    },
    {
      name: 'file',
      filename: 'statutory_audit_2026.pdf',
      contentType: 'application/pdf',
      data: pdfContent,
    }
  );

  const pdfUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': pdfMultipart.contentType,
    },
    body: pdfMultipart.body,
  });
  const pdfUploadData = await pdfUploadRes.json();
  const pdfPassed = pdfUploadRes.status === 201 && pdfUploadData.success === true && !!pdfUploadData.document?.id;
  record('Valid PDF Upload API', pdfPassed, `Status: ${pdfUploadRes.status}, Doc ID: ${pdfUploadData.document?.id}`);

  if (pdfPassed) {
    pdfDocId = pdfUploadData.document.id;
    pdfDiskFilename = path.basename(pdfUploadData.document.fileUrl);
    const diskPath = path.resolve(UPLOAD_DIR, pdfDiskFilename);
    const fileExistsOnDisk = fs.existsSync(diskPath);
    const diskSize = fileExistsOnDisk ? fs.statSync(diskPath).size : 0;
    record('PDF File Exists on Server Disk Storage', fileExistsOnDisk && diskSize === pdfContent.length, `Path: ${diskPath}, Size: ${diskSize} bytes`);

    // Verify DB fields
    record('PDF DB Record Metadata',
      pdfUploadData.document.clientId === testClient.id &&
      pdfUploadData.document.organizationId === orgId &&
      pdfUploadData.document.category === 'AUDIT' &&
      pdfUploadData.document.fileType === 'application/pdf',
      `Persisted client: ${pdfUploadData.document.clientId}, category: ${pdfUploadData.document.category}`
    );
  }

  // 4. Test uploading a valid Excel spreadsheet (.xlsx)
  console.log('\n--- 4. Upload Valid Excel Spreadsheet ---');
  const excelContent = Buffer.from('PK\x03\x04\x14\x00\x06\x00ExcelMockZipContentForTestingPurposeOnly');
  const excelMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: 'GST Input Tax Credit Reconciliation Q2',
      category: 'GST',
    },
    {
      name: 'file',
      filename: 'itc_reconciliation_q2.xlsx',
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      data: excelContent,
    }
  );

  const excelUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': excelMultipart.contentType,
    },
    body: excelMultipart.body,
  });
  const excelUploadData = await excelUploadRes.json();
  const excelPassed = excelUploadRes.status === 201 && excelUploadData.success === true;
  record('Valid Excel Upload API', excelPassed, `Status: ${excelUploadRes.status}, Doc ID: ${excelUploadData.document?.id}`);

  if (excelPassed) {
    const excelFilename = path.basename(excelUploadData.document.fileUrl);
    const excelDiskPath = path.resolve(UPLOAD_DIR, excelFilename);
    record('Excel File Exists on Disk', fs.existsSync(excelDiskPath), `Path: ${excelDiskPath}`);
  }

  // 5. Test uploading a valid Image (.png)
  console.log('\n--- 5. Upload Valid Image ---');
  const imageContent = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00, 0x00, 0x0D]);
  const imageMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: 'Client Pan Card Scanned Copy',
      category: 'ROC',
    },
    {
      name: 'file',
      filename: 'pan_card_client.png',
      contentType: 'image/png',
      data: imageContent,
    }
  );

  const imageUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': imageMultipart.contentType,
    },
    body: imageMultipart.body,
  });
  const imageUploadData = await imageUploadRes.json();
  const imagePassed = imageUploadRes.status === 201 && imageUploadData.success === true;
  record('Valid Image Upload API', imagePassed, `Status: ${imageUploadRes.status}, Doc ID: ${imageUploadData.document?.id}`);

  // 6. Test uploading an Unsupported File Type (.exe)
  console.log('\n--- 6. Reject Unsupported File Format (.exe) ---');
  const exeContent = Buffer.from('MZ\x90\x00\x03\x00\x00\x00FakeWindowsExecutableFile');
  const exeMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: 'Malicious Tool Payload',
      category: 'OTHER',
    },
    {
      name: 'file',
      filename: 'danger_tool.exe',
      contentType: 'application/x-msdownload',
      data: exeContent,
    }
  );

  const exeUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': exeMultipart.contentType,
    },
    body: exeMultipart.body,
  });
  const exeUploadData = await exeUploadRes.json();
  record('Reject Executable / Unsupported File Type',
    exeUploadRes.status === 400 && exeUploadData.success === false,
    `Status: ${exeUploadRes.status}, Message: "${exeUploadData.message}"`
  );

  // 7. Test Missing File
  console.log('\n--- 7. Reject Missing File in Multipart Form ---');
  const missingFileMultipart = createMultipartBody({
    clientId: testClient.id,
    name: 'Document Without File Attached',
    category: 'GST',
  });

  const missingFileUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': missingFileMultipart.contentType,
    },
    body: missingFileMultipart.body,
  });
  const missingFileData = await missingFileUploadRes.json();
  record('Reject Missing File Submission',
    missingFileUploadRes.status === 400 && missingFileData.success === false,
    `Status: ${missingFileUploadRes.status}, Message: "${missingFileData.message}"`
  );

  // 8. Test Missing Client ID
  console.log('\n--- 8. Reject Missing Client ID ---');
  const missingClientMultipart = createMultipartBody(
    {
      clientId: '',
      name: 'Document With Empty Client',
      category: 'GST',
    },
    {
      name: 'file',
      filename: 'sample.pdf',
      contentType: 'application/pdf',
      data: pdfContent,
    }
  );

  const missingClientRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': missingClientMultipart.contentType,
    },
    body: missingClientMultipart.body,
  });
  const missingClientData = await missingClientRes.json();
  record('Reject Missing Client ID',
    missingClientRes.status === 400 && missingClientData.success === false,
    `Status: ${missingClientRes.status}, Message: "${missingClientData.message}"`
  );

  // 9. Test Missing Document Title
  console.log('\n--- 9. Reject Missing Document Title ---');
  const missingTitleMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: '   ',
      category: 'GST',
    },
    {
      name: 'file',
      filename: 'sample.pdf',
      contentType: 'application/pdf',
      data: pdfContent,
    }
  );

  const missingTitleRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': missingTitleMultipart.contentType,
    },
    body: missingTitleMultipart.body,
  });
  const missingTitleData = await missingTitleRes.json();
  record('Reject Missing Document Title',
    missingTitleRes.status === 400 && missingTitleData.success === false,
    `Status: ${missingTitleRes.status}, Message: "${missingTitleData.message}"`
  );

  // 10. Test File Exceeding Size Limit (> 25MB)
  console.log('\n--- 10. Reject File Exceeding 25MB Size Limit ---');
  // Create 26MB buffer with minimal memory by allocating and testing size limit
  const largeBuffer = Buffer.alloc(26 * 1024 * 1024); // 26MB
  const largeMultipart = createMultipartBody(
    {
      clientId: testClient.id,
      name: 'Huge Giant File Exceeding 25MB Limit',
      category: 'OTHER',
    },
    {
      name: 'file',
      filename: 'large_payload.pdf',
      contentType: 'application/pdf',
      data: largeBuffer,
    }
  );

  const largeUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': largeMultipart.contentType,
    },
    body: largeMultipart.body,
  });
  const largeUploadData = await largeUploadRes.json();
  record('Reject File Exceeding 25MB Limit',
    largeUploadRes.status === 400 && largeUploadData.success === false,
    `Status: ${largeUploadRes.status}, Message: "${largeUploadData.message}"`
  );

  // 11. Confirm newly uploaded document appears in Client Document Vault list
  console.log('\n--- 11. Verify Documents Appear in Client Document Vault List ---');
  const vaultListRes = await fetch(`${BASE_URL}/documents/vault?clientId=${testClient.id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const vaultListData = await vaultListRes.json();
  const foundPdfDoc = (vaultListData.data || []).find((d: any) => d.id === pdfDocId);
  record('Uploaded Document Retrievable in Vault List',
    !!foundPdfDoc && foundPdfDoc.name === 'Statutory Audit Report FY 2025-26',
    `Found doc in vault with name "${foundPdfDoc?.name}"`
  );

  // 12. Verify Authorized Download / Stream
  console.log('\n--- 12. Verify Authorized Download / Stream ---');
  const downloadRes = await fetch(`${BASE_URL}/documents/vault/${pdfDocId}/download`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const downloadBuffer = Buffer.from(await downloadRes.arrayBuffer());
  const contentTypeHeader = downloadRes.headers.get('content-type');
  const contentDispositionHeader = downloadRes.headers.get('content-disposition');
  record('Authorized Download Returns 200 and Correct File',
    downloadRes.status === 200 && downloadBuffer.equals(pdfContent) && contentTypeHeader === 'application/pdf',
    `Status: ${downloadRes.status}, Bytes: ${downloadBuffer.length}, Content-Type: ${contentTypeHeader}, Disposition: ${contentDispositionHeader}`
  );

  // 13. Verify Unauthorized Download Rejection (Without Token)
  console.log('\n--- 13. Verify Unauthorized Access Rejection (No Token) ---');
  const unauthDownloadRes = await fetch(`${BASE_URL}/documents/vault/${pdfDocId}/download`);
  record('Unauthorized Download Rejected Without Auth Token',
    unauthDownloadRes.status === 401,
    `Status: ${unauthDownloadRes.status} (expected 401)`
  );

  // 14. Verify Cross-Client Isolation (Client Role Restriction)
  console.log('\n--- 14. Verify Cross-Client Role Isolation ---');
  const clientLoginRes = await fetch(`${BASE_URL}/auth/login`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: 'client@amdairy.com', password: 'Client@123' }),
  });
  const clientLoginData = await clientLoginRes.json();
  if (clientLoginRes.ok && clientLoginData.token) {
    const clientToken = clientLoginData.token;
    const clientUserLinkedId = clientLoginData.user.clientId;

    // Upload a document belonging to a DIFFERENT client (not A M Dairy)
    const otherClient = (clientsData.data || []).find((c: any) => c.id !== clientUserLinkedId) || clientsData.data[1];
    let otherDocId = '';
    if (otherClient) {
      const otherMultipart = createMultipartBody(
        {
          clientId: otherClient.id,
          name: `Confidential Records of ${otherClient.name}`,
          category: 'AUDIT',
        },
        {
          name: 'file',
          filename: 'confidential_other.pdf',
          contentType: 'application/pdf',
          data: pdfContent,
        }
      );
      const otherUploadRes = await fetch(`${BASE_URL}/documents/vault`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': otherMultipart.contentType,
        },
        body: otherMultipart.body,
      });
      const otherData = await otherUploadRes.json();
      otherDocId = otherData.document?.id;
    }

    // Attempt to download a document that belongs to a different client
    const crossClientDownloadRes = await fetch(`${BASE_URL}/documents/vault/${otherDocId}/download`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    record('Cross-Client Download Strictly Rejected with 403 Forbidden',
      crossClientDownloadRes.status === 403,
      `Status: ${crossClientDownloadRes.status} (Forbidden)`
    );

    // Verify client CAN download their OWN document
    const ownDownloadRes = await fetch(`${BASE_URL}/documents/vault/${pdfDocId}/download`, {
      headers: { Authorization: `Bearer ${clientToken}` },
    });
    record('Client Successfully Downloads Their Own Document',
      ownDownloadRes.status === 200,
      `Status: ${ownDownloadRes.status} (Authorized OK)`
    );
  } else {
    console.log('Skipping client cross-check: client user not active');
  }

  console.log('\n=====================================================');
  const passedCount = results.filter(r => r.passed).length;
  const failedCount = results.filter(r => !r.passed).length;
  console.log(`TOTAL TESTS: ${results.length}`);
  console.log(`PASSED: ${passedCount}`);
  console.log(`FAILED: ${failedCount}`);
  console.log('=====================================================');

  if (failedCount > 0) {
    process.exit(1);
  }
}

runUploadTestSuite().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});
