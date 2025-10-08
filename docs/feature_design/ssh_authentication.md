# SSH Key Authentication Implementation Plan

**Status:** ✅ MOSTLY COMPLETE - This is a historical design document

**Implementation:** SSH authentication is fully implemented with only minor TODOs:
- ✅ All 8 implementation phases complete (see SSH_IMPLEMENTATION_STATUS.md for phase details)
- ✅ Database schema (migration 005_add_ssh_keys.sql)
- ✅ Server-side authentication with auto-registration
- ✅ SSH key management UI (add/list/delete/rename)
- ⚠️ Minor TODOs remaining:
  - Auto-registration rate limiting (placeholder implementation at `pkg/server/ssh.go:457`)
  - Encrypted key passphrase support for direct disk loading (SSH agent already handles this)

**See:** `docs/versions/V2.md` for V2 feature summary

---

## Overview (Historical)

This document outlines the complete implementation plan for SSH key authentication in SuperChat V2.

---

## Implementation Status (Historical Reference)

✅ **What's Working:**
- SSH server infrastructure fully built (`pkg/server/ssh.go`)
- Host key generation and loading
- Binary protocol over SSH channels (same as TCP)
- Session management for SSH connections

❌ **What's Missing:**
- Line 38 in `ssh.go`: `NoClientAuth: true` - currently allows anonymous connections
- No SSHKey table to store user public keys
- No auto-registration flow
- No client-side SSH key management UI
- No password change functionality (needed for SSH-registered users)
- No server directory/discovery system

---

## Architecture Overview

```
┌─────────────┐                    ┌──────────────┐
│   Client    │──── SSH + Key ───▶ │    Server    │
│   (ssh)     │                    │  Port 2222   │
└─────────────┘                    └──────┬───────┘
                                          │
                                          ▼
                                   ┌──────────────┐
                                   │ SSHKey Table │
                                   │ - fingerprint│
                                   │ - public_key │
                                   │ - user_id    │
                                   └──────────────┘
```

---

## Implementation Phases

### Phase 1: Database Schema (Migration 004)

**File:** `pkg/database/migrations/004_add_ssh_keys.sql`

```sql
-- @foreign_keys=on

CREATE TABLE IF NOT EXISTS SSHKey (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL,
  fingerprint TEXT UNIQUE NOT NULL,     -- SHA256:base64 format
  public_key TEXT NOT NULL,              -- Actual SSH public key (authorized_keys format)
  key_type TEXT NOT NULL,                -- 'ssh-rsa', 'ssh-ed25519', 'ecdsa-sha2-nistp256'
  label TEXT,                            -- User-friendly name (e.g., "laptop", "work")
  added_at INTEGER NOT NULL,
  last_used_at INTEGER,
  FOREIGN KEY (user_id) REFERENCES User(id) ON DELETE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_ssh_fingerprint ON SSHKey(fingerprint);
CREATE INDEX IF NOT EXISTS idx_ssh_user ON SSHKey(user_id);
```

**Add to `pkg/database/database.go`:**

```go
type SSHKey struct {
    ID          uint64
    UserID      uint64
    Fingerprint string // SHA256:base64 format
    PublicKey   string // Full authorized_keys format
    KeyType     string // ssh-rsa, ssh-ed25519, etc.
    Label       string // Optional user-friendly name
    AddedAt     int64
    LastUsedAt  *int64
}

// SSHKey CRUD operations
func (db *Database) CreateSSHKey(key *SSHKey) error
func (db *Database) GetSSHKeyByFingerprint(fingerprint string) (*SSHKey, error)
func (db *Database) GetSSHKeysByUserID(userID uint64) ([]SSHKey, error)
func (db *Database) DeleteSSHKey(keyID uint64, userID uint64) error
func (db *Database) UpdateSSHKeyLastUsed(fingerprint string) error
func (db *Database) UpdateSSHKeyLabel(keyID uint64, userID uint64, label string) error
```

**Migration test requirements:**
- Test schema creation
- Test FK constraint (delete user → cascade delete keys)
- Test unique fingerprint constraint
- Test indexes

---

### Phase 2: Password Management

Before implementing SSH auth, we need password change functionality for SSH-registered users.

