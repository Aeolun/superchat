# Subscription-Based Message Broadcasting

**Status:** ✅ IMPLEMENTED - This is a historical design document

**Implementation:** The subscription system is fully implemented as of V1. See:
- Protocol messages: `pkg/protocol/messages.go` (0x51-0x54, 0x99)
- Server handlers: `pkg/server/handlers.go` (`handleSubscribeThread`, `handleSubscribeChannel`)
- Client implementation: `pkg/client/ui/update.go` (subscription management)

---

## Original Problem Statement (Historical)

Currently, the server broadcasts NEW_MESSAGE events to all clients in a channel, regardless of whether they care about those specific messages. With 2000 concurrent clients, this causes:
- High response latency (~978ms vs 11ms with 500 clients)
- Wasted bandwidth sending messages clients don't need
- Clients receiving broadcasts while waiting for POST responses

## Proposed Solution

Implement explicit subscription model where clients subscribe to specific threads or channels they're actively viewing.

### Protocol Messages

**Client → Server:**

```
SUBSCRIBE_THREAD (0x51)
  thread_id: uint64     // Root message ID of thread to subscribe to

UNSUBSCRIBE_THREAD (0x52)
  thread_id: uint64

SUBSCRIBE_CHANNEL (0x53)
  channel_id: uint64
  subchannel_id: Optional uint64  // If present, subscribe to subchannel

UNSUBSCRIBE_CHANNEL (0x54)
  channel_id: uint64
  subchannel_id: Optional uint64
```

**Server → Client:**

```
SUBSCRIBE_OK (0x99)
  type: uint8           // 1=thread, 2=channel
  id: uint64           // thread_id or channel_id
  subchannel_id: Optional uint64  // Present if subscribing to subchannel
```

**Error Responses** (reuses existing ERROR 0x91):
```
ERROR (0x91)
  error_code: uint32
  error_message: string

Error codes for subscriptions:
  4001: Thread does not exist
  4004: Channel/subchannel does not exist
  5004: Thread subscription limit exceeded (max 50 per session)
  5005: Channel subscription limit exceeded (max 10 per session)
```

### Session State Changes

Add to `Session` struct:
```go
type ChannelSubscription struct {
    ChannelID    uint64
    SubchannelID *uint64  // nil for main channel
}

type Session struct {
    // ... existing fields ...

    // Subscriptions
    subscribedThreads  map[uint64]bool              // thread_id -> true
    subscribedChannels map[ChannelSubscription]bool // channel/subchannel -> true
    subMu             sync.RWMutex                  // protects subscription maps
}
```

### Broadcast Logic Changes

**Current:**
```go
func (sm *SessionManager) BroadcastToChannel(channelID int64, frame *protocol.Frame) {
    for _, sess := range sm.sessions {
        if sess.JoinedChannel == channelID {
            sess.Conn.EncodeFrame(frame)
        }
    }
}
```

**Proposed (with encode-once optimization):**
```go
func (sm *SessionManager) BroadcastNewMessage(msg *protocol.NewMessageMessage) error {
    // Determine if this is a top-level thread or a reply
    isTopLevel := msg.ParentID == nil || !*msg.ParentID
    threadRootID := msg.ThreadRootID  // Client provides this in POST_MESSAGE

    // Encode frame ONCE (not per-recipient)
    var buf bytes.Buffer
    frame := &protocol.Frame{
        Version: protocol.ProtocolVersion,
        Type:    protocol.TypeNewMessage,
        Flags:   0,
        Payload: msg,
    }
    if err := protocol.EncodeFrame(&buf, frame); err != nil {
        return err
    }
    frameBytes := buf.Bytes()

    // Build channel subscription key
    channelSub := ChannelSubscription{
        ChannelID:    msg.ChannelID,
        SubchannelID: msg.SubchannelID,
    }

    // Broadcast to subscribers only
    sm.mu.RLock()
    defer sm.mu.RUnlock()

    for _, sess := range sm.sessions {
        sess.subMu.RLock()
        shouldSend := false

        if isTopLevel {
            // Top-level: send to channel subscribers
            shouldSend = sess.subscribedChannels[channelSub]
        } else {
            // Reply: send to thread subscribers
            shouldSend = sess.subscribedThreads[threadRootID]
        }
        sess.subMu.RUnlock()

        if shouldSend {
            // Write pre-encoded bytes (no re-encoding)
            sess.Conn.writeMu.Lock()
            sess.Conn.Write(frameBytes)
            sess.Conn.writeMu.Unlock()
        }
    }

    return nil
}
```

### Client Behavior Changes

**Channel List View:**
- No subscriptions active (just shows channels, no messages)

