//go:build windows

package api

import (
	"unsafe"

	"golang.org/x/sys/windows"
)

var procGetCurrentPackageFullName = windows.NewLazySystemDLL("kernel32.dll").NewProc("GetCurrentPackageFullName")

func hasPackageIdentity() bool {
	if procGetCurrentPackageFullName.Find() != nil {
		return false
	}
	var length uint32
	status, _, _ := procGetCurrentPackageFullName.Call(uintptr(unsafe.Pointer(&length)), 0)
	return packageIdentityFromStatus(status)
}
