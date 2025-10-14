package main

import (
	"fmt"
	"log"

	"github.com/anthropics/binschema/codegen"
)

func main() {
	schema := map[string]interface{}{
		"config": map[string]interface{}{
			"endianness": "big_endian",
		},
		"types": map[string]interface{}{
			"ByteArray": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name":        "values",
						"type":        "array",
						"kind":        "length_prefixed",
						"length_type": "uint8",
						"items": map[string]interface{}{
							"type": "uint8",
						},
					},
				},
			},
		},
	}

	code, err := codegen.GenerateGo(schema, "ByteArray")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(code)
}
