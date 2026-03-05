# TODO

## Web Client / TUI Parity Gaps

### Missing Features

- [ ] **Admin panel** — TUI has full admin panel (ban/unban users, ban/unban IPs, delete users, view ban list). Web client has no admin UI.
- [x] **Go Anonymous** — Ctrl+A disconnects and reconnects as anonymous.
- [x] **Nickname change** — Ctrl+N opens change nickname modal.
- [x] **Password change** — Ctrl+P opens change password modal.
- [x] **Subchannel support** — TUI supports creating/browsing subchannels under parent channels.
- [ ] **Unread counts (channels)** — TUI shows per-channel unread message badges. Web client only tracks unread for DMs.
- [ ] **Message edit history** — TUI exposes edit versioning for moderation. Not exposed in web client.
- [ ] **Desktop notifications** — TUI has sound/notification when user is idle. Not implemented in web client.
- [ ] **Command palette** — TUI has `/` or `:` searchable command list. Not implemented in web client.
- [ ] **Auto-reconnect** — TUI has exponential backoff reconnection. Not implemented in web client.
- [ ] **Refresh actions** — TUI has manual refresh of channels/threads (`r` key). Not implemented in web client.
- [ ] **Sign in flow** — TUI has explicit Ctrl+S sign-in when nickname is registered. Web client has password modal but no dedicated sign-in trigger.
- [ ] **User info queries** — TUI can check if a nickname is registered. Not exposed as an action in web client.

### Deliberately Skipped (not applicable to browser)

- [x] ~~**SSH key authentication** — Terminal-native feature, browsers can't safely access private keys.~~
- [x] ~~**SSH key management** — Add/delete/relabel SSH keys (Ctrl+K). Not applicable without SSH auth.~~
- [x] ~~**SSH connection method** — Browser uses WebSocket, not SSH.~~
- [x] ~~**Client config file** — TUI uses `client-config.toml`. Web client uses localStorage/UI.~~
