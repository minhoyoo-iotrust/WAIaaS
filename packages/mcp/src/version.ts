import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
export const { version: PKG_VERSION } = require('../package.json') as { version: string };
