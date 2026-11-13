import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12; // Standard 96-bit IV for GCM
const TAG_LENGTH = 16; // Standard 128-bit authentication tag

function getMasterKey(): Buffer {
  const secret = process.env.FLOWPILOT_ENCRYPTION_KEY || 'flowpilot_default_secure_vault_master_key_32_bytes!';
  return crypto.createHash('sha256').update(secret).digest();
}

export interface EncryptedPayload {
  iv: string;
  tag: string;
  ciphertext: string;
}

export class CredentialVault {
  /**
   * Encrypts a sensitive data record or string using AES-256-GCM.
   */
  public static encrypt(data: unknown): string {
    const text = typeof data === 'string' ? data : JSON.stringify(data);
    const key = getMasterKey();
    const iv = crypto.randomBytes(IV_LENGTH);

    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let ciphertext = cipher.update(text, 'utf8', 'hex');
    ciphertext += cipher.final('hex');
    const tag = cipher.getAuthTag().toString('hex');

    return `${iv.toString('hex')}:${tag}:${ciphertext}`;
  }

  /**
   * Decrypts an AES-256-GCM encrypted payload back into its original parsed object or string.
   */
  public static decrypt<T = any>(encryptedString: string): T {
    if (!encryptedString || !encryptedString.includes(':')) {
      throw new Error('Invalid encrypted payload format. Expected "iv:tag:ciphertext".');
    }

    const parts = encryptedString.split(':');
    if (parts.length !== 3) {
      throw new Error('Malformed encrypted payload segments.');
    }

    const [ivHex, tagHex, ciphertextHex] = parts;
    const key = getMasterKey();
    const iv = Buffer.from(ivHex, 'hex');
    const tag = Buffer.from(tagHex, 'hex');

    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(tag);

    let decrypted = decipher.update(ciphertextHex, 'hex', 'utf8');
    decrypted += decipher.final('utf8');

    try {
      return JSON.parse(decrypted) as T;
    } catch {
      return decrypted as unknown as T;
    }
  }

  /**
   * Masks a secret value for safe UI display (e.g. sk-proj-...8a1f).
   */
  public static maskSecret(secret: string): string {
    if (!secret || secret.length < 8) {
      return '••••••••';
    }
    const prefix = secret.substring(0, 3);
    const suffix = secret.substring(secret.length - 4);
    return `${prefix}••••••••${suffix}`;
  }
}

