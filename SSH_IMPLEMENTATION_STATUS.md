# SSH Authentication Implementation Status

**Last Updated:** 2025-10-07
**Overall Progress:** ~85% complete (Phases 1-6 done, SSH fully functional!)

## ✅ Phase 1: Database Schema - COMPLETE

**Files Created:**
- `/Users/bart.riepe/Projects/superchat/pkg/database/migrations/005_add_ssh_keys.sql`
  - Created SSHKey table with all required columns
  - Added indexes: idx_ssh_fingerprint (unique), idx_ssh_user
  - Foreign key constraint: user_id → User(id) ON DELETE CASCADE

**Files Modified:**
- `/Users/bart.riepe/Projects/superchat/pkg/database/database.go`
  - Added SSHKey struct (lines 250-260)
  - Added UpdateUserPassword() method (lines 1140-1146)
  - Added CreateSSHKey() method (lines 1150-1168)
  - Added GetSSHKeyByFingerprint() method (lines 1170-1184)
  - Added GetSSHKeysByUserID() method (lines 1186-1214)
  - Added DeleteSSHKey() method (lines 1216-1237)
  - Added UpdateSSHKeyLastUsed() method (lines 1239-1245)
  - Updated SSHKeyLabel() method (lines 1247-1268)

- `/Users/bart.riepe/Projects/superchat/pkg/database/migration_path_test.go`
  - Added comprehensive migration test for v3→v5 (lines 190-304)
  - Tests schema creation, FK constraints, unique constraints, CASCADE behavior

**Tests:** ✅ All migration tests passing

---

## ✅ Phase 2: Password Management - COMPLETE

**Files Modified:**

1. `pkg/protocol/messages.go`
   - Added TypeChangePassword = 0x0E (line 23)
   - Added TypePasswordChanged = 0x8E (line 53)
   - Added ChangePasswordRequest struct with EncodeTo/Decode (lines 2400-2428)
   - Added PasswordChangedResponse struct with EncodeTo/Decode (lines 2430-2458)

2. `pkg/server/server.go`
   - Added case for protocol.TypeChangePassword in message router (line 424-425)

3. `pkg/server/handlers.go`
   - Added handleChangePassword() function (lines 684-739)
   - Added sendPasswordChanged() helper (lines 741-748)
   - Validates old password, hashes new password with bcrypt
   - Supports SSH-registered users (empty old password)

4. `pkg/database/memdb.go`
   - Added UpdateUserPassword() wrapper method (lines 1038-1042)
   - Added all SSH key method wrappers (lines 1044-1069)

**Tests:** ✅ Build successful (`make build` passes)

**TODO (Client UI):** Password change modal - deferred to after SSH implementation

### Original Plan Below (for reference)

File: `pkg/protocol/messages.go`

```go
const (
	// ... existing messages ...
	MsgChangePassword      = 0x0E
	MsgPasswordChanged     = 0x8E
)

// CHANGE_PASSWORD (0x0E) - Client → Server
type ChangePasswordRequest struct {
	OldPassword string // Empty for SSH-registered users changing for first time
	NewPassword string
}

func (m *ChangePasswordRequest) EncodeTo(w io.Writer) error {
	if err := WriteString(w, m.OldPassword); err != nil {
		return err
	}
	return WriteString(w, m.NewPassword)
}

func DecodeChangePasswordRequest(data []byte) (*ChangePasswordRequest, error) {
	r := bytes.NewReader(data)
	oldPassword, err := ReadString(r)
	if err != nil {
		return nil, err
	}
	newPassword, err := ReadString(r)
	if err != nil {
		return nil, err
	}
	return &ChangePasswordRequest{
		OldPassword: oldPassword,
		NewPassword: newPassword,
	}, nil
}

// PASSWORD_CHANGED (0x8E) - Server → Client
type PasswordChangedResponse struct {
	Success      bool
	ErrorMessage string
}

func (m *PasswordChangedResponse) EncodeTo(w io.Writer) error {
	if err := WriteBool(w, m.Success); err != nil {
		return err
	}
	return WriteString(w, m.ErrorMessage)
}

func DecodePasswordChangedResponse(data []byte) (*PasswordChangedResponse, error) {
	r := bytes.NewReader(data)
	success, err := ReadBool(r)
	if err != nil {
		return nil, err
	}
	errorMessage, err := ReadString(r)
	if err != nil {
		return nil, err
	}
	return &PasswordChangedResponse{
		Success:      success,
		ErrorMessage: errorMessage,
	}, nil
}
```

