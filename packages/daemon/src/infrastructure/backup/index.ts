export { BackupService } from './backup-service.js';
export { EncryptedBackupService } from './encrypted-backup-service.js';
export {
  BACKUP_MAGIC,
  BACKUP_FORMAT_VERSION,
  BACKUP_HEADER_SIZE,
  writeArchive,
  readArchiveHeader,
  readArchiveMetadata,
  encodeEntries,
  decodeEntries,
} from './backup-format.js';
export type { BackupMetadata, BackupInfo, ArchiveHeader } from './backup-format.js';
