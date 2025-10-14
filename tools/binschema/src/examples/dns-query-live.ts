/**
 * Live DNS Query Example
 *
 * Demonstrates BinSchema-generated code querying a real DNS server.
 * Uses Google's public DNS (8.8.8.8:53) to resolve domain names.
 */

import { createSocket } from "dgram";
import { readFileSync } from "fs";
import { resolve } from "path";
import { generateTypeScriptCode } from "../generators/typescript.js";
import type { BinarySchema } from "../schema/binary-schema.js";
import { writeFileSync, mkdirSync } from "fs";

// Load DNS schema
const schemaPath = resolve(__dirname, "../tests/protocols/dns.schema.json");
const schema = JSON.parse(readFileSync(schemaPath, "utf-8")) as BinarySchema;

// Generate code
console.log("Generating DNS message encoder/decoder...");
const generatedCode = generateTypeScriptCode(schema);

// Write generated code to temp file
const tempDir = resolve(__dirname, "../../.generated-examples");
mkdirSync(tempDir, { recursive: true });
const tempFile = resolve(tempDir, "dns-live.ts");
writeFileSync(tempFile, generatedCode);

console.log(`Generated code written to: ${tempFile}`);
console.log("Compiling TypeScript...");

// Compile the generated TypeScript
import { execSync } from "child_process";
execSync(`npx tsc ${tempFile} --outDir ${tempDir} --module esnext --target es2022 --moduleResolution node --esModuleInterop`, {
  cwd: resolve(__dirname, "../..")
});

console.log("Loading generated code...");

// Import the generated code
const generatedModule = await import(`${tempDir}/dns-live.js`);
const { DnsMessageEncoder, DnsMessageDecoder } = generatedModule;

/**
 * Query a DNS server for A records
 */
