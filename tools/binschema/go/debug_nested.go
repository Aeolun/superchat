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
			"Point": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name": "x",
						"type": "uint16",
					},
					map[string]interface{}{
						"name": "y",
						"type": "uint16",
					},
				},
			},
			"Rectangle": map[string]interface{}{
				"sequence": []interface{}{
					map[string]interface{}{
						"name": "top_left",
						"type": "Point",
					},
					map[string]interface{}{
						"name": "bottom_right",
						"type": "Point",
					},
				},
			},
		},
	}

	code, err := codegen.GenerateGo(schema, "Rectangle")
	if err != nil {
		log.Fatal(err)
	}

	fmt.Println(code)
}
