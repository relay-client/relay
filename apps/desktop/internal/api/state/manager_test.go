package state

import (
	"fmt"
	"sync"
	"testing"
)

func cloneStringMap(m map[string]string) map[string]string {
	out := make(map[string]string, len(m))
	for k, v := range m {
		out[k] = v
	}
	return out
}

// TestMergeKeepsConcurrentWritesToDistinctKeys is the regression test for the
// lost-update race: two requests snapshot the same base, each sets a distinct
// variable, and committing one must not wipe the other's key. The previous
// wholesale-replace Apply failed this.
func TestMergeKeepsConcurrentWritesToDistinctKeys(t *testing.T) {
	m := New()
	m.SetVariable("base", "0")

	beforeA, _ := m.Snapshot()
	afterA := cloneStringMap(beforeA)
	afterA["a"] = "1"

	beforeB, _ := m.Snapshot()
	afterB := cloneStringMap(beforeB)
	afterB["b"] = "2"

	m.Merge(beforeA, afterA, nil, nil)
	m.Merge(beforeB, afterB, nil, nil)

	vars := m.GetVariables()
	if vars["a"] != "1" {
		t.Errorf("expected a=1 to survive concurrent merge, got %q (%v)", vars["a"], vars)
	}
	if vars["b"] != "2" {
		t.Errorf("expected b=2, got %q (%v)", vars["b"], vars)
	}
	if vars["base"] != "0" {
		t.Errorf("expected base untouched, got %q", vars["base"])
	}
}

func TestMergeAppliesAdditionsModificationsAndDeletions(t *testing.T) {
	m := New()
	m.SetVariable("keep", "1")
	m.SetVariable("change", "old")
	m.SetVariable("drop", "x")

	before, _ := m.Snapshot()
	after := cloneStringMap(before)
	after["change"] = "new"
	after["add"] = "y"
	delete(after, "drop")

	m.Merge(before, after, nil, nil)

	vars := m.GetVariables()
	if vars["keep"] != "1" {
		t.Errorf("keep should be retained, got %q", vars["keep"])
	}
	if vars["change"] != "new" {
		t.Errorf("change should be updated, got %q", vars["change"])
	}
	if vars["add"] != "y" {
		t.Errorf("add should be inserted, got %q", vars["add"])
	}
	if _, ok := vars["drop"]; ok {
		t.Errorf("drop should be deleted, got %v", vars)
	}
}

// TestMergeDeletionDoesNotClobberConcurrentAdd shows a deletion only removes the
// keys that were actually present in the caller's snapshot — a key another
// request added in the meantime survives.
func TestMergeDeletionDoesNotClobberConcurrentAdd(t *testing.T) {
	m := New()
	m.SetVariable("drop", "2")

	before, _ := m.Snapshot() // {drop:2}
	after := cloneStringMap(before)
	delete(after, "drop")

	// A concurrent request adds an unrelated key before this one commits.
	m.SetVariable("added", "9")

	m.Merge(before, after, nil, nil)

	vars := m.GetVariables()
	if _, ok := vars["drop"]; ok {
		t.Errorf("expected drop removed, got %v", vars)
	}
	if vars["added"] != "9" {
		t.Errorf("expected concurrently-added key to survive, got %v", vars)
	}
}

func TestMergeHandlesEnvironmentDeltas(t *testing.T) {
	m := New()
	m.SetEnvironmentVar("token", "old")

	_, beforeEnv := m.Snapshot()
	afterEnv := cloneStringMap(beforeEnv)
	afterEnv["token"] = "rotated"
	afterEnv["extra"] = "1"

	m.Merge(nil, nil, beforeEnv, afterEnv)

	env := m.GetEnvironment()
	if env["token"] != "rotated" {
		t.Errorf("expected token rotated, got %q", env["token"])
	}
	if env["extra"] != "1" {
		t.Errorf("expected extra env var, got %v", env)
	}
}

// TestMergeConcurrentNoRace runs many merges in parallel, each adding one
// distinct key from its own snapshot. All keys must survive and the run must be
// clean under -race.
func TestMergeConcurrentNoRace(t *testing.T) {
	const n = 64
	m := New()

	var wg sync.WaitGroup
	for i := 0; i < n; i++ {
		wg.Add(1)
		go func(i int) {
			defer wg.Done()
			beforeVars, beforeEnv := m.Snapshot()
			afterVars := cloneStringMap(beforeVars)
			afterVars[fmt.Sprintf("k%d", i)] = "v"
			afterEnv := cloneStringMap(beforeEnv)
			m.Merge(beforeVars, afterVars, beforeEnv, afterEnv)
		}(i)
	}
	wg.Wait()

	if got := len(m.GetVariables()); got != n {
		t.Errorf("expected %d distinct keys preserved across concurrent merges, got %d", n, got)
	}
}
