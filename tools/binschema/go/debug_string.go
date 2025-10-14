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
			"ShortStringValue": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name":        "value",
						"type":        "string",
						"kind":        "length_prefixed",
						"length_type": "uint8",
						"encoding":    "utf8",
					},
				},
			},
		},
	}

	code, err := codegen.GenerateGo(schema, "ShortStringValue")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(code)
}
