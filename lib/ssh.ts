import {
  SSMClient,
  SendCommandCommand,
  GetCommandInvocationCommand,
} from '@aws-sdk/client-ssm';
import { fromIni } from '@aws-sdk/credential-providers';

const INSTANCE_ID = process.env.EC2_INSTANCE_ID || 'i-0243e65b0ae956543';
const AWS_REGION = process.env.EC2_REGION || 'us-east-1';
const AWS_PROFILE = process.env.EC2_AWS_PROFILE || 'openclaw-migration';
const DEFAULT_TIMEOUT_MS = 90_000; // 90s — agent data collection can be slow

let ssmClient: SSMClient | null = null;

function getSSMClient(): SSMClient {
  if (!ssmClient) {
    const isVercel = !!process.env.VERCEL || !!process.env.AWS_ACCESS_KEY_ID;
    ssmClient = new SSMClient({
      region: AWS_REGION,
      // In production (Vercel): use env vars (AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY)
      // In local dev: use named profile from ~/.aws/credentials
      ...(isVercel ? {} : { credentials: fromIni({ profile: AWS_PROFILE }) }),
    });
  }
  return ssmClient;
}

/**
 * Execute a command on the EC2 instance via AWS Systems Manager.
 * Drop-in replacement for the old SSH-based sshExec.
 */
export function sshExec(command: string): Promise<string> {
  return runSSM(command, DEFAULT_TIMEOUT_MS);
}

/**
 * Execute a command with a custom timeout.
 * Use for long-running operations like batch deployments.
 */
export function sshExecLong(command: string, timeoutMs = 120_000): Promise<string> {
  return runSSM(command, timeoutMs);
}

async function runSSM(command: string, timeoutMs: number): Promise<string> {
  const client = getSSMClient();
  const deadline = Date.now() + timeoutMs;

  // Send the command
  const sendResult = await client.send(
    new SendCommandCommand({
      InstanceIds: [INSTANCE_ID],
      DocumentName: 'AWS-RunShellScript',
      Parameters: { commands: [command] },
      TimeoutSeconds: Math.ceil(timeoutMs / 1000),
    })
  );

  const commandId = sendResult.Command?.CommandId;
  if (!commandId) {
    throw new Error('SSM SendCommand failed: no CommandId returned');
  }

  // Poll for completion
  let pollInterval = 500;
  while (Date.now() < deadline) {
    await sleep(pollInterval);
    // Gradually increase poll interval: 500ms → 1s → 2s (cap)
    pollInterval = Math.min(pollInterval * 1.5, 2000);

    try {
      const result = await client.send(
        new GetCommandInvocationCommand({
          CommandId: commandId,
          InstanceId: INSTANCE_ID,
        })
      );

      const status = result.Status;
      if (status === 'InProgress' || status === 'Pending' || status === 'Delayed') {
        continue;
      }

      const stdout = result.StandardOutputContent || '';
      const stderr = result.StandardErrorContent || '';

      if (status === 'Success') {
        return stdout;
      }

      // If the command "Failed" but produced stdout, return it anyway.
      // This happens with docker exec when the process writes to stderr
      // (e.g. OpenClaw plugin init logs) causing a non-zero exit code,
      // but the actual response is in stdout.
      if (status === 'Failed' && stdout.trim().length > 0) {
        console.warn(`[ssh] SSM command returned Failed but has stdout (${stdout.length} chars) — returning it`);
        return stdout;
      }

      throw new Error(
        `SSM command failed (status: ${status}): ${stderr || stdout || 'no output'}`
      );
    } catch (err: unknown) {
      // InvocationDoesNotExist means result isn't ready yet
      if (err && typeof err === 'object' && 'name' in err && err.name === 'InvocationDoesNotExist') {
        continue;
      }
      throw err;
    }
  }

  throw new Error(`SSM command timed out after ${timeoutMs}ms`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
