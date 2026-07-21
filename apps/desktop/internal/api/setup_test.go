package api

import (
	"os"
	"testing"
)

func TestMain(m *testing.M) {
	if err := os.Setenv(requestStoreDisableKeychain, "1"); err != nil {
		panic(err)
	}
	os.Exit(m.Run())
}
