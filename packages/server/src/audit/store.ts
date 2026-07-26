import { SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { UserId } from "@dagda/shared/src/auth/types";
import { AbstractSQLRunner } from "../sql/runner";
import { qi } from "../sql/schema";

/** Table holding the audit log, owned by the framework (FEATURES §11.4) */
export const AUDIT_LOG_TABLE = `${SYSTEM_TABLE_PREFIX}audit_log`;

/** What is being recorded: an RPC-ish action call, or a direct entity-write transaction (`_submit()`) */
export type AuditLogKind = "action" | "submit";

/**
 * One row of the audit trail (ROADMAP tranche 3).
 *
 * Never read back by the framework itself: this is a write-only trail for
 * whoever inspects the database directly, not a feature with a client-side
 * screen. `details` is JSON-in-TEXT, the same convention `RoleStore.permissions`
 * already uses — there is no native array/object column type across both SQL
 * runners.
 */
export class AuditLogStore {

    constructor(protected readonly _db: AbstractSQLRunner) { }

    /**
     * Records one successful action or transaction.
     *
     * Only ever called after the thing it describes has already succeeded —
     * there is no "rejected" row: a permission refusal or any other failure
     * never reaches this method (FEATURES §11.1, §11.2), by construction of
     * its only two call sites.
     */
    public async record(userId: UserId | null, kind: AuditLogKind, name: string | null, details: unknown): Promise<void> {
        await this._db.run(
            `INSERT INTO ${qi(AUDIT_LOG_TABLE)} (${qi("userId")}, ${qi("kind")}, ${qi("name")}, ${qi("details")}) VALUES ($1, $2, $3, $4)`,
            userId, kind, name, details === undefined ? null : JSON.stringify(details)
        );
    }
}
