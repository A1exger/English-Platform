import { join } from 'path';

// Directory where uploaded materials are stored and served from (/uploads).
// Mount this as a volume in production for persistence.
export const UPLOADS_DIR = join(__dirname, '..', '..', '..', 'uploads');
