import * as admin from 'firebase-admin';
import * as serviceAccount from './google.json';

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount as admin.ServiceAccount),
  storageBucket: 'cw-files.firebasestorage.app',
});

const storage = admin.storage();
const bucket = storage.bucket();

export { admin, bucket };
