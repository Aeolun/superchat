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
			"EmptyUint16Array": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name": "data",
						"type": "array",
						"kind": "length_prefixed",
						"items": map[string]interface{}{
							"type": "uint8",
						},
						"length_type": "uint16",
					},
				},
			},
		},
	}

	code, err := codegen.GenerateGo(schema, "EmptyUint16Array")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(code)
}
