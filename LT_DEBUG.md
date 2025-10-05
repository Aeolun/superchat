# Load Test Debugging Session

**Date:** 2025-10-04
**Issue:** Random disconnections and corrupted frames under load (50+ concurrent clients)

## Symptoms

When running load tests with 50 clients over 10 seconds, we observed:
- Random client disconnections (reported as "connection reset by peer" on server)
- Timeouts waiting for responses (10s timeout with 0.58ms average response time)
- Corrupted frames with invalid message types (`0x00`, `0x01` - not in protocol spec)
- Clients receiving frames claiming to exceed 1MB max size
- Success rate: ~98.9% (15 failures out of 1683 messages)

## Investigation

### Initial Hypotheses (Red Herrings)

1. **Broadcast message handling in loadtest** - Fixed client code to properly skip broadcast messages while waiting for responses (loop with `continue` for TypeNewMessage)
2. **Slow database transactions** - Observed 126ms WriteBuffer flush, suspected it was blocking the server
   - This was a contributing factor (slowing responses) but NOT the root cause of corruption

### Key Diagnostic Steps

1. **Added comprehensive logging:**
   - Client-side connection logging (per-bot with microsecond timestamps)
   - Server-side frame encoding error logging
   - Broadcast failure logging

2. **Analyzed the logs:**
   ```
   [Bot 4] 2025/10/04 11:49:26.527861 Read error: frame exceeds maximum size (1 MB)
   ```
   Client received a corrupted length prefix > 1MB immediately after a successful POST.

3. **Traced the timeline:**
   - Bot sends POST_MESSAGE at `.526541`
   - Server responds MESSAGE_POSTED at `.527856`
   - Next frame read gets corrupted length
   - Client rejects frame → connection reset

## Root Cause

**Race condition on concurrent TCP connection writes**

The server had **two unsynchronized code paths** writing to the same `net.Conn`:

1. **`sendMessage(sess *Session, ...)`** - Direct responses to client requests (handlers.go:367)
2. **`BroadcastToChannel(...)`** - Real-time broadcasts to all clients in channel (session.go:154)

When a broadcast occurred while sending a direct response, frame bytes **interleaved**:

```
Thread A (sendMessage):  Write length=25
Thread B (broadcast):    Write length=150  ← CORRUPTION!
Thread A:                Write version=1
Thread B:                Write version=1
Thread A:                Write type=0x8A
Thread B:                Write type=0x8D
...
```

Result: Client reads corrupted length (e.g., combining bytes from two different frames) and sees "frame exceeds 1MB" or invalid message types like `0x00`/`0x01`.

### Why This Wasn't Caught Earlier

- **Low concurrency**: Single client or small tests don't trigger concurrent writes often
- **Timing-dependent**: Only manifests when a broadcast happens during another write
- **Silent corruption**: TCP doesn't detect application-layer frame corruption

## The Fix

Added write synchronization to the `Session` struct:

```go
// Session represents an active client connection
type Session struct {
    ID            uint64
    DBSessionID   int64
    UserID        *int64
    Nickname      string
    Conn          net.Conn
    JoinedChannel *int64
    mu            sync.RWMutex  // Protects Nickname and JoinedChannel
    writeMu       sync.Mutex    // Protects writes to Conn (prevents frame corruption)
}
```

Protected all `protocol.EncodeFrame()` calls with `writeMu`:

1. **`sendMessage()` in handlers.go:**
   ```go
   sess.writeMu.Lock()
   err = protocol.EncodeFrame(sess.Conn, frame)
   sess.writeMu.Unlock()
   ```

2. **`BroadcastToChannel()` in session.go:**
   ```go
   sess.writeMu.Lock()
   err := protocol.EncodeFrame(sess.Conn, frame)
   sess.writeMu.Unlock()
   ```

3. **`sendServerConfig()` in server.go:**
   ```go
   sess.writeMu.Lock()
   err = protocol.EncodeFrame(sess.Conn, frame)
   sess.writeMu.Unlock()
   ```

## Results

**Before fix:**
- Messages posted: 1379 (137.9/s)
- Messages failed: 15
  - Timeouts: 3
  - Corrupted frames: Multiple
  - Connection resets: 5-6
- Success rate: 98.9%

**After fix:**
- Messages posted: 1625 (162.5/s)
- Messages failed: 0
  - Timeouts: 0
  - Corrupted frames: 0
  - Connection resets: 0
- Success rate: **100.0%**
- Average response time: 10.41ms
- Efficiency: 97.5%

## Further Steps

### Performance Optimizations

1. **Database performance:**
   - 126ms flush for 8 items (5 session updates + 3 message inserts) is slow
   - Consider `PRAGMA synchronous = NORMAL` instead of `FULL` (already set, verify it's working)
   - Profile database queries under load to identify bottlenecks
   - Consider batch sizes and flush intervals in WriteBuffer

2. **Broadcast optimization:**
   - Currently encoding the same message N times (once per recipient)
   - Could encode once and reuse the frame bytes for all recipients
   - Would reduce CPU and lock contention

### Reliability Improvements

1. **Add connection write deadlines:**
   - Prevent slow clients from blocking broadcasts indefinitely
   - Set reasonable write timeout (e.g., 5-10 seconds)

2. **Monitor for write errors:**
   - Track failed broadcast writes
   - Consider disconnecting clients that repeatedly fail writes

3. **Load test coverage:**
   - Add automated load tests to CI (shorter duration, ~5s with 20 clients)
   - Test different scenarios: burst traffic, sustained load, many channels

### Code Quality

1. **Document locking strategy:**
   - Add comments explaining `mu` vs `writeMu` responsibilities
   - Document lock ordering to prevent deadlocks

2. **Audit other shared resources:**
   - Review all uses of `net.Conn` for similar race conditions
   - Check if SSH connection handling has same issue

3. **Consider connection wrapper:**
   - Create a `SafeConn` wrapper with built-in write synchronization
   - Prevents future mistakes with unsynchronized writes

## Lessons Learned

1. **Race conditions are timing-dependent** - They may not appear in light testing but emerge under load
2. **Shared mutable state needs protection** - Even read-only looking operations (frame encoding) can have side effects (network writes)
3. **Detailed logging is essential** - Microsecond-precision logs with per-client prefixes made the race condition visible
4. **Load testing is critical** - This bug would have been catastrophic in production but was caught before V1 release

## Related Files

- `pkg/server/session.go` - Session struct and broadcast logic
- `pkg/server/handlers.go` - sendMessage implementation
- `pkg/server/server.go` - sendServerConfig implementation
- `cmd/loadtest/main.go` - Load testing tool with detailed logging