**New Protocol Messages:**

**CHANGE_PASSWORD (0x0E) - Client → Server**
```
[old_password: string]  // Empty for SSH-registered users changing for first time
[new_password: string]
```

**PASSWORD_CHANGED (0x8E) - Server → Client**
```
[success: bool]
[error_message: string] (if failure)
```

**Add to `pkg/server/handlers.go`:**

```go
func (s *Server) handleChangePassword(sess *Session, payload []byte) error {
    // Parse request
    oldPassword, newPassword := parseChangePasswordRequest(payload)

    // Must be authenticated
    if sess.UserID == nil {
        return s.sendError(sess, 1003, "Must be authenticated to change password")
    }

    // Get user
    user, err := s.db.GetUserByID(*sess.UserID)
    if err != nil {
        return s.sendError(sess, 9000, "User not found")
    }

    // Verify old password (skip if user has SSH-generated password and this is first change)
    if user.PasswordHash != "" {
        if !verifyPassword(user.PasswordHash, oldPassword) {
            return s.sendError(sess, 1004, "Incorrect password")
        }
    }

    // Validate new password (min 8 chars, etc.)
    if len(newPassword) < 8 {
        return s.sendError(sess, 1005, "Password must be at least 8 characters")
    }

    // Update password
    newHash, err := bcrypt.GenerateFromPassword([]byte(newPassword), bcrypt.DefaultCost)
    if err != nil {
        return s.sendError(sess, 9000, "Failed to hash password")
    }

    if err := s.db.UpdateUserPassword(*sess.UserID, string(newHash)); err != nil {
        return s.sendError(sess, 9000, "Failed to update password")
    }

    // Send success
    return s.sendPasswordChanged(sess, true, "")
}
```

**Client UI:**
- Add `[Ctrl+P] Change Password` to authenticated user commands
- Modal with old password + new password + confirm fields
- Skip old password field if user was SSH-registered (check via flag or empty initial password)

---

### Phase 3: Server-Side SSH Authentication

**Update `pkg/server/ssh.go` line 36-39:**

```go
// Configure SSH server with public key authentication
config := &ssh.ServerConfig{
    PublicKeyCallback: s.authenticateSSHKey,
    ServerVersion:     "SSH-2.0-SuperChat",
}
config.AddHostKey(hostKey)
```

**Add authentication method:**

```go
// authenticateSSHKey validates SSH public keys and auto-registers new users
func (s *Server) authenticateSSHKey(conn ssh.ConnMetadata, pubKey ssh.PublicKey) (*ssh.Permissions, error) {
    // Compute fingerprint (SHA256 format like OpenSSH)
    fingerprint := ssh.FingerprintSHA256(pubKey)

    // Look up key in database
    sshKey, err := s.db.GetSSHKeyByFingerprint(fingerprint)
    if err == nil {
        // Known key - authenticate as existing user
        user, err := s.db.GetUserByID(sshKey.UserID)
        if err != nil {
            return nil, fmt.Errorf("user not found for SSH key")
        }

        // Update last used timestamp
        s.db.UpdateSSHKeyLastUsed(fingerprint)

        log.Printf("SSH auth: user %s (fingerprint: %s)", user.Nickname, fingerprint)

        // Return permissions with user info
        return &ssh.Permissions{
            Extensions: map[string]string{
                "user_id":   fmt.Sprintf("%d", user.ID),
                "nickname":  user.Nickname,
                "pubkey_fp": fingerprint,
            },
        }, nil
    }

    // Unknown key - auto-register new user
    username := conn.User() // From ssh username@host
    if username == "" {
        username = "user" // Fallback
    }

    // Check rate limiting (max 10 auto-registers per hour from same IP)
    if !s.checkAutoRegisterRateLimit(conn.RemoteAddr()) {
        return nil, fmt.Errorf("auto-registration rate limit exceeded")
    }

    // Create new user with random password (user can change later)
    randomPassword := generateSecureRandomPassword(32)
    user, err := s.db.CreateUser(username, randomPassword, 0)
    if err != nil {
        return nil, fmt.Errorf("failed to auto-register user: %w", err)
    }

    // Store SSH key
    sshKey := &database.SSHKey{
        UserID:      user.ID,
        Fingerprint: fingerprint,
        PublicKey:   string(ssh.MarshalAuthorizedKey(pubKey)),
        KeyType:     pubKey.Type(),
        Label:       "Auto-registered",
        AddedAt:     time.Now().UnixMilli(),
    }
    if err := s.db.CreateSSHKey(sshKey); err != nil {
        // Rollback user creation
        s.db.DeleteUser(user.ID)
        return nil, fmt.Errorf("failed to store SSH key: %w", err)
    }

    log.Printf("Auto-registered new user %s via SSH (fingerprint: %s)", username, fingerprint)

    return &ssh.Permissions{
        Extensions: map[string]string{
            "user_id":   fmt.Sprintf("%d", user.ID),
            "nickname":  user.Nickname,
            "pubkey_fp": fingerprint,
        },
    }, nil
}

func generateSecureRandomPassword(length int) string {
    const charset = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*"
    b := make([]byte, length)
    if _, err := rand.Read(b); err != nil {
        panic(err)
    }
    for i := range b {
        b[i] = charset[int(b[i])%len(charset)]
    }
    return string(b)
}

func (s *Server) checkAutoRegisterRateLimit(addr net.Addr) bool {
    // TODO: Implement rate limiting (in-memory map with cleanup goroutine)
    // Track: IP → [timestamp, timestamp, ...] (last 10 registrations)
    // Allow if < 10 registrations in last hour
    return true // For now
}
```

