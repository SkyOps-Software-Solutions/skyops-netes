package heartbeat

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/transport"
	"k8s.io/client-go/kubernetes/fake"
)

func TestServiceStartsWithoutConnectedEvidenceAndRecovers(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/api/v1/agent/heartbeat" {
			http.NotFound(w, r)
			return
		}
		w.WriteHeader(http.StatusOK)
	}))
	defer server.Close()

	cfg := &config.Config{
		ClusterID:               "cluster-stable",
		AgentID:                 "agent-stable",
		AgentToken:              "token-stable",
		ServerURL:               server.URL,
		AgentVersion:            "v1.5.0",
		MaxRetries:              0,
		BackoffBase:             time.Millisecond,
		CircuitBreakerThreshold: 5,
		CircuitBreakerCooldown:  time.Second,
	}

	service := NewService(cfg, transport.NewClient(cfg))
	if got := service.State(); got != StateReconnecting {
		t.Fatalf("expected no-evidence state %q, got %q", StateReconnecting, got)
	}

	service.send(context.Background())
	if got := service.State(); got != StateConnected {
		t.Fatalf("expected heartbeat recovery to state %q, got %q", StateConnected, got)
	}
}

func TestServiceMarksReconnectAfterBackendFailure(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusServiceUnavailable)
	}))

	cfg := &config.Config{
		ClusterID:               "cluster-stable",
		AgentID:                 "agent-stable",
		AgentToken:              "token-stable",
		ServerURL:               server.URL,
		AgentVersion:            "v1.5.0",
		MaxRetries:              0,
		BackoffBase:             time.Millisecond,
		CircuitBreakerThreshold: 5,
		CircuitBreakerCooldown:  time.Second,
	}

	service := NewService(cfg, transport.NewClient(cfg))
	service.send(context.Background())
	server.Close()
	if got := service.State(); got != StateReconnecting {
		t.Fatalf("expected backend failure to state %q, got %q", StateReconnecting, got)
	}
}

func TestDiscoverCapabilitiesGracefulFallback(t *testing.T) {
	cfg := &config.Config{
		ClusterID: "cluster-stable",
		AgentID:   "agent-stable",
	}

	service := NewService(cfg, transport.NewClient(cfg))
	// Without k8sClient set, DiscoverCapabilities must return non-nil empty struct without crashing
	caps := service.DiscoverCapabilities(context.Background())
	if caps == nil {
		t.Fatal("expected non-nil OperationalCapabilities")
	}
	if caps.CanDeletePods || caps.CanRestartDeployments || caps.CanScaleDeployments {
		t.Fatal("expected all mutation capabilities false when k8s client is nil")
	}
}

func TestDiscoverCapabilitiesCache(t *testing.T) {
	cfg := &config.Config{
		ClusterID: "cluster-stable",
		AgentID:   "agent-stable",
	}

	service := NewService(cfg, transport.NewClient(cfg))
	fakeClient := fake.NewSimpleClientset()
	service.SetK8sClient(fakeClient)

	// First discovery
	caps1 := service.DiscoverCapabilities(context.Background())
	if caps1 == nil {
		t.Fatal("expected non-nil caps1")
	}

	// Immediate second call should return cached pointer
	caps2 := service.DiscoverCapabilities(context.Background())
	if caps1 != caps2 {
		t.Fatal("expected cached pointer to be returned within 5 minutes")
	}

	// Setting a new client should invalidate the cache
	newFakeClient := fake.NewSimpleClientset()
	service.SetK8sClient(newFakeClient)
	caps3 := service.DiscoverCapabilities(context.Background())
	if caps3 == caps1 {
		t.Fatal("expected cache to be invalidated upon SetK8sClient")
	}
}
