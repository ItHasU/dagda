export type LogSeverity = "info" | "warn" | "error" | "debug";

/** Log service */
export interface LogService {
    /** Log a message */
    log: {
        log: (severity: LogSeverity, ...args: any[]) => void;
        /** Log an error */
        handleError: (error: any) => void;
    };
}

/** Log to console */
export function buildConsoleLogService(): LogService["log"] {
    return {
        log: (severity: LogSeverity, ...args: any[]) => console[severity](...args),
        handleError: (error: any) => {
            console.error(error);
        }
    }
}
