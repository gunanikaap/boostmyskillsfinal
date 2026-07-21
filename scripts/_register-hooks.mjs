import { register } from "node:module";

// Register the @/-alias + extensionless resolver for plain-node script runs.
register("./_ts-alias-hooks.mjs", import.meta.url);