**Update `handleSSHConnection` to pass permissions:**

```go
func (s *Server) handleSSHConnection(conn net.Conn, config *ssh.ServerConfig) {
    // ... existing handshake code ...

    // Handle incoming channels with permissions
    for newChannel := range chans {
        if newChannel.ChannelType() != "session" {
            newChannel.Reject(ssh.UnknownChannelType, "unknown channel type")
            continue
        }

        channel, requests, err := newChannel.Accept()
        if err != nil {
            log.Printf("Could not accept channel: %v", err)
            continue
        }

        s.wg.Add(1)
        go func() {
            defer s.wg.Done()
            go s.handleSSHChannelRequests(requests)
            // Pass permissions to session handler
            s.handleSSHSession(channel, sshConn.Permissions)
        }()
    }
}
```

**Update `handleSSHSession`:**

```go
func (s *Server) handleSSHSession(channel ssh.Channel, permissions *ssh.Permissions) {
    defer channel.Close()

    conn := &sshChannelConn{channel: channel}

    // Extract authenticated user info from SSH permissions
    var userID *uint64
    var nickname string
    if permissions != nil {
        if uidStr := permissions.Extensions["user_id"]; uidStr != "" {
            uid, _ := strconv.ParseUint(uidStr, 10, 64)
            userID = &uid
        }
        nickname = permissions.Extensions["nickname"]
    }

    // Create authenticated session
    sess, err := s.sessions.CreateSession(userID, nickname, "ssh", conn)
    if err != nil {
        log.Printf("Failed to create SSH session: %v", err)
        return
    }
    defer s.sessions.RemoveSession(sess.ID)

    s.connectionsSinceReport.Add(1)
    debugLog.Printf("New SSH connection: user=%s (session %d)", nickname, sess.ID)

    // Send SERVER_CONFIG
    if err := s.sendServerConfig(sess); err != nil {
        return
    }

    // Automatically send AUTH_RESPONSE for SSH-authenticated users
    if userID != nil {
        user, _ := s.db.GetUserByID(*userID)
        s.sendAuthResponse(sess, true, *userID, nickname, user.UserFlags)
    }

    // ... existing message loop ...
}
```

---

### Phase 4: SSH Key Management Protocol Messages

**ADD_SSH_KEY (0x0C) - Client → Server**
```
[public_key: string]  // Full SSH public key (authorized_keys format)
[label: string]       // User-friendly label (optional, can be empty)
```

**SSH_KEY_ADDED (0x8C) - Server → Client**
```
[success: bool]
[fingerprint: string] (if success - so client can display it)
[error_message: string] (if failure)
```

