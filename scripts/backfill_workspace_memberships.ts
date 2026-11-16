/**
 * FlowPilot: Workspace Owner Membership Backfill Script
 * Phase 10C-B4.1: PostgreSQL Membership & Workspace Data Layer
 *
 * Implements safe, auditable backfill of OWNER memberships for workspaces
 * lacking an owner membership record.
 *
 * SAFETY INVARIANTS:
 * - SAFE BY DEFAULT: Runs in --dry-run mode unless --apply AND --confirm are explicitly provided.
 * - STRICT ELIGIBILITY: A new OWNER membership is proposed ONLY IF NO membership record
 *   exists at all for that (workspaceId, ownerId) pair.
 * - ZERO SILENT RESTORATION: Existing memberships with status 'active', 'suspended', 'revoked',
 *   or 'inactive' are NEVER reactivated, overwritten, or modified.
 * - ACTIVE OWNER ENFORCEMENT: Owner account must exist and have status 'ACTIVE'.
 * - ARCHIVED WORKSPACE EXCLUSION: Workspaces with isArchived=true are strictly skipped.
 */

import { PrismaClient, Role } from '@prisma/client';
import { getPrismaClient } from '../src/lib/storage/postgres/db';

export interface BackfillOptions {
  dryRun: boolean;
  confirm?: boolean;
  verbose?: boolean;
}

export interface WorkspaceSkipRecord {
  workspaceId: string;
  workspaceName: string;
  ownerId: string | null;
  reason:
    | 'EXISTING_ACTIVE_MEMBERSHIP'
    | 'EXISTING_SUSPENDED_MEMBERSHIP'
    | 'EXISTING_REVOKED_MEMBERSHIP'
    | 'EXISTING_INACTIVE_MEMBERSHIP'
    | 'EXISTING_OTHER_MEMBERSHIP'
    | 'OWNER_ACCOUNT_NOT_ACTIVE'
    | 'OWNER_NOT_FOUND'
    | 'WORKSPACE_ARCHIVED'
    | 'INVALID_OWNER_ID';
  details?: string;
}

export interface ProposedMembershipRecord {
  workspaceId: string;
  workspaceName: string;
  ownerId: string;
  ownerEmail: string;
  role: Role;
  status: string;
}

export interface BackfillReport {
  mode: 'DRY_RUN' | 'APPLY';
  timestamp: string;
  totalWorkspacesScanned: number;
  eligibleProposed: number;
  appliedCount: number;
  skippedCount: number;
  skipBreakdown: {
    existingActive: number;
    existingSuspended: number;
    existingRevoked: number;
    existingInactive: number;
    existingOther: number;
    ownerNotActive: number;
    ownerNotFound: number;
    workspaceArchived: number;
    invalidOwnerId: number;
  };
  proposedRecords: ProposedMembershipRecord[];
  skippedRecords: WorkspaceSkipRecord[];
}

export function parseCommandLineArgs(argv: string[]): BackfillOptions {
  const isApply = argv.includes('--apply');
  const isConfirm = argv.includes('--confirm');
  const isVerbose = argv.includes('--verbose') || argv.includes('-v');
  const isExplicitDryRun = argv.includes('--dry-run');

  // Default to dry-run unless --apply is explicitly specified
  const dryRun = !isApply || isExplicitDryRun;

  return {
    dryRun,
    confirm: isConfirm,
    verbose: isVerbose,
  };
}

/**
 * Core backfill execution engine.
 * Supports injected PrismaClient for transactional test isolation.
 */