**Thread List View:**
- `SUBSCRIBE_CHANNEL <channel_id>` when entering view
- `UNSUBSCRIBE_CHANNEL <channel_id>` when leaving view
- Receives NEW_MESSAGE for new top-level threads only

**Thread View:**
- `SUBSCRIBE_THREAD <thread_id>` when entering thread
- `UNSUBSCRIBE_THREAD <thread_id>` when leaving thread
- Receives NEW_MESSAGE for all replies in that thread

**Message Composition:**
- Keep existing subscriptions active
- Client buffers incoming NEW_MESSAGE events (already does this)

### Backward Compatibility

**V1 Implementation:**
- These are new message types (0x51-0x54, 0x99)
- Reuses existing ERROR (0x91) with new error codes
- Can be added incrementally without breaking existing clients
- Add subscription support in V1 Phase 2 (after core stability)

**Migration Path:**
1. Add protocol message definitions (SUBSCRIBE_*, SUBSCRIBE_OK)
2. Update POST_MESSAGE to include thread_root_id field
3. Add session subscription tracking (ChannelSubscription struct, maps, locks)
4. Implement SUBSCRIBE/UNSUBSCRIBE handlers with validation
5. Update broadcast logic to check subscriptions and use encode-once
6. Update client to send subscribe/unsubscribe messages
7. Update client to provide thread_root_id when posting replies
8. Test under load (expect <50ms at 2000 clients)

### Error Cases

**ERROR (0x91) codes for subscriptions:**
- `4001`: Thread does not exist (validated on SUBSCRIBE_THREAD)
- `4004`: Channel/subchannel does not exist (validated on SUBSCRIBE_CHANNEL)
- `5004`: Thread subscription limit exceeded (max 50 per session)
- `5005`: Channel subscription limit exceeded (max 10 per session)

**Note:** Duplicate subscriptions are idempotent (return SUBSCRIBE_OK, no error).

**Subscription Limits:**
- Max 50 thread subscriptions per session
- Max 10 channel subscriptions per session
- Automatically clean up on session disconnect

### Performance Expectations

**With 2000 clients:**
- Assume 50 channels, ~40 clients per channel
- If viewing thread list: ~40 subscribers per channel (vs 2000 previously)
- If viewing specific thread: ~5-10 subscribers per thread on average
- **Expected improvement:** 20-50x reduction in broadcast fan-out

**Latency improvement:**
- Current: 978ms average response time
- Expected: <50ms (closer to 500-client performance of 11ms)

### Design Decisions

1. **JOIN_CHANNEL does NOT auto-subscribe**
   - Subscriptions are explicit - client must send SUBSCRIBE_CHANNEL after joining
   - Prevents unwanted broadcasts before user navigates to thread list
   - Single round-trip cost (<1ms) is negligible

2. **Disconnect/reconnect behavior**
   - All subscriptions cleared on disconnect
   - Client tracks active subscriptions in local state
   - On reconnect: client re-joins channel and re-subscribes as needed

3. **No batch operations (for now)**
   - Users typically view one thread at a time
   - Can add SUBSCRIBE_BATCH in V2 if profiling shows need
   - YAGNI - avoid premature optimization

4. **Thread root resolution: Client provides thread_root_id**
   - Client knows the thread root (fetched when entering thread view)
   - POST_MESSAGE includes thread_root_id field for replies
   - Avoids database lookup in server's critical broadcast path
   - For top-level messages, thread_root_id = message_id (self-referential)

5. **No server-initiated unsubscribe on thread deletion**
   - Existing MESSAGE_DELETED (0x8C) broadcasts deletions
   - Client receives deletion, removes thread from UI, implicitly unsubscribes
   - Stale subscriptions in server are harmless (no messages will match)

## Implementation Summary

**Technical Review: APPROVED with modifications** (all critical issues addressed in this spec)

**Recommendation:** Implement in **V1 Phase 2** (after core stability, before public launch)

**Priority:** High (20-50x performance improvement at scale)

**Risk:** Low (additive change, no breaking changes, rollback available)

**Effort:** ~8 hours (protocol + server + client + testing)

**Critical Fixes Applied:**
- ✅ Client provides thread_root_id in POST_MESSAGE (avoids thread hierarchy bug)
- ✅ Message type changed to 0x99 for SUBSCRIBE_OK (avoids conflict with ERROR 0x91)
- ✅ Error codes use 4xxx/5xxx ranges (avoids conflicts with existing 1xxx codes)
- ✅ Added subchannel support (ChannelSubscription struct)
- ✅ Encode-once optimization (encode frame once, write N times)
- ✅ Subscription validation on subscribe (check thread/channel exists)
- ✅ Idempotent duplicate subscriptions (no error)

**Expected Performance:**
- Current (2000 clients): 978ms average response time
- With subscriptions: <50ms average response time
- At 10k clients: bottleneck shifts to database (good!)