**LIST_SSH_KEYS (0x16) - Client → Server**
```
(no payload - lists current user's keys)
```

**SSH_KEY_LIST (0x98) - Server → Client**
```
[count: uint32]
For each key:
  [key_id: uint64]
  [fingerprint: string]
  [key_type: string]
  [label: string]
  [added_at: timestamp]
  [last_used_at: optional timestamp]
```

**UPDATE_SSH_KEY_LABEL (0x0F) - Client → Server**
```
[key_id: uint64]
[new_label: string]
```

**SSH_KEY_LABEL_UPDATED (0x8F) - Server → Client**
```
[success: bool]
[error_message: string] (if failure)
```

**DELETE_SSH_KEY (0x0D) - Client → Server**
```
[key_id: uint64]
```

**SSH_KEY_DELETED (0x8D) - Server → Client**
```
[success: bool]
[error_message: string] (if failure)
```

**Add handlers to `pkg/server/handlers.go`:**

```go
func (s *Server) handleAddSSHKey(sess *Session, payload []byte) error {
    // Must be authenticated
    if sess.UserID == nil {
        return s.sendError(sess, 1003, "Must be authenticated to add SSH keys")
    }

    // Parse public key
    publicKey, label := parseAddSSHKeyRequest(payload)

    // Parse and validate SSH public key format
    parsedKey, _, _, _, err := ssh.ParseAuthorizedKey([]byte(publicKey))
    if err != nil {
        return s.sendSSHKeyAdded(sess, false, "", "Invalid SSH public key format")
    }

    // Compute fingerprint
    fingerprint := ssh.FingerprintSHA256(parsedKey)

    // Check if key already exists
    existing, _ := s.db.GetSSHKeyByFingerprint(fingerprint)
    if existing != nil {
        if existing.UserID == *sess.UserID {
            return s.sendSSHKeyAdded(sess, false, "", "You already added this key")
        }
        return s.sendSSHKeyAdded(sess, false, "", "This key is already registered to another user")
    }

    // Store key
    sshKey := &database.SSHKey{
        UserID:      *sess.UserID,
        Fingerprint: fingerprint,
        PublicKey:   publicKey,
        KeyType:     parsedKey.Type(),
        Label:       label,
        AddedAt:     time.Now().UnixMilli(),
    }

    if err := s.db.CreateSSHKey(sshKey); err != nil {
        return s.sendSSHKeyAdded(sess, false, "", "Failed to store key")
    }

    log.Printf("User %s added SSH key: %s", sess.Nickname, fingerprint)
    return s.sendSSHKeyAdded(sess, true, fingerprint, "")
}

func (s *Server) handleListSSHKeys(sess *Session, payload []byte) error {
    if sess.UserID == nil {
        return s.sendError(sess, 1003, "Must be authenticated")
    }

    keys, err := s.db.GetSSHKeysByUserID(*sess.UserID)
    if err != nil {
        return s.sendError(sess, 9000, "Failed to fetch keys")
    }

    return s.sendSSHKeyList(sess, keys)
}

func (s *Server) handleUpdateSSHKeyLabel(sess *Session, payload []byte) error {
    if sess.UserID == nil {
        return s.sendError(sess, 1003, "Must be authenticated")
    }

    keyID, newLabel := parseUpdateSSHKeyLabelRequest(payload)

    if err := s.db.UpdateSSHKeyLabel(keyID, *sess.UserID, newLabel); err != nil {
        return s.sendSSHKeyLabelUpdated(sess, false, "Failed to update label")
    }

    return s.sendSSHKeyLabelUpdated(sess, true, "")
}

func (s *Server) handleDeleteSSHKey(sess *Session, payload []byte) error {
    if sess.UserID == nil {
        return s.sendError(sess, 1003, "Must be authenticated")
    }

    keyID := parseDeleteSSHKeyRequest(payload)

    // Check if user has other keys or a password
    keys, _ := s.db.GetSSHKeysByUserID(*sess.UserID)
    user, _ := s.db.GetUserByID(*sess.UserID)

    if len(keys) == 1 && user.PasswordHash == "" {
        return s.sendSSHKeyDeleted(sess, false, "Cannot delete last SSH key without setting a password first")
    }

    if err := s.db.DeleteSSHKey(keyID, *sess.UserID); err != nil {
        return s.sendSSHKeyDeleted(sess, false, "Failed to delete key")
    }

    return s.sendSSHKeyDeleted(sess, true, "")
}
```

