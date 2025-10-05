package database

import (
	"sync/atomic"
	"time"
)

// Snowflake generates unique 64-bit IDs similar to Twitter's Snowflake
// Format: 1 bit (unused) | 41 bits (timestamp) | 10 bits (worker) | 12 bits (sequence)
// - Timestamp: milliseconds since custom epoch (2024-01-01)
// - Worker ID: 0-1023 (for multi-server deployments)
// - Sequence: 0-4095 (up to 4096 IDs per millisecond per worker)
type Snowflake struct {
	epoch    int64 // Custom epoch in milliseconds
	workerID int64 // Worker/node ID (0-1023)
	state    int64 // Atomic state: upper 52 bits = timestamp, lower 12 bits = sequence
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
		state:    0,
	}
}

// NextID generates the next unique ID using lock-free atomic operations
func (s *Snowflake) NextID() int64 {
	for {
		// Load current state atomically
		oldState := atomic.LoadInt64(&s.state)
		lastTime := oldState >> sequenceBits
		sequence := oldState & sequenceMask

		// Get current timestamp
		now := time.Now().UnixMilli()

		var newSequence int64
		var newTime int64

		if now == lastTime {
			// Same millisecond - increment sequence
			newSequence = (sequence + 1) & sequenceMask
			if newSequence == 0 {
				// Sequence exhausted - wait for next millisecond
				for time.Now().UnixMilli() <= lastTime {
					// Busy wait (should be very rare - only if >4096 IDs/ms)
				}
				now = time.Now().UnixMilli()
				newTime = now
				newSequence = 0
			} else {
				newTime = lastTime
			}
		} else if now > lastTime {
			// New millisecond - reset sequence
			newTime = now
			newSequence = 0
		} else {
			// Clock moved backwards - use last known time and increment sequence
			newTime = lastTime
			newSequence = (sequence + 1) & sequenceMask
			if newSequence == 0 {
				// Sequence exhausted - wait for time to catch up
				for time.Now().UnixMilli() < lastTime {
					// Wait for clock to catch up
				}
				now = time.Now().UnixMilli()
				newTime = now
				newSequence = 0
			}
		}

		// Pack new state
		newState := (newTime << sequenceBits) | newSequence

		// Try to update state atomically
		if atomic.CompareAndSwapInt64(&s.state, oldState, newState) {
			// Success - construct and return the ID
			id := ((newTime - s.epoch) << timestampShift) |
				(s.workerID << workerIDShift) |
				newSequence
			return id
		}

		// CAS failed - another goroutine updated state, retry
	}
}
