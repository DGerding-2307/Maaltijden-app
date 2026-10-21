// Mappen op schijf: geüploade foto's (naast de database) en de website.
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const publicDir = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'public');
export const uploadDir = () => path.resolve(process.env.UPLOAD_DIR || path.join(path.dirname(process.env.DB_FILE && process.env.DB_FILE !== ':memory:' ? process.env.DB_FILE : 'data/x'), 'uploads'));
