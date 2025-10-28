// ABOUTME: CRC32 checksum computation
// ABOUTME: Standard CRC-32 algorithm used in ZIP, PNG, Ethernet, etc.

/**
 * CRC32 lookup table (pre-computed for performance)
 * Using the standard CRC-32 polynomial: 0xEDB88320
 */
const CRC32_TABLE = new Uint32Array(256);

// Initialize CRC32 table
for (let i = 0; i < 256; i++) {
  let crc = i;
  for (let j = 0; j < 8; j++) {
    crc = (crc & 1) ? (crc >>> 1) ^ 0xEDB88320 : crc >>> 1;
  }
  CRC32_TABLE[i] = crc >>> 0;  // Ensure unsigned 32-bit
}

/**
 * Compute CRC32 checksum of byte array
 *
 * This implements the standard CRC-32 algorithm used in:
 * - ZIP files
 * - PNG images
 * - Ethernet frames
 * - Many other formats
 *
 * @param data - Byte array to checksum
 * @returns CRC32 checksum as unsigned 32-bit integer
 */
export function crc32(data: Uint8Array | number[]): number {
  let crc = 0xFFFFFFFF;  // Initial value

  const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);

  for (let i = 0; i < bytes.length; i++) {
    const byte = bytes[i];
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ byte) & 0xFF];
  }

  return (crc ^ 0xFFFFFFFF) >>> 0;  // Final XOR and ensure unsigned
}
