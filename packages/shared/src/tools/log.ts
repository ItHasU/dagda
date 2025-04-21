export type LogSeverity = "info" | "warn" | "error" | "debug";

/** Log service */
export interface LogService {
    /** Log a message */
    log: (severity: LogSeverity, ...args: any[]) => void;
}

/** Log to console */
export function ConsoleLogService(severity: LogSeverity, ...args: any[]): void {
    console[severity](...args);
}
