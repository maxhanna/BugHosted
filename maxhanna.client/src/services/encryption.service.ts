import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root'
})
export class EncryptionService {

  private readonly encoder = new TextEncoder();
  private readonly decoder = new TextDecoder();
  private decryptedCache: Map<string, string> = new Map<string, string>();


  encryptContent(message: string, password: string = 'defaultPassword'): string {
    try { 
      const msgBytes = this.encoder.encode(message);
      const pwdBytes = this.encoder.encode(password);
 
      const result = new Uint8Array(msgBytes.length);
      for (let i = 0; i < msgBytes.length; i++) { 
        const pwdByte = pwdBytes[i % pwdBytes.length];
 
        let transformed = msgBytes[i] ^ pwdByte;  // XOR with password
        transformed = (transformed + 7) % 256;    // Add constant
        transformed = ((transformed << 4) | (transformed >> 4)) & 0xFF;  // Rotate bits

        result[i] = transformed;
      }
 
      return Array.from(result).map(b => b.toString(16).padStart(2, '0')).join('');
    } catch (error) {
      console.error('Encryption error:', error);
      return message;
    }
  }

  decryptContent(encryptedHex: string, password: string = 'defaultPassword'): string {
    if (!encryptedHex) return '';
    if (password === undefined) return encryptedHex;
 
    const key = `${password}-${encryptedHex}`;
    if (this.decryptedCache.has(key)) {
      return this.decryptedCache.get(key)!;
    }

    try {
      const bytes = new Uint8Array(encryptedHex.match(/.{1,2}/g)?.map(byte => parseInt(byte, 16)) || []);
      const pwdBytes = this.encoder.encode(password);

      const result = new Uint8Array(bytes.length);
      for (let i = 0; i < bytes.length; i++) {
        const pwdByte = pwdBytes[i % pwdBytes.length];

        let transformed = bytes[i];
        transformed = ((transformed >> 4) | (transformed << 4)) & 0xFF;
        transformed = (transformed - 7 + 256) % 256;
        transformed = transformed ^ pwdByte;

        result[i] = transformed;
      }

      const decrypted = this.decoder.decode(result); 
      this.decryptedCache.set(key, decrypted); 

      return decrypted;
    } catch (error) {
      console.error('Decryption error:', error);
      return 'Error decrypting message';
    }
  } 
}
