import { google, docs_v1 } from 'googleapis';

const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';
const ADMIN_EMAIL = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || '';

function getDriveAuth() {
  if (!SERVICE_ACCOUNT_KEY_BASE64 || !ADMIN_EMAIL) return null;
  const keyJson = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8')
  );
  return new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: [
      'https://www.googleapis.com/auth/drive',
      'https://www.googleapis.com/auth/documents',
    ],
    subject: ADMIN_EMAIL,
  });
}

/**
 * Create a Google Doc with the given title and content, shared so anyone with the link can edit.
 * Returns the doc URL, or null if Google APIs aren't configured.
 */
export async function createProjectDoc(
  title: string,
  content: string,
  email?: string,
): Promise<{ url: string; docId: string } | null> {
  const auth = getDriveAuth();
  if (!auth) return null;

  const docs = google.docs({ version: 'v1', auth });
  const drive = google.drive({ version: 'v3', auth });

  // Create the doc
  const doc = await docs.documents.create({
    requestBody: { title },
  });
  const docId = doc.data.documentId!;

  // Write content
  let fullContent = content;
  if (email) {
    fullContent += `\n\nDelivery email: ${email}`;
  }
  if (fullContent) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: {
        requests: [{ insertText: { text: fullContent, location: { index: 1 } } }],
      },
    });
  }

  // Make it editable by anyone with the link
  await drive.permissions.create({
    fileId: docId,
    requestBody: {
      role: 'writer',
      type: 'anyone',
    },
  });

  const url = `https://docs.google.com/document/d/${docId}/edit`;
  return { url, docId };
}

/**
 * Update an existing Google Doc's content (replaces all content).
 */
export async function updateProjectDoc(
  docId: string,
  content: string,
  email?: string,
): Promise<boolean> {
  const auth = getDriveAuth();
  if (!auth) return false;

  const docs = google.docs({ version: 'v1', auth });

  // Get current doc to find content length
  const doc = await docs.documents.get({ documentId: docId });
  const endIndex = doc.data.body?.content?.slice(-1)?.[0]?.endIndex || 1;

  const requests: docs_v1.Schema$Request[] = [];
  // Delete existing content (if any beyond the initial newline)
  if (endIndex > 2) {
    requests.push({
      deleteContentRange: {
        range: { startIndex: 1, endIndex: endIndex - 1 },
      },
    });
  }

  // Insert new content
  let newContent = content;
  if (email) {
    newContent += `\n\nDelivery email: ${email}`;
  }
  if (newContent) {
    requests.push({
      insertText: { text: newContent, location: { index: 1 } },
    });
  }

  if (requests.length > 0) {
    await docs.documents.batchUpdate({
      documentId: docId,
      requestBody: { requests },
    });
  }

  return true;
}
