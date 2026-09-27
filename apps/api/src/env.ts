import { existsSync } from 'node:fs';
import path from 'node:path';

// Load .env from the repository root, if present. npm sets INIT_CWD to the
// directory it was run from; workspace scripts run two levels below the root.
// Variables already set in the environment win.
const candidates = [process.env.INIT_CWD, process.cwd(), path.resolve(process.cwd(), '../..')].filter(Boolean) as string[];
const file = candidates.map((dir) => path.join(dir, '.env')).find((f) => existsSync(f));
if (file) process.loadEnvFile(file);
