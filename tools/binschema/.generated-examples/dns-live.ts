import { BitStreamDecoder } from "../dist/runtime/bit-stream.js";

// Global set for circular reference detection in pointers
let visitedOffsets: Set<number>;

export interface DnsHeader {
  id: number;
  flags: { qr: number, opcode: number, aa: number, tc: number, rd: number, ra: number, z: number, rcode: number };
  qdcount: number;
  ancount: number;
  nscount: number;
  arcount: number;
}

function encodeDnsHeader(stream: any, value: DnsHeader): void {
  stream.writeUint16(value.id, 'big');
  encodebitfield(stream, value.flags);
  stream.writeUint16(value.qdcount, 'big');
  stream.writeUint16(value.ancount, 'big');
  stream.writeUint16(value.nscount, 'big');
  stream.writeUint16(value.arcount, 'big');
}

function decodeDnsHeader(stream: any): DnsHeader {
  const id = stream.readUint16('big');
  const flags = decodebitfield(stream);
  const qdcount = stream.readUint16('big');
  const ancount = stream.readUint16('big');
  const nscount = stream.readUint16('big');
  const arcount = stream.readUint16('big');
  return { id, flags, qdcount, ancount, nscount, arcount };
}

// DNS label (length-prefixed ASCII string)
export type Label = string;

// DNS label or pointer to previous label
export type CompressedLabel = 
  | { type: 'Label'; value: Label }
  | { type: 'LabelPointer'; value: LabelPointer };

function encodeCompressedLabel(stream: any, value: CompressedLabel): void {
  if (value.type === 'Label') {
    encodeLabel(stream, value.value);
  }
  else if (value.type === 'LabelPointer') {
    encodeLabelPointer(stream, value.value);
  } else {
    throw new Error(`Unknown variant type: ${(value as any).type}`);
  }
}

function decodeCompressedLabel(stream: any): CompressedLabel {
  const discriminator = stream.peekUint8();
  if (discriminator < 0xC0) {
    const value = decodeLabel(stream);
    return { type: 'Label', value };
  }
  else if (discriminator >= 0xC0) {
    const value = decodeLabelPointer(stream);
    return { type: 'LabelPointer', value };
  } else {
    throw new Error(`Unknown discriminator: 0x${discriminator.toString(16)}`);
  }
}

// Pointer to previously-seen label (RFC 1035 Section 4.1.4)
export type LabelPointer = Label;

function encodeLabelPointer(stream: any, value: LabelPointer): void {
  encodeLabel(stream, value);
}

function decodeLabelPointer(stream: any): LabelPointer {
  if (!visitedOffsets) visitedOffsets = new Set<number>();
  visitedOffsets.clear();

  const pointerValue = stream.readUint16('big');
  const offset = pointerValue & 0x3FFF;

  if (visitedOffsets.has(offset)) {
    throw new Error(`Circular pointer reference detected at offset ${offset}`);
  }
  visitedOffsets.add(offset);

  stream.pushPosition();
  stream.seek(offset);
  const value = decodeLabel(stream);

  stream.popPosition();

  visitedOffsets.clear();
  return value;
}

// Sequence of labels or pointers (pointers are terminal per RFC 1035)
export type CompressedDomain = CompressedLabel[];

export interface Question {
  qname: CompressedDomain;
  qtype: number;
  qclass: number;
}

function encodeQuestion(stream: any, value: Question): void {
  encodeCompressedDomain(stream, value.qname);
  stream.writeUint16(value.qtype, 'big');
  stream.writeUint16(value.qclass, 'big');
}

function decodeQuestion(stream: any): Question {
  const qname = decodeCompressedDomain(stream);
  const qtype = stream.readUint16('big');
  const qclass = stream.readUint16('big');
  return { qname, qtype, qclass };
}

export interface ARdata {
  address: number;
}

function encodeARdata(stream: any, value: ARdata): void {
  stream.writeUint32(value.address, 'big');
}

function decodeARdata(stream: any): ARdata {
  const address = stream.readUint32('big');
  return { address };
}

export interface NSRdata {
  nsdname: CompressedDomain;
}