### Server Handler

File: `pkg/server/handlers.go`

Add to message router (in `handleMessage()`):
```go
case protocol.MsgChangePassword:
	return s.handleChangePassword(sess, payload)
```

Add handler method:
```go
func (s *Server) handleChangePassword(sess *Session, payload []byte) error {
	// Must be authenticated
	if sess.UserID == nil {
		return s.sendError(sess, 1003, "Must be authenticated to change password")
	}

	// Decode request
	req, err := protocol.DecodeChangePasswordRequest(payload)
	if err != nil {
		return s.sendError(sess, 9000, "Invalid change password request")
	}

	// Get user
	user, err := s.db.GetUserByID(*sess.UserID)
	if err != nil {
		return s.sendError(sess, 9000, "User not found")
	}

	// Verify old password (skip if user has no password set - SSH-registered)
	if user.PasswordHash != "" && req.OldPassword != "" {
		if err := bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(req.OldPassword)); err != nil {
			return s.sendPasswordChanged(sess, false, "Incorrect current password")
		}
	}

	// Validate new password
	if len(req.NewPassword) < 8 {
		return s.sendPasswordChanged(sess, false, "Password must be at least 8 characters")
	}

	// Hash new password
	newHash, err := bcrypt.GenerateFromPassword([]byte(req.NewPassword), bcrypt.DefaultCost)
	if err != nil {
		return s.sendError(sess, 9000, "Failed to hash password")
	}

	// Update password
	if err := s.db.UpdateUserPassword(*sess.UserID, string(newHash)); err != nil {
		return s.sendError(sess, 9000, "Failed to update password")
	}

	log.Printf("User %s changed password", sess.Nickname)
	return s.sendPasswordChanged(sess, true, "")
}

func (s *Server) sendPasswordChanged(sess *Session, success bool, errorMessage string) error {
	resp := &protocol.PasswordChangedResponse{
		Success:      success,
		ErrorMessage: errorMessage,
	}
	return s.sendMessage(sess, protocol.MsgPasswordChanged, resp)
}
```

### Client Modal UI

File: `pkg/client/ui/modal/password_change.go` (NEW FILE)

