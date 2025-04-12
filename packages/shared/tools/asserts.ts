
/** Check that switch branch is unreachable */
export function assertUnreachable(value: never): never {
    throw new Error(`Unexpected state reached: ${value}`);
}
