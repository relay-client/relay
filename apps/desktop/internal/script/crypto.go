package script

import (
	"crypto/hmac"
	"crypto/md5"
	"crypto/rand"
	"crypto/sha1"
	"crypto/sha256"
	"crypto/sha512"
	"encoding/base64"
	"encoding/hex"
	"fmt"
	"hash"
	"strings"
)

func newHashByName(name string) (func() hash.Hash, error) {
	switch strings.ToLower(strings.ReplaceAll(strings.TrimSpace(name), "-", "")) {
	case "md5":
		return md5.New, nil
	case "sha1":
		return sha1.New, nil
	case "sha256":
		return sha256.New, nil
	case "sha384":
		return sha512.New384, nil
	case "sha512":
		return sha512.New, nil
	case "sha512256":
		return func() hash.Hash { return sha512.New512_256() }, nil
	default:
		return nil, fmt.Errorf("unsupported algorithm %q (md5, sha1, sha256, sha384, sha512, sha512-256)", name)
	}
}

func hashDigest(algorithm, data string) ([]byte, error) {
	newHash, err := newHashByName(algorithm)
	if err != nil {
		return nil, err
	}
	h := newHash()
	h.Write([]byte(data))
	return h.Sum(nil), nil
}

func hmacDigest(algorithm, key, data string) ([]byte, error) {
	newHash, err := newHashByName(algorithm)
	if err != nil {
		return nil, err
	}
	mac := hmac.New(newHash, []byte(key))
	mac.Write([]byte(data))
	return mac.Sum(nil), nil
}

func encodeDigest(digest []byte, encoding string) string {
	switch strings.ToLower(strings.TrimSpace(encoding)) {
	case "base64":
		return base64.StdEncoding.EncodeToString(digest)
	case "base64url":
		return base64.RawURLEncoding.EncodeToString(digest)
	case "latin1", "binary":
		return string(digest)
	default:
		return hex.EncodeToString(digest)
	}
}

func randomHex(n int) (string, error) {
	if n <= 0 {
		return "", nil
	}
	if n > 1024 {
		return "", fmt.Errorf("randomHex: %d bytes is too many (max 1024)", n)
	}
	buf := make([]byte, n)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	return hex.EncodeToString(buf), nil
}

func randomUUID() (string, error) {
	buf := make([]byte, 16)
	if _, err := rand.Read(buf); err != nil {
		return "", err
	}
	buf[6] = (buf[6] & 0x0f) | 0x40
	buf[8] = (buf[8] & 0x3f) | 0x80
	return fmt.Sprintf("%x-%x-%x-%x-%x", buf[0:4], buf[4:6], buf[6:8], buf[8:10], buf[10:16]), nil
}
