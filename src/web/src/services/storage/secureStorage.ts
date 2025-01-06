import * as SecureStore from 'expo-secure-store';
import CryptoJS from 'crypto-js'; // v4.1.1

// Storage key constants with namespace prefixing for isolation
export const SECURE_STORAGE_KEYS = {
    AUTH_TOKEN: '@art_knowledge_graph/auth_token',
    REFRESH_TOKEN: '@art_knowledge_graph/refresh_token',
    BIOMETRIC_KEY: '@art_knowledge_graph/biometric_key',
    ENCRYPTION_KEY: '@art_knowledge_graph/encryption_key',
    KEY_DERIVATION_SALT: '@art_knowledge_graph/key_derivation_salt'
} as const;

// Encryption configuration constants
const ENCRYPTION_CONFIG = {
    ALGORITHM: 'AES-256-GCM',
    KEY_SIZE: 256,
    IV_LENGTH: 16,
    SALT_LENGTH: 32,
    ITERATIONS: 100000,
    TAG_LENGTH: 16
} as const;

// Type definitions for enhanced type safety
type SecureStorageKey = typeof SECURE_STORAGE_KEYS[keyof typeof SECURE_STORAGE_KEYS];

interface StorageOptions {
    keychainAccessible?: boolean;
    requireAuthentication?: boolean;
}

interface EncryptionOptions {
    iterations?: number;
    saltLength?: number;
}

interface DecryptionOptions {
    requireIntegrityCheck?: boolean;
}

class SecurityError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'SecurityError';
    }
}

// Utility functions for cryptographic operations
const generateIV = (): string => {
    const iv = CryptoJS.lib.WordArray.random(ENCRYPTION_CONFIG.IV_LENGTH);
    return CryptoJS.enc.Base64.stringify(iv);
};

const deriveKey = (salt: string, iterations: number = ENCRYPTION_CONFIG.ITERATIONS): string => {
    const masterKey = localStorage.getItem(SECURE_STORAGE_KEYS.ENCRYPTION_KEY);
    if (!masterKey) throw new SecurityError('Encryption key not found');

    return CryptoJS.PBKDF2(masterKey, salt, {
        keySize: ENCRYPTION_CONFIG.KEY_SIZE / 32,
        iterations,
    }).toString();
};

const generateIntegrityCheck = (data: string): string => {
    return CryptoJS.SHA256(data).toString();
};

// Main secure storage functions
export async function storeSecureData<T>(
    key: SecureStorageKey,
    value: T,
    options: StorageOptions = {}
): Promise<void> {
    try {
        if (!Object.values(SECURE_STORAGE_KEYS).includes(key)) {
            throw new SecurityError('Invalid storage key');
        }

        const serializedData = JSON.stringify(value);
        const encryptedData = await encryptData(serializedData);

        await SecureStore.setItemAsync(key, encryptedData, {
            keychainAccessible: options.keychainAccessible ?? true,
            requireAuthentication: options.requireAuthentication ?? false,
        });
    } catch (error) {
        throw new SecurityError(`Failed to store secure data: ${error.message}`);
    }
}

export async function getSecureData<T>(
    key: SecureStorageKey,
    options: StorageOptions = {}
): Promise<T | null> {
    try {
        if (!Object.values(SECURE_STORAGE_KEYS).includes(key)) {
            throw new SecurityError('Invalid storage key');
        }

        const encryptedData = await SecureStore.getItemAsync(key, {
            keychainAccessible: options.keychainAccessible ?? true,
            requireAuthentication: options.requireAuthentication ?? false,
        });

        if (!encryptedData) return null;

        const decryptedData = await decryptData(encryptedData);
        return JSON.parse(decryptedData) as T;
    } catch (error) {
        throw new SecurityError(`Failed to retrieve secure data: ${error.message}`);
    }
}

export async function removeSecureData(
    key: SecureStorageKey,
    options: StorageOptions = {}
): Promise<void> {
    try {
        if (!Object.values(SECURE_STORAGE_KEYS).includes(key)) {
            throw new SecurityError('Invalid storage key');
        }

        await SecureStore.deleteItemAsync(key, {
            keychainAccessible: options.keychainAccessible ?? true,
            requireAuthentication: options.requireAuthentication ?? false,
        });
    } catch (error) {
        throw new SecurityError(`Failed to remove secure data: ${error.message}`);
    }
}

export async function clearSecureStorage(options: StorageOptions = {}): Promise<void> {
    try {
        const keys = Object.values(SECURE_STORAGE_KEYS);
        await Promise.all(
            keys.map(key => 
                SecureStore.deleteItemAsync(key, {
                    keychainAccessible: options.keychainAccessible ?? true,
                    requireAuthentication: options.requireAuthentication ?? false,
                })
            )
        );
    } catch (error) {
        throw new SecurityError(`Failed to clear secure storage: ${error.message}`);
    }
}

function encryptData(
    data: string,
    options: EncryptionOptions = {}
): string {
    try {
        const iv = generateIV();
        const salt = CryptoJS.lib.WordArray.random(
            options.saltLength ?? ENCRYPTION_CONFIG.SALT_LENGTH
        ).toString();
        
        const key = deriveKey(salt, options.iterations);
        
        const encrypted = CryptoJS.AES.encrypt(data, key, {
            iv: CryptoJS.enc.Base64.parse(iv),
            mode: CryptoJS.mode.GCM,
            padding: CryptoJS.pad.Pkcs7,
        });

        const integrityCheck = generateIntegrityCheck(encrypted.toString());
        
        const result = JSON.stringify({
            iv,
            salt,
            data: encrypted.toString(),
            integrity: integrityCheck,
        });

        return CryptoJS.enc.Base64.stringify(
            CryptoJS.enc.Utf8.parse(result)
        );
    } catch (error) {
        throw new SecurityError(`Encryption failed: ${error.message}`);
    }
}

function decryptData(
    encryptedData: string,
    options: DecryptionOptions = {}
): string {
    try {
        const parsed = JSON.parse(
            CryptoJS.enc.Base64.parse(encryptedData).toString(CryptoJS.enc.Utf8)
        );

        if (options.requireIntegrityCheck !== false) {
            const integrityCheck = generateIntegrityCheck(parsed.data);
            if (integrityCheck !== parsed.integrity) {
                throw new SecurityError('Data integrity check failed');
            }
        }

        const key = deriveKey(parsed.salt);
        
        const decrypted = CryptoJS.AES.decrypt(parsed.data, key, {
            iv: CryptoJS.enc.Base64.parse(parsed.iv),
            mode: CryptoJS.mode.GCM,
            padding: CryptoJS.pad.Pkcs7,
        });

        return decrypted.toString(CryptoJS.enc.Utf8);
    } catch (error) {
        throw new SecurityError(`Decryption failed: ${error.message}`);
    }
}