function encodeNSRdata(stream: any, value: NSRdata): void {
  encodeCompressedDomain(stream, value.nsdname);
}

function decodeNSRdata(stream: any): NSRdata {
  const nsdname = decodeCompressedDomain(stream);
  return { nsdname };
}

export interface CNAMERdata {
  cname: CompressedDomain;
}

function encodeCNAMERdata(stream: any, value: CNAMERdata): void {
  encodeCompressedDomain(stream, value.cname);
}

function decodeCNAMERdata(stream: any): CNAMERdata {
  const cname = decodeCompressedDomain(stream);
  return { cname };
}

export interface ResourceRecord {
  name: CompressedDomain;
  type: number;
  class: number;
  ttl: number;
  rdlength: number;
  rdata: 
  | { type: 'ARdata'; value: ARdata }
  | { type: 'NSRdata'; value: NSRdata }
  | { type: 'CNAMERdata'; value: CNAMERdata };
}

function encodeResourceRecord(stream: any, value: ResourceRecord): void {
  encodeCompressedDomain(stream, value.name);
  stream.writeUint16(value.type, 'big');
  stream.writeUint16(value.class, 'big');
  stream.writeUint32(value.ttl, 'big');
  stream.writeUint16(value.rdlength, 'big');
  if (value.rdata.type === 'ARdata') {
    encodeARdata(stream, value.rdata.value);
  }
  else if (value.rdata.type === 'NSRdata') {
    encodeNSRdata(stream, value.rdata.value);
  }
  else if (value.rdata.type === 'CNAMERdata') {
    encodeCNAMERdata(stream, value.rdata.value);
  } else {
    throw new Error(`Unknown variant type: ${(value.rdata as any).type}`);
  }
}

function decodeResourceRecord(stream: any): ResourceRecord {
  const name = decodeCompressedDomain(stream);
  const type = stream.readUint16('big');
  const class = stream.readUint16('big');
  const ttl = stream.readUint32('big');
  const rdlength = stream.readUint16('big');
  if (type === 1) {
    const rdata = decodeARdata(stream);
    return { name, type, class, ttl, rdlength, rdata: { type: 'ARdata', value: rdata } };
  }
  else if (type === 2) {
    const rdata = decodeNSRdata(stream);
    return { name, type, class, ttl, rdlength, rdata: { type: 'NSRdata', value: rdata } };
  }
  else if (type === 5) {
    const rdata = decodeCNAMERdata(stream);
    return { name, type, class, ttl, rdlength, rdata: { type: 'CNAMERdata', value: rdata } };
  } else {
    throw new Error(`Unknown discriminator value: ${type}`);
  }
}

export interface DnsQuery {
  questions: Question[];
}

function encodeDnsQuery(stream: any, value: DnsQuery): void {
  for (const value_questions_item of value.questions) {
    encodeQuestion(stream, value_questions_item);
  }
}

function decodeDnsQuery(stream: any): DnsQuery {
  const questions: Question[] = [];
    questions.push(decodeQuestion(stream));
  }
  return { questions };
}

export interface DnsResponse {
  questions: Question[];
  answers: ResourceRecord[];
  authority: ResourceRecord[];
  additional: ResourceRecord[];
}

function encodeDnsResponse(stream: any, value: DnsResponse): void {
  for (const value_questions_item of value.questions) {
    encodeQuestion(stream, value_questions_item);
  }
  for (const value_answers_item of value.answers) {
    encodeResourceRecord(stream, value_answers_item);
  }
  for (const value_authority_item of value.authority) {
    encodeResourceRecord(stream, value_authority_item);
  }
  for (const value_additional_item of value.additional) {
    encodeResourceRecord(stream, value_additional_item);
  }
}

function decodeDnsResponse(stream: any): DnsResponse {
  const questions: Question[] = [];
    questions.push(decodeQuestion(stream));
  }
  const answers: ResourceRecord[] = [];
    answers.push(decodeResourceRecord(stream));
  }
  const authority: ResourceRecord[] = [];
    authority.push(decodeResourceRecord(stream));
  }
  const additional: ResourceRecord[] = [];
    additional.push(decodeResourceRecord(stream));
  }
  return { questions, answers, authority, additional };
}

