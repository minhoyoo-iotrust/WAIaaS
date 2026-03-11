import { describe, it, expect, vi, beforeEach } from 'vitest';
import { reEncryptKeystores, reEncryptSettings, reEncryptCredentials } from '../infrastructure/keystore/re-encrypt.js';
import * as fsPromises from 'node:fs/promises';
import { encrypt, type EncryptedData, KDF_PARAMS } from '../infrastructure/keystore/crypto.js';
import { encryptSettingValue, decryptSettingValue } from '../infrastructure/settings/settings-crypto.js';
import { encryptCredential, decryptCredential } from '../infrastructure/credential/credential-crypto.js';

// ---------------------------------------------------------------------------
// reEncryptKeystores
// ---------------------------------------------------------------------------

vi.mock('node:fs/promises');

const mockedFs = vi.mocked(fsPromises);

function buildKeystoreJson(enc: EncryptedData): object {
  return {
    id: 'test-wallet',
    version: 3,
    crypto: {
      cipherparams: { iv: enc.iv.toString('hex') },
      ciphertext: enc.ciphertext.toString('hex'),
      authTag: enc.authTag.toString('hex'),
      kdfparams: { salt: enc.salt.toString('hex'), ...KDF_PARAMS },
    },
  };
}

describe('reEncryptKeystores', () => {
  const OLD_PW = 'old-password-123';
  const NEW_PW = 'new-password-456';
  const DIR = '/tmp/test-keystores';

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should re-encrypt all JSON keystore files', async () => {
    // Create a real encrypted payload so decrypt/encrypt round-trip works
    const secret = Buffer.from('my-private-key');
    const encrypted = await encrypt(secret, OLD_PW);
    const keystoreContent = JSON.stringify(buildKeystoreJson(encrypted));

    mockedFs.readdir.mockResolvedValue(['wallet1.json', 'wallet2.json'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    mockedFs.readFile.mockResolvedValue(keystoreContent);
    mockedFs.writeFile.mockResolvedValue();
    mockedFs.rename.mockResolvedValue();

    const count = await reEncryptKeystores(DIR, OLD_PW, NEW_PW);
    expect(count).toBe(2);

    // writeFile called for each temp file
    expect(mockedFs.writeFile).toHaveBeenCalledTimes(2);
    // rename called for each file
    expect(mockedFs.rename).toHaveBeenCalledTimes(2);
  });

  it('should skip dotfiles and non-JSON files', async () => {
    const secret = Buffer.from('key');
    const encrypted = await encrypt(secret, OLD_PW);
    const content = JSON.stringify(buildKeystoreJson(encrypted));

    mockedFs.readdir.mockResolvedValue(['.hidden.json', 'readme.txt', 'wallet.json'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    mockedFs.readFile.mockResolvedValue(content);
    mockedFs.writeFile.mockResolvedValue();
    mockedFs.rename.mockResolvedValue();

    const count = await reEncryptKeystores(DIR, OLD_PW, NEW_PW);
    expect(count).toBe(1);
  });

  it('should return 0 when no JSON files exist', async () => {
    mockedFs.readdir.mockResolvedValue([] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);

    const count = await reEncryptKeystores(DIR, OLD_PW, NEW_PW);
    expect(count).toBe(0);
    expect(mockedFs.writeFile).not.toHaveBeenCalled();
  });

  it('should clean up temp files on error and re-throw', async () => {
    mockedFs.readdir.mockResolvedValue(['wallet.json'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    mockedFs.readFile.mockRejectedValue(new Error('read failed'));
    mockedFs.unlink.mockResolvedValue();

    await expect(reEncryptKeystores(DIR, OLD_PW, NEW_PW))
      .rejects.toThrow('read failed');
  });

  it('should ignore cleanup errors during rollback', async () => {
    const secret = Buffer.from('key');
    const encrypted = await encrypt(secret, OLD_PW);
    const content = JSON.stringify(buildKeystoreJson(encrypted));

    mockedFs.readdir.mockResolvedValue(['w1.json', 'w2.json'] as unknown as Awaited<ReturnType<typeof fsPromises.readdir>>);
    mockedFs.readFile.mockResolvedValue(content);
    // First writeFile succeeds, second fails
    mockedFs.writeFile
      .mockResolvedValueOnce()
      .mockRejectedValueOnce(new Error('write failed'));
    mockedFs.unlink.mockRejectedValue(new Error('unlink failed'));

    await expect(reEncryptKeystores(DIR, OLD_PW, NEW_PW))
      .rejects.toThrow('write failed');
  });
});

// ---------------------------------------------------------------------------
// reEncryptSettings
// ---------------------------------------------------------------------------

describe('reEncryptSettings', () => {
  const OLD_PW = 'old-master-password';
  const NEW_PW = 'new-master-password';

  it('should re-encrypt settings and API keys', () => {
    // Create encrypted values with old password
    const encValue = encryptSettingValue('secret-api-key', OLD_PW);
    const encApiKey = encryptSettingValue('provider-secret', OLD_PW);

    // After v28 migration, API keys are stored in settings table with encrypted=true
    const settingsRows = [
      { key: 'some_key', value: encValue, encrypted: true, updatedAt: new Date() },
      { key: 'api_key.test-provider', value: encApiKey, encrypted: true, updatedAt: new Date() },
    ];

    // Track updates
    const settingsUpdates: { key: string; value: string }[] = [];

    // Build a minimal mock DB using chained builder pattern
    const mockDb = {
      select: () => {
        return {
          from: () => ({
            where: () => ({
              all: () => settingsRows,
            }),
          }),
        };
      },
      update: () => ({
        set: (data: Record<string, unknown>) => ({
          where: () => ({
            run: () => {
              if ('value' in data) {
                settingsUpdates.push(data as unknown as { key: string; value: string });
              }
            },
          }),
        }),
      }),
    };

    const count = reEncryptSettings(
      mockDb as never,
      undefined,
      OLD_PW,
      NEW_PW,
    );

    expect(count).toBe(2); // 2 encrypted settings (including migrated api key)

    // Verify the re-encrypted settings values can be decrypted with new password
    expect(settingsUpdates).toHaveLength(2);
    const decrypted = decryptSettingValue(settingsUpdates[0]!.value, NEW_PW);
    expect(decrypted).toBe('secret-api-key');

    const decryptedApi = decryptSettingValue(settingsUpdates[1]!.value, NEW_PW);
    expect(decryptedApi).toBe('provider-secret');
  });

  it('should use sqlite transaction when sqlite is provided', () => {
    const transactionFn = vi.fn((fn: () => void) => () => fn());
    const mockSqlite = { transaction: transactionFn };

    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({ all: () => [] }),
          all: () => [],
        }),
      }),
      update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
    };

    const count = reEncryptSettings(
      mockDb as never,
      mockSqlite as never,
      OLD_PW,
      NEW_PW,
    );

    expect(count).toBe(0);
    expect(transactionFn).toHaveBeenCalledOnce();
  });

  it('should return 0 when no encrypted settings or API keys exist', () => {
    const mockDb = {
      select: () => ({
        from: () => ({
          where: () => ({ all: () => [] }),
          all: () => [],
        }),
      }),
      update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
    };

    const count = reEncryptSettings(mockDb as never, undefined, OLD_PW, NEW_PW);
    expect(count).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// reEncryptCredentials (v31.12)
// ---------------------------------------------------------------------------

describe('reEncryptCredentials', () => {
  const OLD_PW = 'old-credential-password';
  const NEW_PW = 'new-credential-password';

  it('should re-encrypt credential rows with new password', () => {
    // Create encrypted values with old password
    const aad1 = 'id-1:global:api-key';
    const aad2 = 'id-2:wallet-1:hmac-secret';
    const enc1 = encryptCredential('secret-api-key', OLD_PW, aad1);
    const enc2 = encryptCredential('hmac-secret-value', OLD_PW, aad2);

    const rows = [
      { id: 'id-1', walletId: null, type: 'api-key', encryptedValue: enc1.encryptedValue, iv: enc1.iv, authTag: enc1.authTag },
      { id: 'id-2', walletId: 'wallet-1', type: 'hmac-secret', encryptedValue: enc2.encryptedValue, iv: enc2.iv, authTag: enc2.authTag },
    ];

    // Track updates
    const updates: Array<{ id: string; encryptedValue: Buffer; iv: Buffer; authTag: Buffer }> = [];

    const mockDb = {
      select: () => ({
        from: () => ({
          all: () => rows,
        }),
      }),
      update: () => ({
        set: (data: Record<string, unknown>) => ({
          where: () => ({
            run: () => {
              updates.push(data as unknown as typeof updates[number]);
            },
          }),
        }),
      }),
    };

    const count = reEncryptCredentials(mockDb as never, undefined, OLD_PW, NEW_PW);
    expect(count).toBe(2);
    expect(updates).toHaveLength(2);

    // Verify re-encrypted values can be decrypted with new password
    const decrypted1 = decryptCredential(
      { encryptedValue: updates[0]!.encryptedValue, iv: updates[0]!.iv, authTag: updates[0]!.authTag },
      NEW_PW,
      aad1,
    );
    expect(decrypted1).toBe('secret-api-key');

    const decrypted2 = decryptCredential(
      { encryptedValue: updates[1]!.encryptedValue, iv: updates[1]!.iv, authTag: updates[1]!.authTag },
      NEW_PW,
      aad2,
    );
    expect(decrypted2).toBe('hmac-secret-value');
  });

  it('should not decrypt with old password after re-encrypt', () => {
    const aad = 'id-3:global:custom';
    const enc = encryptCredential('my-secret', OLD_PW, aad);

    const rows = [{ id: 'id-3', walletId: null, type: 'custom', encryptedValue: enc.encryptedValue, iv: enc.iv, authTag: enc.authTag }];
    const updates: Array<{ encryptedValue: Buffer; iv: Buffer; authTag: Buffer }> = [];

    const mockDb = {
      select: () => ({ from: () => ({ all: () => rows }) }),
      update: () => ({
        set: (data: Record<string, unknown>) => ({
          where: () => ({
            run: () => { updates.push(data as unknown as typeof updates[number]); },
          }),
        }),
      }),
    };

    reEncryptCredentials(mockDb as never, undefined, OLD_PW, NEW_PW);

    // Old password should fail
    expect(() =>
      decryptCredential(
        { encryptedValue: updates[0]!.encryptedValue, iv: updates[0]!.iv, authTag: updates[0]!.authTag },
        OLD_PW,
        aad,
      ),
    ).toThrow();
  });

  it('should return 0 when no credentials exist', () => {
    const mockDb = {
      select: () => ({ from: () => ({ all: () => [] }) }),
      update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
    };

    const count = reEncryptCredentials(mockDb as never, undefined, OLD_PW, NEW_PW);
    expect(count).toBe(0);
  });

  it('should use sqlite transaction when sqlite is provided', () => {
    const transactionFn = vi.fn((fn: () => void) => () => fn());
    const mockSqlite = { transaction: transactionFn };

    const mockDb = {
      select: () => ({ from: () => ({ all: () => [] }) }),
      update: () => ({ set: () => ({ where: () => ({ run: () => {} }) }) }),
    };

    reEncryptCredentials(mockDb as never, mockSqlite as never, OLD_PW, NEW_PW);
    expect(transactionFn).toHaveBeenCalledOnce();
  });
});
