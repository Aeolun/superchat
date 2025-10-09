import { generateTypeScriptCode } from "./src/generators/typescript.js";

const schema = {
  types: {
    "Label": {
      sequence: [
        { name: "length", type: "uint8" },
        { name: "data", type: "array", kind: "fixed", length: 3, items: { type: "uint8" } }
      ]
    },
    "LabelPointer": {
      type: "pointer",
      storage: "uint16",
      offset_mask: "0x3FFF",
      offset_from: "message_start",
      target_type: "Label",
      endianness: "big_endian"
    },
    "DomainName": {
      sequence: [
        { name: "label_or_pointer", type: "LabelPointer" }
      ]
    }
  }
};

console.log(generateTypeScriptCode(schema as any));
