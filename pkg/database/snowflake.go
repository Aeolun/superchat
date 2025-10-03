package database

import (
	"sync"
	"time"
)

// Snowflake generates unique 64-bit IDs similar to Twitter's Snowflake
// Format: 1 bit (unused) | 41 bits (timestamp) | 10 bits (worker) | 12 bits (sequence)
// - Timestamp: milliseconds since custom epoch (2024-01-01)
// - Worker ID: 0-1023 (for multi-server deployments)
// - Sequence: 0-4095 (up to 4096 IDs per millisecond per worker)
type Snowflake struct {
	mu        sync.Mutex
	epoch     int64  // Custom epoch in milliseconds
	workerID  int64  // Worker/node ID (0-1023)
	sequence  int64  // Sequence number (0-4095)
	lastTime  int64  // Last timestamp in milliseconds
}

const (
	workerIDBits     = 10
	sequenceBits     = 12
	workerIDShift    = sequenceBits
	timestampShift   = sequenceBits + workerIDBits
	sequenceMask     = (1 << sequenceBits) - 1 // 4095
	maxWorkerID      = (1 << workerIDBits) - 1 // 1023
)

// NewSnowflake creates a new Snowflake ID generator
// epoch should be a timestamp in milliseconds (e.g., time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC).UnixMilli())
// workerID should be unique per server instance (0-1023)
func NewSnowflake(epoch int64, workerID int64) *Snowflake {
	if workerID < 0 || workerID > maxWorkerID {
		workerID = 0
	}
	return &Snowflake{
		epoch:    epoch,
		workerID: workerID,
		sequence: 0,
		lastTime: 0,
	}
}

// NextID generates the next unique ID
func (s *Snowflake) NextID() int64 {
	s.mu.Lock()
	defer s.mu.Unlock()

	now := time.Now().UnixMilli()

	// Clock moved backwards
	if now < s.lastTime {
		// Wait until time catches up
		now = s.lastTime
	}

	if now == s.lastTime {
		// Same millisecond - increment sequence
		s.sequence = (s.sequence + 1) & sequenceMask
		if s.sequence == 0 {
			// Sequence exhausted - wait for next millisecond
			for now <= s.lastTime {
				now = time.Now().UnixMilli()
			}
		}
	} else {
		// New millisecond - reset sequence
		s.sequence = 0
	}

	s.lastTime = now

	// Construct the ID: timestamp | workerID | sequence
	id := ((now - s.epoch) << timestampShift) |
		(s.workerID << workerIDShift) |
		s.sequence

	return id
}
