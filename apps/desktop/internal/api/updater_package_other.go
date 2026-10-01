//go:build !windows

package api

func hasPackageIdentity() bool {
	return false
}
