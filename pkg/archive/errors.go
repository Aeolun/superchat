package archive

import "fmt"

var errHandshakeRejected = fmt.Errorf("archive: handshake rejected by archiver")

func errUnexpectedMessage(got, want uint8) error {
	return fmt.Errorf("archive: unexpected message type 0x%02x, expected 0x%02x", got, want)
}

// ErrUnexpectedMessage returns an error for receiving an unexpected message type.
func ErrUnexpectedMessage(got, want uint8) error {
	return errUnexpectedMessage(got, want)
}
