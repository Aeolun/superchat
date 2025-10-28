/**
 * Test validation of computed fields
 */

import { validateSchema } from "../../schema/validator.js";
import { BinarySchema } from "../../schema/binary-schema.js";

// Test 1: Valid length_of computed field
const validLengthOfSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileHeader: {
      sequence: [
        {
          name: "len_file_name",
          type: "uint16",
          computed: {
            type: "length_of",
            target: "file_name"
          }
        },
        {
          name: "file_name",
          type: "string",
          kind: "fixed",
          length: 10,
          encoding: "utf8"
        }
      ]
    }
  }
};

const result1 = validateSchema(validLengthOfSchema);
if (!result1.valid) {
  console.error("Test 1 FAILED: Valid length_of should pass validation");
  console.error(result1.errors);
  process.exit(1);
}
console.log("✓ Test 1 PASSED: Valid length_of computed field");

// Test 2: Invalid - length_of with wrong field type (should be unsigned int)
const invalidLengthOfTypeSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileHeader: {
      sequence: [
        {
          name: "len_file_name",
          type: "int16", // Wrong! Should be unsigned
          computed: {
            type: "length_of",
            target: "file_name"
          }
        },
        {
          name: "file_name",
          type: "string",
          kind: "fixed",
          length: 10,
          encoding: "utf8"
        }
      ]
    }
  }
};

const result2 = validateSchema(invalidLengthOfTypeSchema);
if (result2.valid) {
  console.error("Test 2 FAILED: length_of with signed int should fail validation");
  process.exit(1);
}
if (!result2.errors.some(e => e.message.includes("unsigned integer type"))) {
  console.error("Test 2 FAILED: Expected error about unsigned integer type");
  console.error(result2.errors);
  process.exit(1);
}
console.log("✓ Test 2 PASSED: length_of with signed int rejected");

// Test 3: Invalid - length_of target doesn't exist
const invalidTargetSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileHeader: {
      sequence: [
        {
          name: "len_file_name",
          type: "uint16",
          computed: {
            type: "length_of",
            target: "nonexistent_field"
          }
        },
        {
          name: "file_name",
          type: "string",
          kind: "fixed",
          length: 10,
          encoding: "utf8"
        }
      ]
    }
  }
};

const result3 = validateSchema(invalidTargetSchema);
if (result3.valid) {
  console.error("Test 3 FAILED: length_of with nonexistent target should fail");
  process.exit(1);
}
if (!result3.errors.some(e => e.message.includes("not found"))) {
  console.error("Test 3 FAILED: Expected error about target not found");
  console.error(result3.errors);
  process.exit(1);
}
console.log("✓ Test 3 PASSED: length_of with nonexistent target rejected");

// Test 4: Invalid - length_of target is not array or string
const invalidTargetTypeSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileHeader: {
      sequence: [
        {
          name: "len_something",
          type: "uint16",
          computed: {
            type: "length_of",
            target: "flags"
          }
        },
        {
          name: "flags",
          type: "uint32"
        }
      ]
    }
  }
};

const result4 = validateSchema(invalidTargetTypeSchema);
if (result4.valid) {
  console.error("Test 4 FAILED: length_of with uint32 target should fail");
  process.exit(1);
}
if (!result4.errors.some(e => e.message.includes("must be array or string"))) {
  console.error("Test 4 FAILED: Expected error about array or string");
  console.error(result4.errors);
  process.exit(1);
}
console.log("✓ Test 4 PASSED: length_of with uint32 target rejected");

// Test 5: Valid crc32_of computed field
const validCrc32Schema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileData: {
      sequence: [
        {
          name: "data",
          type: "array",
          kind: "fixed",
          count: 10,
          items: {
            type: "uint8"
          }
        },
        {
          name: "checksum",
          type: "uint32",
          computed: {
            type: "crc32_of",
            target: "data"
          }
        }
      ]
    }
  }
};

const result5 = validateSchema(validCrc32Schema);
if (!result5.valid) {
  console.error("Test 5 FAILED: Valid crc32_of should pass validation");
  console.error(result5.errors);
  process.exit(1);
}
console.log("✓ Test 5 PASSED: Valid crc32_of computed field");

// Test 6: Invalid - crc32_of with wrong field type (must be uint32)
const invalidCrc32TypeSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileData: {
      sequence: [
        {
          name: "data",
          type: "array",
          kind: "fixed",
          count: 10,
          items: {
            type: "uint8"
          }
        },
        {
          name: "checksum",
          type: "uint16", // Wrong! Must be uint32
          computed: {
            type: "crc32_of",
            target: "data"
          }
        }
      ]
    }
  }
};

const result6 = validateSchema(invalidCrc32TypeSchema);
if (result6.valid) {
  console.error("Test 6 FAILED: crc32_of with uint16 should fail");
  process.exit(1);
}
if (!result6.errors.some(e => e.message.includes("must have type 'uint32'"))) {
  console.error("Test 6 FAILED: Expected error about uint32 type");
  console.error(result6.errors);
  process.exit(1);
}
console.log("✓ Test 6 PASSED: crc32_of with uint16 rejected");

// Test 7: Invalid - crc32_of target is not byte array
const invalidCrc32TargetSchema: BinarySchema = {
  config: {
    endianness: "little_endian"
  },
  types: {
    FileData: {
      sequence: [
        {
          name: "data",
          type: "array",
          kind: "fixed",
          count: 10,
          items: {
            type: "uint16" // Wrong! Must be uint8
          }
        },
        {
          name: "checksum",
          type: "uint32",
          computed: {
            type: "crc32_of",
            target: "data"
          }
        }
      ]
    }
  }
};

const result7 = validateSchema(invalidCrc32TargetSchema);
if (result7.valid) {
  console.error("Test 7 FAILED: crc32_of with uint16 array should fail");
  process.exit(1);
}
if (!result7.errors.some(e => e.message.includes("array of uint8"))) {
  console.error("Test 7 FAILED: Expected error about byte array");
  console.error(result7.errors);
  process.exit(1);
}
console.log("✓ Test 7 PASSED: crc32_of with uint16 array rejected");

console.log("\n✅ All computed field validation tests passed!");