---

### Phase 5: Client-Side SSH Connection

**Update `pkg/client/connection.go`:**

```go
type ConnectionType int

const (
    ConnectionTCP ConnectionType = iota
    ConnectionSSH
)

func Connect(address string, port int, connType ConnectionType) (net.Conn, error) {
    switch connType {
    case ConnectionSSH:
        return ConnectSSH(address, port)
    case ConnectionTCP:
        return ConnectTCP(address, port)
    default:
        return nil, fmt.Errorf("unknown connection type")
    }
}

func ConnectSSH(address string, port int) (net.Conn, error) {
    // Find SSH keys in standard locations
    homeDir, _ := os.UserHomeDir()
    keyPaths := []string{
        filepath.Join(homeDir, ".ssh", "id_ed25519"),
        filepath.Join(homeDir, ".ssh", "id_rsa"),
        filepath.Join(homeDir, ".ssh", "id_ecdsa"),
    }

    var signers []ssh.Signer
    for _, keyPath := range keyPaths {
        if key, err := loadPrivateKey(keyPath); err == nil {
            signers = append(signers, key)
        }
    }

    if len(signers) == 0 {
        return nil, fmt.Errorf("no SSH keys found in ~/.ssh/")
    }

    config := &ssh.ClientConfig{
        User: os.Getenv("USER"), // Unix username
        Auth: []ssh.AuthMethod{
            ssh.PublicKeys(signers...),
        },
        HostKeyCallback: ssh.InsecureIgnoreHostKey(), // TODO: TOFU (Trust On First Use)
        Timeout:         10 * time.Second,
    }

    addr := fmt.Sprintf("%s:%d", address, port)
    client, err := ssh.Dial("tcp", addr, config)
    if err != nil {
        return nil, fmt.Errorf("SSH dial failed: %w", err)
    }

    // Open a session channel
    session, err := client.NewSession()
    if err != nil {
        client.Close()
        return nil, fmt.Errorf("failed to create SSH session: %w", err)
    }

    // Get stdin/stdout pipes
    stdin, err := session.StdinPipe()
    if err != nil {
        session.Close()
        client.Close()
        return nil, err
    }

    stdout, err := session.StdoutPipe()
    if err != nil {
        session.Close()
        client.Close()
        return nil, err
    }

    // Start shell (server expects this)
    if err := session.Shell(); err != nil {
        session.Close()
        client.Close()
        return nil, err
    }

    // Return a connection wrapper
    return &sshConnection{
        client:  client,
        session: session,
        stdin:   stdin,
        stdout:  stdout,
    }, nil
}

func loadPrivateKey(path string) (ssh.Signer, error) {
    keyBytes, err := os.ReadFile(path)
    if err != nil {
        return nil, err
    }

    // Try without passphrase first
    signer, err := ssh.ParsePrivateKey(keyBytes)
    if err == nil {
        return signer, nil
    }

    // TODO: Prompt for passphrase if key is encrypted
    return nil, fmt.Errorf("encrypted keys not yet supported")
}

type sshConnection struct {
    client  *ssh.Client
    session *ssh.Session
    stdin   io.WriteCloser
    stdout  io.Reader
}

func (c *sshConnection) Read(b []byte) (int, error) {
    return c.stdout.Read(b)
}

func (c *sshConnection) Write(b []byte) (int, error) {
    return c.stdin.Write(b)
}

func (c *sshConnection) Close() error {
    c.session.Close()
    return c.client.Close()
}

// Implement remaining net.Conn methods...
```

---

### Phase 6: Client UI - SSH Key Manager Modal

**File:** `pkg/client/ui/modal/ssh_key_manager.go`

