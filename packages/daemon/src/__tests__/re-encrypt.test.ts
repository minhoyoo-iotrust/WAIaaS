import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { reEncryptKeystores, reEncryptSettings } from '../infrastructure/keystore/re-encrypt.js';
import * as fsPromises from 'node:fs/promises';
import { encrypt, type EncryptedData, KDF_PARAMS } from '../infrastructure/keystore/crypto.js';
import { encryptSettingValue, decryptSettingValue } from '../infrastructure/settings/settings-crypto.js';

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

    const settingsRows = [
      { key: 'some_key', value: encValue, encrypted: true, updatedAt: new Date() },
    ];
    const apiKeyRows = [
      { providerName: 'test-provider', encryptedKey: encApiKey, createdAt: new Date(), updatedAt: new Date() },
    ];

    // Track updates
    const settingsUpdates: { key: string; value: string }[] = [];
    const apiKeyUpdates: { providerName: string; encryptedKey: string }[] = [];

    // Build a minimal mock DB using chained builder pattern
    let selectCount = 0;
    const mockDb = {
      select: () => {
        const idx = selectCount++;
        return {
          from: () => ({
            where: () => ({
              all: () => settingsRows,
            }),
            all: () => apiKeyRows,
          }),
        };
      },
      update: () => ({
        set: (data: Record<string, unknown>) => ({
          where: () => ({
            run: () => {
              if ('encryptedKey' in data) {
                apiKeyUpdates.push(data as unknown as { providerName: string; encryptedKey: string });
              } else if ('value' in data) {
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

    expect(count).toBe(2); // 1 setting + 1 api key

    // Verify the re-encrypted settings value can be decrypted with new password
    expect(settingsUpdates).toHaveLength(1);
    const decrypted = decryptSettingValue(settingsUpdates[0]!.value, NEW_PW);
    expect(decrypted).toBe('secret-api-key');

    // Verify the re-encrypted API key can be decrypted with new password
    expect(apiKeyUpdates).toHaveLength(1);
    const decryptedApi = decryptSettingValue(apiKeyUpdates[0]!.encryptedKey, NEW_PW);
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
