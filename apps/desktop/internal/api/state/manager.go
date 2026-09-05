package state

import (
	"sync"

	"github.com/relay-client/relay/apps/desktop/internal/util"
)

type Manager struct {
	mu          sync.RWMutex
	variables   map[string]string
	environment map[string]string
}

func New() *Manager {
	return &Manager{
		variables:   make(map[string]string),
		environment: make(map[string]string),
	}
}

func (m *Manager) GetVariables() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return util.CloneMap(m.variables)
}

func (m *Manager) GetEnvironment() map[string]string {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return util.CloneMap(m.environment)
}

func (m *Manager) SetVariable(key, value string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.variables[key] = value
}

func (m *Manager) SetEnvironmentVar(key, value string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.environment[key] = value
}

func (m *Manager) SetEnvironment(values map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.environment = util.CloneMap(values)
}

func (m *Manager) SetVariables(values map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.variables = util.CloneMap(values)
}

func (m *Manager) DeleteVariable(key string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	delete(m.variables, key)
}

func (m *Manager) ClearVariables() {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.variables = make(map[string]string)
}

func (m *Manager) Snapshot() (variables, environment map[string]string) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return util.CloneMap(m.variables), util.CloneMap(m.environment)
}

func (m *Manager) Merge(beforeVars, afterVars, beforeEnv, afterEnv map[string]string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	mergeMapDelta(m.variables, beforeVars, afterVars)
	mergeMapDelta(m.environment, beforeEnv, afterEnv)
}

func mergeMapDelta(live, before, after map[string]string) {
	for key, value := range after {
		if prev, ok := before[key]; !ok || prev != value {
			live[key] = value
		}
	}
	for key := range before {
		if _, ok := after[key]; !ok {
			delete(live, key)
		}
	}
}
