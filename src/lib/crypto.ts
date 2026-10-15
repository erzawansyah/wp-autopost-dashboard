import "server-only"
import crypto from "crypto"
import { serverEnv } from "@/lib/env/server"

/**
 * AES-256-GCM Encryption / Decryption Utility
 * Digunakan untuk mengenkripsi WordPress Application Passwords dan API Keys.
 */

function getEncryptionKey(): Buffer {
  const keyHex = serverEnv().ENCRYPTION_MASTER_KEY
  if (!keyHex) {
    throw new Error("ENCRYPTION_MASTER_KEY belum disetel di environment variables.")
  }
  // Kunci harus berupa 32 bytes (64 karakter hex)
  const key = Buffer.from(keyHex, "hex")
  if (key.length !== 32) {
    throw new Error("ENCRYPTION_MASTER_KEY harus berupa 32 bytes (64 karakter hex).")
  }
  return key
}

/**
 * Mengenkripsi plaintext menggunakan AES-256-GCM
 * @returns string terenkripsi berformat `iv:authTag:ciphertext` dalam representasi hex
 */
export function encryptCredential(plainText: string): string {
  if (!plainText) return ""
  const key = getEncryptionKey()
  const iv = crypto.randomBytes(12) // 12 bytes IV standar untuk GCM
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv)

  let encrypted = cipher.update(plainText, "utf8", "hex")
  encrypted += cipher.final("hex")
  const authTag = cipher.getAuthTag().toString("hex")

  return `${iv.toString("hex")}:${authTag}:${encrypted}`
}

/**
 * Mendekripsi string ciphertext AES-256-GCM
 * @param encryptedString format `iv:authTag:ciphertext` dalam hex
 */
export function decryptCredential(encryptedString: string): string {
  if (!encryptedString) return ""
  const parts = encryptedString.split(":")
  if (parts.length !== 3) {
    throw new Error("Format kredensial terenkripsi tidak valid (harus iv:authTag:ciphertext).")
  }

  const [ivHex, authTagHex, cipherTextHex] = parts
  const key = getEncryptionKey()
  const iv = Buffer.from(ivHex, "hex")
  const authTag = Buffer.from(authTagHex, "hex")

  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv)
  decipher.setAuthTag(authTag)

  let decrypted = decipher.update(cipherTextHex, "hex", "utf8")
  decrypted += decipher.final("utf8")

  return decrypted
}

/**
 * Payload State Token untuk alur otorisasi redirect WordPress (CSRF Guard)
 */
export interface WPAuthStatePayload {
  userId: string
  baseUrl: string
  siteName: string
  returnOrigin?: string
  exp?: number
}

/**
 * Buat State Token anti-CSRF yang ditandatangani HMAC-SHA256 (berlaku 15 menit)
 */
export function createAuthStateToken(payload: WPAuthStatePayload): string {
  const key = getEncryptionKey()
  const data = JSON.stringify({
    ...payload,
    exp: Date.now() + 15 * 60 * 1000, // 15 menit kedaluwarsa
  })
  const b64 = Buffer.from(data, "utf8").toString("base64url")
  const hmac = crypto.createHmac("sha256", key).update(b64).digest("base64url")
  return `${b64}.${hmac}`
}

/**
 * Validasi dan dekripsi State Token anti-CSRF
 */
export function verifyAuthStateToken(token: string): WPAuthStatePayload | null {
  try {
    const [b64, signature] = token.split(".")
    if (!b64 || !signature) return null

    const key = getEncryptionKey()
    const expectedSig = crypto.createHmac("sha256", key).update(b64).digest("base64url")

    const sigBuf = Buffer.from(signature)
    const expBuf = Buffer.from(expectedSig)

    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return null
    }

    const jsonStr = Buffer.from(b64, "base64url").toString("utf8")
    const parsed = JSON.parse(jsonStr) as WPAuthStatePayload

    if (parsed.exp && parsed.exp < Date.now()) {
      return null
    }

    return parsed
  } catch {
    return null
  }
}
