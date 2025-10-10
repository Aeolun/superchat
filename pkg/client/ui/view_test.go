package ui

import "testing"

func TestFormatBandwidth(t *testing.T) {
	tests := []struct {
		name        string
		bytesPerSec int
		want        string
	}{
		{
			name:        "14.4k modem",
			bytesPerSec: 1800, // 14400 bits/sec = 1800 bytes/sec
			want:        "14.4k",
		},
		{
			name:        "28.8k modem",
			bytesPerSec: 3600, // 28800 bits/sec = 3600 bytes/sec
			want:        "28.8k",
		},
		{
			name:        "33.6k modem",
			bytesPerSec: 4200, // 33600 bits/sec = 4200 bytes/sec
			want:        "33.6k",
		},
		{
			name:        "56k modem",
			bytesPerSec: 7000, // 56000 bits/sec = 7000 bytes/sec
			want:        "56k",
		},
		{
			name:        "128k ISDN",
			bytesPerSec: 16000, // 128000 bits/sec = 16000 bytes/sec
			want:        "128k",
		},
		{
			name:        "256k DSL",
			bytesPerSec: 32000, // 256000 bits/sec = 32000 bytes/sec
			want:        "256k",
		},
		{
			name:        "512k DSL",
			bytesPerSec: 64000, // 512000 bits/sec = 64000 bytes/sec
			want:        "512k",
		},
		{
			name:        "1Mbps",
			bytesPerSec: 128000, // 1024000 bits/sec = 128000 bytes/sec
			want:        "1Mbps",
		},
		{
			name:        "5Mbps",
			bytesPerSec: 625000, // 5000000 bits/sec = 625000 bytes/sec
			want:        "5.0Mbps",
		},
		{
			name:        "Very slow (below 14.4k)",
			bytesPerSec: 1000, // 8000 bits/sec
			want:        "14.4k",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := formatBandwidth(tt.bytesPerSec)
			if got != tt.want {
				t.Errorf("formatBandwidth(%d) = %q, want %q", tt.bytesPerSec, got, tt.want)
			}
		})
	}
}