export async function runMembershipBackfill(
  options: BackfillOptions = { dryRun: true },
  client?: PrismaClient
): Promise<BackfillReport> {
  const prisma = client || getPrismaClient();

  if (!options.dryRun && !options.confirm) {
    throw new Error(
      'SAFETY LOCKOUT: Live execution with --apply requires explicit --confirm flag. Aborting without database changes.'
    );
  }

  const report: BackfillReport = {
    mode: options.dryRun ? 'DRY_RUN' : 'APPLY',
    timestamp: new Date().toISOString(),
    totalWorkspacesScanned: 0,
    eligibleProposed: 0,
    appliedCount: 0,
    skippedCount: 0,
    skipBreakdown: {
      existingActive: 0,
      existingSuspended: 0,
      existingRevoked: 0,
      existingInactive: 0,
      existingOther: 0,
      ownerNotActive: 0,
      ownerNotFound: 0,
      workspaceArchived: 0,
      invalidOwnerId: 0,
    },
    proposedRecords: [],
    skippedRecords: [],
  };

  // 1. Fetch all candidate workspaces
  const workspaces = await (prisma as any).workspace.findMany({
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });

  report.totalWorkspacesScanned = workspaces.length;

  for (const ws of workspaces) {
    const ownerId = ws.ownerId ? ws.ownerId.trim() : '';

    // Rule 1: Valid owner ID check
    if (!ownerId) {
      report.skippedCount++;
      report.skipBreakdown.invalidOwnerId++;
      report.skippedRecords.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        ownerId: null,
        reason: 'INVALID_OWNER_ID',
        details: 'Workspace has empty or missing ownerId field.',
      });
      continue;
    }

    // Rule 2: Workspace archived check
    if (ws.isArchived) {
      report.skippedCount++;
      report.skipBreakdown.workspaceArchived++;
      report.skippedRecords.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        ownerId,
        reason: 'WORKSPACE_ARCHIVED',
        details: 'Workspace is marked as archived (isArchived=true).',
      });
      continue;
    }

    // Rule 3: Owner existence check
    const ownerUser = await (prisma as any).user.findUnique({
      where: { id: ownerId },
    });

    if (!ownerUser) {
      report.skippedCount++;
      report.skipBreakdown.ownerNotFound++;
      report.skippedRecords.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        ownerId,
        reason: 'OWNER_NOT_FOUND',
        details: `Owner user with ID "${ownerId}" does not exist in User table.`,
      });
      continue;
    }

    // Rule 4: Owner account active status check
    if (ownerUser.status !== 'ACTIVE') {
      report.skippedCount++;
      report.skipBreakdown.ownerNotActive++;
      report.skippedRecords.push({
        workspaceId: ws.id,
        workspaceName: ws.name,
        ownerId,
        reason: 'OWNER_ACCOUNT_NOT_ACTIVE',
        details: `Owner account status is "${ownerUser.status}" (must be "ACTIVE").`,
      });
      continue;
    }

    // Rule 5: Strict membership absence check
    // If ANY membership record exists for this (workspaceId, ownerId) pair, skip it!
    const existingMembership = await (prisma as any).membership.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId: ws.id,
          userId: ownerId,
        },
      },
    });

    if (existingMembership) {
      report.skippedCount++;
      const statusLower = (existingMembership.status || '').toLowerCase();

      if (statusLower === 'active') {
        report.skipBreakdown.existingActive++;
        report.skippedRecords.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          ownerId,
          reason: 'EXISTING_ACTIVE_MEMBERSHIP',
          details: `Membership already exists with status 'active' and role '${existingMembership.role}'.`,
        });
      } else if (statusLower === 'suspended') {
        report.skipBreakdown.existingSuspended++;
        report.skippedRecords.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          ownerId,
          reason: 'EXISTING_SUSPENDED_MEMBERSHIP',
          details: 'Membership exists with status "suspended". NEVER reactivating or modifying.',
        });
      } else if (statusLower === 'revoked') {
        report.skipBreakdown.existingRevoked++;
        report.skippedRecords.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          ownerId,
          reason: 'EXISTING_REVOKED_MEMBERSHIP',
          details: 'Membership exists with status "revoked". NEVER restoring revoked access.',
        });
      } else if (statusLower === 'inactive') {
        report.skipBreakdown.existingInactive++;
        report.skippedRecords.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          ownerId,
          reason: 'EXISTING_INACTIVE_MEMBERSHIP',
          details: 'Membership exists with status "inactive". Skipping.',
        });
      } else {
        report.skipBreakdown.existingOther++;
        report.skippedRecords.push({
          workspaceId: ws.id,
          workspaceName: ws.name,
          ownerId,
          reason: 'EXISTING_OTHER_MEMBERSHIP',
          details: `Membership exists with status "${existingMembership.status}". Skipping.`,
        });
      }
      continue;
    }

    // Pair is eligible!
    report.eligibleProposed++;
    const proposed: ProposedMembershipRecord = {
      workspaceId: ws.id,
      workspaceName: ws.name,
      ownerId,
      ownerEmail: ownerUser.email,
      role: 'OWNER',
      status: 'active',
    };
    report.proposedRecords.push(proposed);

    // Apply mode (only executed if explicitly authorized, dryRun=false, confirm=true)
    if (!options.dryRun && options.confirm) {
      try {
        await (prisma as any).$transaction(async (tx: any) => {
          // Re-verify inside transaction to prevent race conditions
          const concurrencyCheck = await tx.membership.findUnique({
            where: {
              workspaceId_userId: {
                workspaceId: ws.id,
                userId: ownerId,
              },
            },
          });
          if (concurrencyCheck) {
            return; // Concurrently created; skip safely
          }

          const memId = `mem_${ws.id}_${ownerId}`;
          await tx.membership.create({
            data: {
              id: memId,
              workspaceId: ws.id,
              userId: ownerId,
              role: 'OWNER',
              status: 'active',
            },
          });
          report.appliedCount++;
        });
      } catch (err: any) {
        console.error(`[Backfill] Failed applying membership for ws=${ws.id}, user=${ownerId}:`, err.message);
        throw err;
      }
    }
  }

  return report;
}