```go
type SSHKeyManagerModal struct {
    keys       []SSHKeyInfo
    cursor     int
    width      int
    height     int
    showAddKey bool
    newKeyPath string
    newKeyLabel string
}

type SSHKeyInfo struct {
    ID          uint64
    Fingerprint string
    KeyType     string
    Label       string
    AddedAt     time.Time
    LastUsedAt  *time.Time
}

func (m *SSHKeyManagerModal) Render(width, height int) string {
    if m.showAddKey {
        return m.renderAddKeyForm(width, height)
    }
    return m.renderKeyList(width, height)
}

func (m *SSHKeyManagerModal) renderKeyList(width, height int) string {
    // Title: "SSH Keys"
    // List of keys with:
    //   - Fingerprint (truncated)
    //   - Label
    //   - Last used
    // Actions:
    //   [a] Add new key
    //   [r] Rename label
    //   [d] Delete key
    //   [Esc] Close
}

func (m *SSHKeyManagerModal) renderAddKeyForm(width, height int) string {
    // File picker for ~/.ssh/*.pub files
    // OR text input for pasting public key
    // Label input field
    // [Enter] Add, [Esc] Cancel
}

func (m *SSHKeyManagerModal) Update(msg tea.Msg) (Modal, tea.Cmd) {
    switch msg := msg.(type) {
    case tea.KeyMsg:
        if m.showAddKey {
            // Handle add key form
        } else {
            switch msg.String() {
            case "a":
                m.showAddKey = true
            case "d":
                // Confirm and send DELETE_SSH_KEY
            case "r":
                // Prompt for new label, send UPDATE_SSH_KEY_LABEL
            }
        }
    }
    return m, nil
}
```

**Add to command registry:**
- `[Ctrl+K]` Open SSH Key Manager (when authenticated)

---

### Phase 7: Connection Flow & Server Discovery

**Current behavior:** Client connects to default server or `--server` flag

**New behavior:**

1. **Server URL Formats:**
   - `tcp://host:port` - TCP connection
   - `ssh://host:port` - SSH connection
   - `host:port` - Defaults to TCP
   - `host` - Uses default port based on protocol

2. **Server Directory Support:**
   - `--server-directory https://superchat.win/servers.json`
   - Fetches list of available servers
   - Shows server selection modal if > 1 server
   - Auto-connects if only 1 server
   - Default directory: `https://superchat.win/servers.json`

3. **servers.json Format:**
```json
{
  "servers": [
    {
      "name": "SuperChat Official",
      "tcp_address": "superchat.win:6465",
      "ssh_address": "superchat.win:2222",
      "description": "Official public server"
    },
    {
      "name": "Dev Server",
      "tcp_address": "localhost:6465",
      "ssh_address": "localhost:2222",
      "description": "Local development"
    }
  ]
}
```

4. **Client Startup Flow:**
```
1. Check --server flag
   - If set: Use explicit server (skip directory)
   - If not set: Fetch directory
2. If directory has 1 server: Auto-connect
3. If directory has >1 servers: Show selection modal
4. User selects connection type (TCP/SSH) and server
5. Connect and authenticate
```

**Implementation:**

```go
// cmd/client/main.go
func main() {
    serverFlag := flag.String("server", "", "Server address (tcp://host:port or ssh://host:port)")
    directoryFlag := flag.String("server-directory", "https://superchat.win/servers.json", "Server directory URL")

    flag.Parse()

    var servers []ServerInfo
    if *serverFlag != "" {
        // Explicit server - parse and use directly
        servers = []ServerInfo{parseServerURL(*serverFlag)}
    } else {
        // Fetch from directory
        servers = fetchServerDirectory(*directoryFlag)
    }

    if len(servers) == 1 {
        // Auto-connect to single server
        connectToServer(servers[0])
    } else {
        // Show server selection modal
        showServerSelector(servers)
    }
}
```

---

## Security Considerations

1. **Fingerprint Format:** Use SSH's standard SHA256 format (`SHA256:base64...`)
2. **Key Types:** Support RSA (2048+), Ed25519, ECDSA
3. **Host Key Verification:** Implement TOFU (Trust On First Use) for server host keys
4. **Auto-Registration Rate Limiting:** Max 10 new users/hour per IP
5. **Key Deletion Safety:** Require password OR another SSH key before deleting last key
6. **Password Requirements:** Min 8 chars (consider adding complexity requirements)
7. **Encrypted Private Keys:** Phase 2 - prompt for passphrase (not in MVP)

