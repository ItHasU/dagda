import { DAGDA_PERMISSIONS, PermissionsDeclaration } from "@dagda/shared/src/auth/permissions";
import { Role, RoleId } from "@dagda/shared/src/auth/types";
import { SYSTEM_TABLE_PREFIX } from "@dagda/shared/src/entities/model";
import { AbstractSQLRunner } from "../sql/runner";
import { qi } from "../sql/schema";

/** Table holding the roles, owned by the framework (FEATURES §11.4) */
export const ROLES_TABLE = `${SYSTEM_TABLE_PREFIX}roles`;

/** A row of the roles table. `permissions` is JSON, not a native array — see the migration */
interface RoleRow {
    id: number;
    name: string;
    permissions: string;
}

function toRole(row: RoleRow): Role {
    return {
        id: row.id,
        name: row.name,
        permissions: JSON.parse(row.permissions)
    };
}

/**
 * The roles (FEATURES §7.1).
 *
 * Unlike the permission vocabulary (a constant in the code, see
 * `@dagda/shared/src/auth/permissions`), roles are data: created freely by
 * the administrator, a name and a subset of the declared permissions.
 */
export class RoleStore {

    constructor(
        protected readonly _db: AbstractSQLRunner,
        /** The declared vocabulary a role's permissions are validated against. Defaults to the framework's own */
        protected readonly _permissions: PermissionsDeclaration = DAGDA_PERMISSIONS
    ) { }

    //#region Reading -----------------------------------------------------------

    /** @returns every role, in alphabetical order, for the matrix screen */
    public async list(): Promise<Role[]> {
        const rows = await this._db.all<RoleRow>(`SELECT * FROM ${qi(ROLES_TABLE)} ORDER BY ${qi("name")}`);
        return rows.map(toRole);
    }

    /** @returns the role, or null if no role carries this id */
    public async getById(id: RoleId): Promise<Role | null> {
        const row = await this._db.get<RoleRow>(`SELECT * FROM ${qi(ROLES_TABLE)} WHERE ${qi("id")} = $1`, id);
        return row == null ? null : toRole(row);
    }

    //#endregion

    //#region Writing -----------------------------------------------------------

    /** Create a role. @throws if the name is empty, already taken, or a permission is not declared */
    public async create(params: { name: string, permissions: string[] }): Promise<Role> {
        const name = params.name.trim();
        if (name === "") {
            throw new Error("A role name cannot be empty");
        }
        this._validatePermissions(params.permissions);

        const row = await this._db.get<RoleRow>(
            `INSERT INTO ${qi(ROLES_TABLE)} (${qi("name")}, ${qi("permissions")}) VALUES ($1, $2) RETURNING *`,
            name, JSON.stringify(params.permissions)
        );
        if (row == null) {
            throw new Error(`Could not create the role "${name}"`);
        }
        return toRole(row);
    }

    /** Rename a role and/or replace the permissions it grants. Either is optional, so one can change without the other */
    public async update(id: RoleId, params: { name?: string, permissions?: string[] }): Promise<Role> {
        const current = await this.getById(id);
        if (current == null) {
            throw new Error(`No role with id ${id}`);
        }

        const name = params.name?.trim() ?? current.name;
        if (name === "") {
            throw new Error("A role name cannot be empty");
        }
        const permissions = params.permissions ?? current.permissions;
        this._validatePermissions(permissions);

        const row = await this._db.get<RoleRow>(
            `UPDATE ${qi(ROLES_TABLE)} SET ${qi("name")} = $1, ${qi("permissions")} = $2 WHERE ${qi("id")} = $3 RETURNING *`,
            name, JSON.stringify(permissions), id
        );
        if (row == null) {
            throw new Error(`No role with id ${id}`);
        }
        return toRole(row);
    }

    /**
     * Delete a role.
     *
     * An account carrying it falls back to no role (the migration's
     * `ON DELETE SET NULL`), not an error: nothing about a role is precious
     * enough to block its own deletion over.
     */
    public async delete(id: RoleId): Promise<void> {
        await this._db.run(`DELETE FROM ${qi(ROLES_TABLE)} WHERE ${qi("id")} = $1`, id);
    }

    //#endregion

    /** @throws on the first permission not in the declared vocabulary */
    protected _validatePermissions(permissions: string[]): void {
        for (const permission of permissions) {
            if (!Object.prototype.hasOwnProperty.call(this._permissions, permission)) {
                throw new Error(`Unknown permission "${permission}"`);
            }
        }
    }

}
