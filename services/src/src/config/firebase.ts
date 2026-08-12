import { cert, initializeApp, type ServiceAccount } from 'firebase-admin/app';
import { getStorage } from 'firebase-admin/storage';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const serviceAccount = JSON.parse(readFileSync(join(__dirname, 'google.json'), 'utf-8'));

const admin = initializeApp({
  credential: cert(serviceAccount as ServiceAccount),
  storageBucket: 'cw-files.firebasestorage.app',
});

const storage = getStorage(admin);
const bucket: ReturnType<typeof storage.bucket> = storage.bucket();

export { admin, bucket };