---

## Testing Strategy

### Unit Tests

1. **Database:**
   - SSHKey CRUD operations
   - FK cascade on user deletion
   - Fingerprint uniqueness

2. **Protocol:**
   - Encode/decode all new message types
   - Round-trip tests

3. **Server:**
   - Fingerprint computation
   - Auto-registration logic
   - Rate limiting
   - Password change validation

### Integration Tests

1. **SSH Authentication:**
   - Connect with known key (should authenticate)
   - Connect with unknown key (should auto-register)
   - Connect with invalid key (should reject)
   - Multiple keys per user

2. **Key Management:**
   - Add key via TCP, connect via SSH
   - Delete key (with safeguards)
   - Update labels
   - List keys

3. **Password Management:**
   - Change password for TCP user
   - Change password for SSH-registered user (first time)
   - Change password with wrong old password (should fail)

### Manual Testing

```bash
# Test SSH connection
ssh -p 2222 myusername@localhost

# Should auto-register if first time
# Should authenticate if key exists

# Test TCP connection with key management
./superchat --server tcp://localhost:6465
# Login, add SSH key, disconnect
# Connect via SSH - should authenticate
```

---

## Estimated Timeline

- **Phase 1** (Database): 1 day
- **Phase 2** (Password Management): 1 day
- **Phase 3** (Server Auth): 2 days
- **Phase 4** (Protocol Messages): 1 day
- **Phase 5** (Client Connection): 1 day
- **Phase 6** (SSH Key Manager UI): 2 days
- **Phase 7** (Server Discovery): 1 day

**Total:** ~9 days (includes password management + server discovery)

---

## Open Questions / Decisions Made

1. **✅ Should we support adding keys via TCP connection?**
   - **Decision:** YES - Users without SSH keys need a way to add them first

2. **✅ Should we allow password login after SSH registration?**
   - **Decision:** YES - Generate random password, user can change it via new CHANGE_PASSWORD flow

3. **✅ How should we handle server selection?**
   - **Decision:** Server directory system with auto-connect for single server, modal for multiple

4. **Server directory hosting:**
   - Default to `superchat.win/servers.json`
   - Allow custom via `--server-directory` flag
   - If directory fetch fails, allow manual server entry

5. **Encrypted private keys:**
   - Phase 2 (not in MVP) - prompt for passphrase
   - For now, only support unencrypted keys

---

## Files to Create/Modify Summary

### New Files
- `pkg/database/migrations/004_add_ssh_keys.sql`
- `pkg/client/ui/modal/ssh_key_manager.go`
- `pkg/client/ui/modal/password_change.go`
- `docs/SSH_AUTH_PLAN.md` (this file)

### Modified Files
- `pkg/database/database.go` - SSHKey CRUD, password update
- `pkg/protocol/messages.go` - New message types (0x0C-0x0F, 0x8C-0x8F, 0x98, 0x0E, 0x8E)
- `pkg/server/ssh.go` - Remove NoClientAuth, add PublicKeyCallback
- `pkg/server/handlers.go` - Add SSH key + password handlers
- `pkg/client/connection.go` - Add SSH connection support
- `cmd/client/main.go` - Server directory support
- `docs/PROTOCOL.md` - Document new message types
- `docs/versions/V2.md` - Update SSH feature status

---

## Post-Implementation Checklist

- [ ] Migration 004 applied and tested
- [ ] All protocol messages implemented and tested (90%+ coverage)
- [ ] SSH authentication working (auto-register + existing users)
- [ ] Key management UI functional (add/delete/rename)
- [ ] Password change UI functional
- [ ] Server directory working
- [ ] Integration tests passing
- [ ] Manual SSH connection test: `ssh -p 2222 user@server`
- [ ] Documentation updated (PROTOCOL.md, V2.md)
- [ ] V2 feature marked complete in V2.md

---

## Notes

- This is the last V2 feature! After this, SuperChat V2 is complete.
- Total V2 features: User registration ✅, User channels ✅, Message editing ✅, SSH auth (this plan)
- Next: V3 planning (DMs, encryption, compression)
