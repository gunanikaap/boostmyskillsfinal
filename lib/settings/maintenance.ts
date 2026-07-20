import { db, type Queryable } from "@/lib/db/pool";

export interface MaintenanceState {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  updatedBy: string | null;
  updatedAt: string;
}

export async function getMaintenance(conn: Queryable = db): Promise<MaintenanceState> {
  const { rows } = await conn.query(
    `SELECT maintenance_mode, maintenance_message, updated_by, updated_at
     FROM platform_settings WHERE id = 1`,
  );
  const r = rows[0] as
    | {
        maintenance_mode: boolean;
        maintenance_message: string;
        updated_by: string | null;
        updated_at: string;
      }
    | undefined;
  if (!r) {
    // Fail safe: if the singleton is somehow missing, treat as NOT in maintenance
    // (the delete-prevention trigger makes this effectively impossible).
    return {
      maintenanceMode: false,
      maintenanceMessage: "",
      updatedBy: null,
      updatedAt: new Date(0).toISOString(),
    };
  }
  return {
    maintenanceMode: r.maintenance_mode,
    maintenanceMessage: r.maintenance_message,
    updatedBy: r.updated_by,
    updatedAt: r.updated_at,
  };
}

/** Server-authorised toggle. Callers MUST have already passed requireAdmin(). */
export async function setMaintenance(
  input: { enabled: boolean; message?: string; adminUserId: string },
  conn: Queryable = db,
): Promise<MaintenanceState> {
  await conn.query(
    `UPDATE platform_settings
       SET maintenance_mode = $1,
           maintenance_message = COALESCE($2, maintenance_message),
           updated_by = $3,
           updated_at = now()
     WHERE id = 1`,
    [input.enabled, input.message ?? null, input.adminUserId],
  );
  return getMaintenance(conn);
}