async function queryDNS(domain: string, dnsServer = "8.8.8.8", port = 53): Promise<void> {
  return new Promise((resolve, reject) => {
    // Parse domain into labels
    const labels = domain.split(".").map(label => ({
      type: "Label" as const,
      value: label
    }));

    // Create DNS query message
    const query = {
      id: Math.floor(Math.random() * 65536),
      flags: {
        qr: 0,      // Query
        opcode: 0,  // Standard query
        aa: 0,
        tc: 0,
        rd: 1,      // Recursion desired
        ra: 0,
        z: 0,
        rcode: 0
      },
      qdcount: 1,
      ancount: 0,
      nscount: 0,
      arcount: 0,
      questions: [
        {
          qname: labels,
          qtype: 1,   // A record
          qclass: 1   // IN (Internet)
        }
      ],
      answers: [],
      authority: [],
      additional: []
    };

    console.log(`\n🔍 Querying ${domain} (A record)...`);
    console.log(`📡 DNS Server: ${dnsServer}:${port}`);
    console.log(`🆔 Transaction ID: 0x${query.id.toString(16).padStart(4, '0')}`);

    // Encode the query
    const encoder = new DnsMessageEncoder();
    const queryBytes = encoder.encode(query);

    console.log(`📤 Query size: ${queryBytes.length} bytes`);
    const queryBytesHex = Array.from(queryBytes as Uint8Array).map(b => b.toString(16).padStart(2, '0')).join(' ');
    console.log(`📦 Query bytes: ${queryBytesHex}`);

    // Create UDP socket
    const socket = createSocket("udp4");

    let responseReceived = false;

    // Set timeout
    const timeout = setTimeout(() => {
      if (!responseReceived) {
        socket.close();
        reject(new Error(`DNS query timeout after 5 seconds`));
      }
    }, 5000);

    // Handle response
    socket.on("message", (msg) => {
      responseReceived = true;
      clearTimeout(timeout);

      console.log(`\n📥 Response received: ${msg.length} bytes`);
      const responseBytesHex = Array.from(msg as Uint8Array).slice(0, 50).map(b => b.toString(16).padStart(2, '0')).join(' ');
      console.log(`📦 Response bytes: ${responseBytesHex}${msg.length > 50 ? '...' : ''}`);

      try {
        // Decode the response
        const decoder = new DnsMessageDecoder(msg);
        const response = decoder.decode();

        console.log(`\n✅ Response decoded successfully!`);
        console.log(`🆔 Transaction ID: 0x${response.id.toString(16).padStart(4, '0')} ${response.id === query.id ? '(matches)' : '(MISMATCH!)'}`);
        console.log(`🏴 Flags: QR=${response.flags.qr} AA=${response.flags.aa} TC=${response.flags.tc} RD=${response.flags.rd} RA=${response.flags.ra} RCODE=${response.flags.rcode}`);

        if (response.flags.rcode !== 0) {
          const rcodes = ['NOERROR', 'FORMERR', 'SERVFAIL', 'NXDOMAIN', 'NOTIMP', 'REFUSED'];
          console.log(`❌ Error: ${rcodes[response.flags.rcode] || `Code ${response.flags.rcode}`}`);
        }

        console.log(`\n📋 Counts:`);
        console.log(`   Questions: ${response.qdcount}`);
        console.log(`   Answers: ${response.ancount}`);
        console.log(`   Authority: ${response.nscount}`);
        console.log(`   Additional: ${response.arcount}`);

        // Display questions
        if (response.questions && response.questions.length > 0) {
          console.log(`\n❓ Questions:`);
          response.questions.forEach((q: any, i: number) => {
            const qname = reconstructDomain(q.qname);
            console.log(`   ${i + 1}. ${qname} (Type: ${q.qtype}, Class: ${q.qclass})`);
          });
        }

        // Display answers
        if (response.answers && response.answers.length > 0) {
          console.log(`\n✨ Answers:`);
          response.answers.forEach((answer: any, i: number) => {
            const name = reconstructDomain(answer.name);
            const typeNames: Record<number, string> = { 1: 'A', 2: 'NS', 5: 'CNAME', 6: 'SOA', 15: 'MX', 16: 'TXT' };
            const typeName = typeNames[answer.type] || `TYPE${answer.type}`;

            console.log(`   ${i + 1}. ${name}`);
            console.log(`      Type: ${typeName} (${answer.type})`);
            console.log(`      Class: IN (${answer.class})`);
            console.log(`      TTL: ${answer.ttl} seconds`);

            // Display RDATA based on type
            if (answer.rdata) {
              if (answer.rdata.type === 'ARdata' && answer.rdata.value) {
                const ip = ipFromUint32(answer.rdata.value.address);
                console.log(`      IPv4: ${ip}`);
              } else if (answer.rdata.type === 'NSRdata' && answer.rdata.value) {
                const ns = reconstructDomain(answer.rdata.value.nsdname);
                console.log(`      Nameserver: ${ns}`);
              } else if (answer.rdata.type === 'CNAMERdata' && answer.rdata.value) {
                const cname = reconstructDomain(answer.rdata.value.cname);
                console.log(`      CNAME: ${cname}`);
              } else {
                console.log(`      RDATA: ${JSON.stringify(answer.rdata)}`);
              }
            }
          });
        }

        // Display authority records
        if (response.authority && response.authority.length > 0) {
          console.log(`\n🏛️  Authority:`);
          response.authority.forEach((auth: any, i: number) => {
            const name = reconstructDomain(auth.name);
            console.log(`   ${i + 1}. ${name} (Type: ${auth.type}, TTL: ${auth.ttl}s)`);
          });
        }

        // Display additional records
        if (response.additional && response.additional.length > 0) {
          console.log(`\n➕ Additional:`);
          response.additional.forEach((add: any, i: number) => {
            const name = reconstructDomain(add.name);
            console.log(`   ${i + 1}. ${name} (Type: ${add.type}, TTL: ${add.ttl}s)`);
          });
        }

      } catch (error) {
        console.error(`\n❌ Failed to decode response:`, error);
        reject(error);
      }

      socket.close();
      resolve();
    });

    socket.on("error", (err) => {
      clearTimeout(timeout);
      console.error(`\n❌ Socket error:`, err);
      reject(err);
    });

    // Send query
    socket.send(queryBytes, port, dnsServer);
  });
}

/**
 * Reconstruct domain name from label array
 */
function reconstructDomain(labels: any[]): string {
  if (!labels || labels.length === 0) return ".";

  return labels.map((label: any) => {
    if (label.type === "Label") {
      return label.value;
    } else if (label.type === "LabelPointer") {
      // Pointer was already resolved during decoding
      return label.value;
    }
    return "?";
  }).join(".");
}

/**
 * Convert uint32 to IPv4 address string
 */
function ipFromUint32(ip: number): string {
  return [
    (ip >>> 24) & 0xFF,
    (ip >>> 16) & 0xFF,
    (ip >>> 8) & 0xFF,
    ip & 0xFF
  ].join(".");
}

/**
 * Main
 */
async function main() {
  const domain = process.argv[2] || "example.com";
  const dnsServer = process.argv[3] || "8.8.8.8";

  console.log("=".repeat(70));
  console.log("🌐 BinSchema Live DNS Query Example");
  console.log("=".repeat(70));

  try {
    await queryDNS(domain, dnsServer);
    console.log("\n" + "=".repeat(70));
    console.log("✅ Query completed successfully!");
    console.log("=".repeat(70));
  } catch (error) {
    console.error("\n" + "=".repeat(70));
    console.error("❌ Query failed:", error);
    console.error("=".repeat(70));
    process.exit(1);
  }
}

main().catch(console.error);