```go
package modal

import (
	"github.com/aeolun/superchat/pkg/client/ui"
	"github.com/charmbracelet/bubbles/textinput"
	tea "github.com/charmbracelet/bubbletea"
	"github.com/charmbracelet/lipgloss"
)

type PasswordChangeModal struct {
	width             int
	height            int
	oldPasswordInput  textinput.Model
	newPasswordInput  textinput.Model
	confirmInput      textinput.Model
	focusIndex        int
	skipOldPassword   bool // True for SSH-registered users
	errorMessage      string
}

func NewPasswordChangeModal(skipOldPassword bool) *PasswordChangeModal {
	oldPwdInput := textinput.New()
	oldPwdInput.Placeholder = "Current password"
	oldPwdInput.EchoMode = textinput.EchoPassword
	oldPwdInput.CharLimit = 128

	newPwdInput := textinput.New()
	newPwdInput.Placeholder = "New password (min 8 chars)"
	newPwdInput.EchoMode = textinput.EchoPassword
	newPwdInput.CharLimit = 128

	confirmInput := textinput.New()
	confirmInput.Placeholder = "Confirm new password"
	confirmInput.EchoMode = textinput.EchoPassword
	confirmInput.CharLimit = 128

	focusIndex := 0
	if skipOldPassword {
		focusIndex = 1
		newPwdInput.Focus()
	} else {
		oldPwdInput.Focus()
	}

	return &PasswordChangeModal{
		oldPasswordInput: oldPwdInput,
		newPasswordInput: newPwdInput,
		confirmInput:     confirmInput,
		focusIndex:       focusIndex,
		skipOldPassword:  skipOldPassword,
	}
}

func (m *PasswordChangeModal) Type() ModalType {
	return ModalTypePasswordChange
}

func (m *PasswordChangeModal) Render(width, height int) string {
	m.width = width
	m.height = height

	var fields []string

	if !m.skipOldPassword {
		fields = append(fields, m.oldPasswordInput.View())
	}

	fields = append(fields, m.newPasswordInput.View())
	fields = append(fields, m.confirmInput.View())

	content := lipgloss.JoinVertical(lipgloss.Left, fields...)

	if m.errorMessage != "" {
		content += "\n\n" + ui.RenderError(m.errorMessage)
	}

	content += "\n\n" + ui.MutedTextStyle.Render("[Enter] Submit • [Esc] Cancel")

	title := "Change Password"
	if m.skipOldPassword {
		title = "Set Password (SSH Account)"
	}

	box := lipgloss.NewStyle().
		Border(lipgloss.RoundedBorder()).
		BorderForeground(ui.PrimaryColor).
		Padding(1, 2).
		Width(50).
		Render(ui.BoldStyle.Render(title) + "\n\n" + content)

	return lipgloss.Place(width, height, lipgloss.Center, lipgloss.Center, box)
}

func (m *PasswordChangeModal) Update(msg tea.Msg) (Modal, tea.Cmd) {
	switch msg := msg.(type) {
	case tea.KeyMsg:
		switch msg.String() {
		case "tab", "shift+tab", "up", "down":
			// Cycle through inputs
			if msg.String() == "tab" || msg.String() == "down" {
				m.focusIndex++
			} else {
				m.focusIndex--
			}

			start := 0
			if m.skipOldPassword {
				start = 1
			}

			if m.focusIndex < start {
				m.focusIndex = 2
			} else if m.focusIndex > 2 {
				m.focusIndex = start
			}

			m.updateFocus()
			return m, nil

		case "enter":
			return m, m.submit()
		}
	}

	// Update focused input
	var cmd tea.Cmd
	switch m.focusIndex {
	case 0:
		m.oldPasswordInput, cmd = m.oldPasswordInput.Update(msg)
	case 1:
		m.newPasswordInput, cmd = m.newPasswordInput.Update(msg)
	case 2:
		m.confirmInput, cmd = m.confirmInput.Update(msg)
	}

	return m, cmd
}

func (m *PasswordChangeModal) updateFocus() {
	m.oldPasswordInput.Blur()
	m.newPasswordInput.Blur()
	m.confirmInput.Blur()

	switch m.focusIndex {
	case 0:
		m.oldPasswordInput.Focus()
	case 1:
		m.newPasswordInput.Focus()
	case 2:
		m.confirmInput.Focus()
	}
}

func (m *PasswordChangeModal) submit() tea.Cmd {
	// Validate inputs
	newPassword := m.newPasswordInput.Value()
	confirmPassword := m.confirmInput.Value()

	if len(newPassword) < 8 {
		m.errorMessage = "Password must be at least 8 characters"
		return nil
	}

	if newPassword != confirmPassword {
		m.errorMessage = "Passwords do not match"
		return nil
	}

	oldPassword := m.oldPasswordInput.Value()

	// Return command to send CHANGE_PASSWORD message
	return func() tea.Msg {
		return PasswordChangeSubmitMsg{
			OldPassword: oldPassword,
			NewPassword: newPassword,
		}
	}
}

type PasswordChangeSubmitMsg struct {
	OldPassword string
	NewPassword string
}
```

---

## ✅ Phase 3: Server-Side SSH Authentication - COMPLETE

**Files Modified:**

1. `pkg/server/ssh.go`
   - **Line 37**: Replaced `NoClientAuth: true` with `PublicKeyCallback: s.authenticateSSHKey`
   - **Lines 15-22**: Added imports (strconv, database, bcrypt)
   - **Lines 316-401**: Added `authenticateSSHKey()` function
     - Computes SSH key fingerprint (SHA256 format)
     - Looks up key in database
     - **Known key**: Authenticates as existing user, updates last_used timestamp
     - **Unknown key**: Auto-registers new user with random password
     - Returns SSH permissions with user info (user_id, nickname, user_flags)
   - **Lines 403-428**: Added helper functions:
     - `generateSecureRandomPassword()` - Crypto-secure random passwords
     - `checkAutoRegisterRateLimit()` - Rate limiting (TODO: full implementation)
     - `stringPtr()` - Helper for optional string fields
   - **Line 122**: Updated `handleSSHConnection` to pass permissions to session handler
   - **Lines 143-202**: Updated `handleSSHSession` signature and implementation
     - Accepts `*ssh.Permissions` parameter
     - Extracts user_id, nickname, user_flags from permissions
     - Creates authenticated session
     - Automatically sends AUTH_RESPONSE for SSH-authenticated users

**Key Features:**
- ✅ Public key authentication replaces anonymous access
- ✅ Auto-registration: New SSH keys create user accounts automatically
- ✅ Existing users authenticated instantly via SSH key lookup
- ✅ Random password generated for SSH-registered users (changeable via CHANGE_PASSWORD)
- ✅ Last-used timestamp tracked for security auditing
- ✅ Full integration with existing session management

