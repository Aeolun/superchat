// Global set for circular reference detection in pointers
let visitedOffsets;
function encodeDnsHeader(stream, value) {
    stream.writeUint16(value.id, 'big');
    encodebitfield(stream, value.flags);
    stream.writeUint16(value.qdcount, 'big');
    stream.writeUint16(value.ancount, 'big');
    stream.writeUint16(value.nscount, 'big');
    stream.writeUint16(value.arcount, 'big');
}
function decodeDnsHeader(stream) {
    const id = stream.readUint16('big');
    const flags = decodebitfield(stream);
    const qdcount = stream.readUint16('big');
    const ancount = stream.readUint16('big');
    const nscount = stream.readUint16('big');
    const arcount = stream.readUint16('big');
    return { id, flags, qdcount, ancount, nscount, arcount };
}
function encodeCompressedLabel(stream, value) {
    if (value.type === 'Label') {
        encodeLabel(stream, value.value);
    }
    else if (value.type === 'LabelPointer') {
        encodeLabelPointer(stream, value.value);
    }
    else {
        throw new Error(`Unknown variant type: ${value.type}`);
    }
}
function decodeCompressedLabel(stream) {
    const discriminator = stream.peekUint8();
    if (discriminator < 0xC0) {
        const value = decodeLabel(stream);
        return { type: 'Label', value };
    }
    else if (discriminator >= 0xC0) {
        const value = decodeLabelPointer(stream);
        return { type: 'LabelPointer', value };
    }
    else {
        throw new Error(`Unknown discriminator: 0x${discriminator.toString(16)}`);
    }
}
function encodeLabelPointer(stream, value) {
    encodeLabel(stream, value);
}
function decodeLabelPointer(stream) {
    if (!visitedOffsets)
        visitedOffsets = new Set();
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
function encodeQuestion(stream, value) {
    encodeCompressedDomain(stream, value.qname);
    stream.writeUint16(value.qtype, 'big');
    stream.writeUint16(value.qclass, 'big');
}
function decodeQuestion(stream) {
    const qname = decodeCompressedDomain(stream);
    const qtype = stream.readUint16('big');
    const qclass = stream.readUint16('big');
    return { qname, qtype, qclass };
}
function encodeARdata(stream, value) {
    stream.writeUint32(value.address, 'big');
}
function decodeARdata(stream) {
    const address = stream.readUint32('big');
    return { address };
}
function encodeNSRdata(stream, value) {
    encodeCompressedDomain(stream, value.nsdname);
}
function decodeNSRdata(stream) {
    const nsdname = decodeCompressedDomain(stream);
    return { nsdname };
}
function encodeCNAMERdata(stream, value) {
    encodeCompressedDomain(stream, value.cname);
}
function decodeCNAMERdata(stream) {
    const cname = decodeCompressedDomain(stream);
    return { cname };
}
function encodeResourceRecord(stream, value) {
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
    }
    else {
        throw new Error(`Unknown variant type: ${value.rdata.type}`);
    }
}
function decodeResourceRecord(stream) {
    const name = decodeCompressedDomain(stream);
    const type = stream.readUint16('big');
    const ;
    class {
    }
    stream.readUint16('big');
    const ttl = stream.readUint32('big');
    const rdlength = stream.readUint16('big');
    if (type === 1) {
        const rdata = decodeARdata(stream);
        return { name, type, class: , ttl, rdlength, rdata: { type: 'ARdata', value: rdata } };
    }
    else if (type === 2) {
        const rdata = decodeNSRdata(stream);
        return { name, type, class: , ttl, rdlength, rdata: { type: 'NSRdata', value: rdata } };
    }
    else if (type === 5) {
        const rdata = decodeCNAMERdata(stream);
        return { name, type, class: , ttl, rdlength, rdata: { type: 'CNAMERdata', value: rdata } };
    }
    else {
        throw new Error(`Unknown discriminator value: ${type}`);
    }
}
function encodeDnsQuery(stream, value) {
    for (const value_questions_item of value.questions) {
        encodeQuestion(stream, value_questions_item);
    }
}
function decodeDnsQuery(stream) {
    const questions = [];
    questions.push(decodeQuestion(stream));
}
return { questions };
function encodeDnsResponse(stream, value) {
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
function decodeDnsResponse(stream) {
    const questions = [];
    questions.push(decodeQuestion(stream));
}
const answers = [];
answers.push(decodeResourceRecord(stream));
const authority = [];
authority.push(decodeResourceRecord(stream));
const additional = [];
additional.push(decodeResourceRecord(stream));
return { questions, answers, authority, additional };
export {};