/**
 * CLI Runner with structured console output
 */
export async function main() {
  const options = parseCommandLineArgs(process.argv.slice(2));

  console.log('================================================================');
  console.log('FlowPilot Workspace Owner Membership Backfill Utility');
  console.log(`Execution Mode: ${options.dryRun ? 'DRY-RUN (SIMULATION ONLY)' : 'APPLY (LIVE MUTATION)'}`);
  console.log('================================================================\n');

  if (!process.env.DATABASE_URL) {
    console.error('[ERROR] DATABASE_URL environment variable is not set.');
    console.error('Please configure DATABASE_URL in your environment to execute this utility against PostgreSQL.');
    process.exit(1);
  }

  try {
    const report = await runMembershipBackfill(options);

    console.log(`Workspaces Scanned:       ${report.totalWorkspacesScanned}`);
    console.log(`Eligible For Backfill:    ${report.eligibleProposed}`);
    console.log(`Memberships Applied:      ${report.appliedCount}`);
    console.log(`Workspaces Skipped:       ${report.skippedCount}`);
    console.log('\n--- Skip Reason Breakdown ---');
    console.log(`  Existing Active:        ${report.skipBreakdown.existingActive}`);
    console.log(`  Existing Suspended:     ${report.skipBreakdown.existingSuspended} (Preserved - Not modified)`);
    console.log(`  Existing Revoked:       ${report.skipBreakdown.existingRevoked} (Preserved - Not restored)`);
    console.log(`  Existing Inactive:      ${report.skipBreakdown.existingInactive}`);
    console.log(`  Existing Other:         ${report.skipBreakdown.existingOther}`);
    console.log(`  Owner Account Inactive: ${report.skipBreakdown.ownerNotActive}`);
    console.log(`  Owner User Not Found:   ${report.skipBreakdown.ownerNotFound}`);
    console.log(`  Workspace Archived:     ${report.skipBreakdown.workspaceArchived}`);
    console.log(`  Invalid Owner ID:       ${report.skipBreakdown.invalidOwnerId}`);

    if (options.verbose && report.proposedRecords.length > 0) {
      console.log('\n--- Proposed Additions ---');
      report.proposedRecords.forEach((r, idx) => {
        console.log(`  [${idx + 1}] WS "${r.workspaceName}" (${r.workspaceId}) -> Owner: ${r.ownerEmail} (${r.ownerId})`);
      });
    }

    if (report.mode === 'DRY_RUN') {
      console.log('\n[SUCCESS] Dry-run completed cleanly with ZERO database mutations.');
      console.log('To apply changes in the future, pass --apply AND --confirm flags explicitly.');
    } else {
      console.log(`\n[SUCCESS] Applied ${report.appliedCount} memberships transactionally.`);
    }

    process.exit(0);
  } catch (error: any) {
    console.error('\n[FATAL ERROR]:', error.message);
    process.exit(1);
  }
}

// Direct invocation check
if (
  process.argv[1] &&
  (process.argv[1].endsWith('backfill_workspace_memberships.ts') ||
    process.argv[1].endsWith('backfill_workspace_memberships.js'))
) {
  main();
}
