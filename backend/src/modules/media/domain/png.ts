import { BadRequestException } from '@nestjs/common';
import { inflateSync } from 'node:zlib';

// Shared media format: non-interlaced 8-bit RGB/RGBA PNG, decoded and CRC checked.
// No SVG, scripts, external references, animation or metadata is persisted.
export function validatePng(base64: string): Buffer {
  try {
    if (base64.length > 2796204 || base64.length % 4 || !/^[A-Za-z0-9+/]*={0,2}$/.test(base64)) throw new Error();
    const input = Buffer.from(base64, 'base64');
    if (input.toString('base64') !== base64) throw new Error();
    if (input.length > 2 * 1024 * 1024 || input.subarray(0,8).toString('hex') !== '89504e470d0a1a0a') throw new Error();
    const chunks: Buffer[] = [input.subarray(0,8)]; const data: Buffer[] = [];
    let offset = 8, width = 0, height = 0, channels = 0, ended = false, dataEnded = false;
    while (offset < input.length) {
      const length = input.readUInt32BE(offset); const end = offset + 12 + length;
      if (end > input.length) throw new Error();
      const type = input.subarray(offset+4,offset+8).toString('ascii');
      let crc = 0xffffffff;
      for (const byte of input.subarray(offset+4,end-4)) {
        crc ^= byte;
        for (let b=0;b<8;b++) crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
      }
      if (((crc ^ 0xffffffff) >>> 0) !== input.readUInt32BE(end-4)) throw new Error();
      if (!width && type !== 'IHDR') throw new Error();
      if (type === 'IHDR') {
        if (width || length !== 13) throw new Error();
        width = input.readUInt32BE(offset+8); height = input.readUInt32BE(offset+12);
        const color = input[offset+17]; channels = color === 2 ? 3 : color === 6 ? 4 : 0;
        if (!width || !height || width > 1600 || height > 1600 || !channels || input[offset+16] !== 8 ||
          input[offset+18] || input[offset+19] || input[offset+20]) throw new Error();
        chunks.push(input.subarray(offset,end));
      } else if (type === 'IDAT') {
        if (dataEnded) throw new Error();
        data.push(input.subarray(offset+8,end-4)); chunks.push(input.subarray(offset,end));
      } else if (type === 'IEND') {
        if (length || end !== input.length || !data.length) throw new Error();
        chunks.push(input.subarray(offset,end)); ended = true;
      } else {
        if (data.length) dataEnded = true;
        if (type[0] === type[0].toUpperCase() || ['acTL','fcTL','fdAT'].includes(type)) throw new Error();
      }
      offset = end;
    }
    if (!ended) throw new Error();
    const stride = width * channels + 1; const expected = stride * height;
    const decoded = inflateSync(Buffer.concat(data), { maxOutputLength: expected });
    if (decoded.length !== expected) throw new Error();
    for (let y=0;y<height;y++) if (decoded[y*stride] > 4) throw new Error();
    return Buffer.concat(chunks);
  } catch { throw new BadRequestException('Usa una imagen PNG RGB/RGBA de 8 bits, sin entrelazado, de hasta 1600 × 1600 y 2 MB.'); }
}
