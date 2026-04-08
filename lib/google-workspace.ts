import { google } from 'googleapis';

// ============================================================================
// CONFIG
// ============================================================================

const DOMAIN = 'pacificsoftwareventures.com';

// The admin email to impersonate (must be a Workspace super admin)
const ADMIN_EMAIL = process.env.GOOGLE_WORKSPACE_ADMIN_EMAIL || '';

// Service account credentials (JSON key, base64-encoded in env var)
const SERVICE_ACCOUNT_KEY_BASE64 = process.env.GOOGLE_SERVICE_ACCOUNT_KEY || '';

// ============================================================================
// AUTH
// ============================================================================

function getAuthClient() {
  if (!SERVICE_ACCOUNT_KEY_BASE64) {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY env var not set');
  }
  if (!ADMIN_EMAIL) {
    throw new Error('GOOGLE_WORKSPACE_ADMIN_EMAIL env var not set');
  }

  const keyJson = JSON.parse(
    Buffer.from(SERVICE_ACCOUNT_KEY_BASE64, 'base64').toString('utf-8')
  );

  const auth = new google.auth.JWT({
    email: keyJson.client_email,
    key: keyJson.private_key,
    scopes: ['https://www.googleapis.com/auth/admin.directory.user'],
    subject: ADMIN_EMAIL, // impersonate admin
  });

  return auth;
}

// ============================================================================
// CREATE USER
// ============================================================================

interface CreateEmployeeEmailOptions {
  /** Employee name (used as username), e.g. "aria" */
  name: string;
  /** First name for the account, e.g. "Aria" */
  firstName: string;
  /** Last name, defaults to "PSV" */
  lastName?: string;
  /** Temporary password  -  user won't log in, but Google requires one */
  password?: string;
}

/**
 * Create a Google Workspace user for an AI employee.
 * Returns the created user's primary email.
 */
export async function createWorkspaceUser(
  opts: CreateEmployeeEmailOptions
): Promise<{ email: string; password: string; success: boolean }> {
  const auth = getAuthClient();
  const directory = google.admin({ version: 'directory_v1', auth });

  const email = `${opts.name}@${DOMAIN}`;
  const password =
    opts.password || `PSV-${Math.random().toString(36).slice(2, 10)}!`;

  await directory.users.insert({
    requestBody: {
      primaryEmail: email,
      name: {
        givenName: opts.firstName,
        familyName: opts.lastName || 'PSV',
      },
      password,
      changePasswordAtNextLogin: false,
      orgUnitPath: '/', // root OU
    },
  });

  return { email, password, success: true };
}

// ============================================================================
// CHECK IF USER EXISTS
// ============================================================================

export async function workspaceUserExists(name: string): Promise<boolean> {
  const auth = getAuthClient();
  const directory = google.admin({ version: 'directory_v1', auth });

  try {
    await directory.users.get({
      userKey: `${name}@${DOMAIN}`,
    });
    return true;
  } catch (err: unknown) {
    const error = err as { code?: number };
    if (error.code === 404) return false;
    throw err;
  }
}

// ============================================================================
// DELETE USER
// ============================================================================

export async function deleteWorkspaceUser(name: string): Promise<void> {
  const auth = getAuthClient();
  const directory = google.admin({ version: 'directory_v1', auth });

  await directory.users.delete({
    userKey: `${name}@${DOMAIN}`,
  });
}
