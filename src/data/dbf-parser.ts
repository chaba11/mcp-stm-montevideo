/**
 * Minimal DBF file parser for STM shapefiles.
 * Handles dBASE III format with text (C) and numeric (N) fields.
 * Text fields are decoded from UTF-8 (CKAN exports use UTF-8 despite the traditional Latin-1 DBF convention).
 */

interface DbfField {
  name: string;
  type: "C" | "N" | string;
  length: number;
}

export interface DbfRecord {
  [key: string]: string | number;
}

export function parseDbf(buffer: Buffer): DbfRecord[] {
  let offset = 0;

  // Header
  offset += 1; // version
  offset += 3; // year, month, day
  const numRecords = buffer.readUInt32LE(offset);
  offset += 4;
  const headerSize = buffer.readUInt16LE(offset);
  offset += 2;
  offset += 2; // record size
  offset += 20; // reserved

  // Field descriptors (32 bytes each, terminated by 0x0D)
  const fields: DbfField[] = [];
  while (offset < headerSize - 1) {
    if (buffer[offset] === 0x0d) break;
    const nameBytes = buffer.slice(offset, offset + 11);
    const name = nameBytes.slice(0, nameBytes.indexOf(0)).toString("ascii");
    const type = String.fromCharCode(buffer[offset + 11]);
    const length = buffer[offset + 16];
    offset += 32;
    fields.push({ name, type, length });
  }

  // Records start at headerSize
  offset = headerSize;
  const records: DbfRecord[] = [];

  for (let i = 0; i < numRecords; i++) {
    const deletionMarker = buffer[offset];
    offset += 1;

    if (deletionMarker === 0x2a) {
      // Deleted record — skip
      for (const field of fields) offset += field.length;
      continue;
    }

    const record: DbfRecord = {};
    for (const field of fields) {
      const raw = buffer.slice(offset, offset + field.length);
      offset += field.length;
      // Decode as UTF-8 (CKAN DBF files use UTF-8, not the traditional Latin-1)
      const str = raw.toString("utf8").trim();

      if (field.type === "N" && str !== "") {
        const num = parseFloat(str);
        record[field.name] = isNaN(num) ? 0 : num;
      } else {
        record[field.name] = str;
      }
    }
    records.push(record);
  }

  return records;
}