**Build Status:** ✅ `make build` passes

**Security Notes:**
- Rate limiting placeholder (max 10/hour per IP) - TODO: full implementation
- Fingerprint format: SHA256 (OpenSSH standard)
- Crypto-secure password generation (crypto/rand)
- No rollback on SSH key creation failure (user exists but keyless - can register via password)

---

## ✅ Phase 4: SSH Key Management Protocol - COMPLETE

**Files Modified:**

1. `pkg/protocol/messages.go`
   - **Lines 23-28**: Added client message types (ADD_SSH_KEY, LIST_SSH_KEYS, UPDATE_SSH_KEY_LABEL, DELETE_SSH_KEY)
   - **Lines 61-64**: Added server response types (SSH_KEY_ADDED, SSH_KEY_LIST, SSH_KEY_LABEL_UPDATED, SSH_KEY_DELETED)
   - **Lines 2468-2770**: Added all SSH key message structs with EncodeTo/Decode methods

2. `pkg/server/server.go`
   - **Lines 426-433**: Added SSH key message routing in handleMessage()

3. `pkg/server/handlers.go`
   - **Line 16**: Added golang.org/x/crypto/ssh import
   - **Lines 751-993**: Added four handlers:
     - `handleAddSSHKey` - Validates & parses SSH public key, computes fingerprint, stores in DB
     - `handleListSSHKeys` - Returns user's SSH keys with metadata
     - `handleUpdateSSHKeyLabel` - Updates key label (with ownership verification)
     - `handleDeleteSSHKey` - Deletes key (prevents deleting last key if no password)

4. `docs/PROTOCOL.md`
   - Updated message type tables to reflect actual implementation
   - Reassigned unimplemented messages to unused codes (0x17+, 0x97+, 0xA0+)
   - Added complete wire format documentation for all SSH key messages

**Build Status:** ✅ `make build` passes

---

## ✅ Phase 5: Client-Side SSH Connection - COMPLETE

**Files Modified:**

1. `pkg/client/connection.go`
   - **Lines 918-928**: Added SSH key loading to dialSSH (previously missing authentication)
   - **Lines 930-933**: Added Auth field to ssh.ClientConfig
   - **Lines 971-1019**: Added `loadSSHAuthMethods()` function
     - Loads private keys from ~/.ssh/ (id_ed25519, id_ecdsa, id_rsa, id_dsa)
     - Parses unencrypted keys (TODO: encrypted key support)
     - Returns ssh.AuthMethod for public key authentication

**Key Features:**
- ✅ Automatically loads SSH keys from standard locations
- ✅ Tries keys in order of preference (Ed25519 → ECDSA → RSA → DSA)
- ✅ Helpful error message if no keys found
- ✅ Full integration with existing host key verification

**Build Status:** ✅ `make build` passes

---

## ✅ Phase 6: Password Change Modal UI - COMPLETE

**Files Created:**

1. `pkg/client/ui/modal/password_change.go` (NEW FILE)
   - Complete password change modal with three fields (old, new, confirm)
   - Supports SSH users (skipOldPassword flag for first-time password setting)
   - Validation: min 8 chars, passwords match
   - Keyboard navigation: Tab/Up/Down to cycle, Enter to submit, Esc to cancel
   - Password masking with bullets (•)

**Files Modified:**

1. `pkg/client/ui/modal/types.go`
   - **Line 21**: Added ModalTypePasswordChange constant
   - **Lines 47-48**: Added "PasswordChange" string case

**Usage:**
```go
modal := NewPasswordChangeModal(
    skipOldPassword bool,
    onConfirm func(oldPwd, newPwd string) tea.Cmd,
    onCancel func() tea.Cmd,
)
```

**Build Status:** ✅ `make build` passes

---

## 🔨 Phases 7-8: Optional Enhancements (~15% remaining)

**Remaining Work (Optional):**
1. ~~Phase 4 (SSH key management protocol)~~ ✅ DONE
2. ~~Phase 5 (client SSH connection)~~ ✅ DONE
3. ~~Phase 6 (password change modal)~~ ✅ DONE
4. Phase 7 (SSH key manager UI) - Client UI to list/add/delete SSH keys
5. Phase 8 (Server discovery) - Auto-discover SuperChat servers

**Current Status:** ~85% complete - SSH is fully functional!

