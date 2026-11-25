import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
export const SCREENSHOT_DIR = path.join(here, '..', 'uploads', 'screenshots');

fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });
