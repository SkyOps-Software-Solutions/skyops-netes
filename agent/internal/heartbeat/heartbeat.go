package heartbeat

import (
	"context"
	"log/slog"
	"math/rand"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/metrics"
	"github.com/skyops-io/skyops/agent/internal/queue"
	"github.com/skyops-io/skyops/agent/internal/spool"
	"github.com/skyops-io/skyops/agent/internal/transport"
	authv1 "k8s.io/api/authorization/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes"
)

// ConnectionState represents current agent connectivity status
type ConnectionState string

const (
	StateConnected    ConnectionState = "CONNECTED"
	StateReconnecting ConnectionState = "RECONNECTING"
	StateStale        ConnectionState = "STALE"
	StateOffline      ConnectionState = "OFFLINE"
)

// Service periodically pulses health heartbeats to SkyOps with automatic reconnection
type Service struct {
	cfg                    *config.Config
	client                 *transport.Client
	k8sClient              kubernetes.Interface
	queue                  *queue.BoundedQueue
	spool                  *spool.Spool
	metrics                *metrics.Registry
	startTime              time.Time
	mu                     sync.RWMutex
	nodeCount              int
	podCount               int
	k8sVersion             string
	state                  ConnectionState
	reconnectAttempts      int
	cachedCapabilities     *transport.OperationalCapabilities
	lastCapabilitiesCheck  time.Time
}

func NewService(cfg *config.Config, client *transport.Client) *Service {
	return &Service{
		cfg:               cfg,
		client:            client,
		nodeCount:         0,
		podCount:          0,
		k8sVersion:        "",
		startTime:         time.Now(),
		metrics:           metrics.Default,
		state:             StateReconnecting,
		reconnectAttempts: 0,
	}
}

func (s *Service) SetK8sClient(client kubernetes.Interface) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.k8sClient = client
	// Invalidate capability cache to force fresh probe with the new client
	s.cachedCapabilities = nil
}

func (s *Service) SetQueue(q *queue.BoundedQueue) {
	s.queue = q
}

func (s *Service) SetSpool(sp *spool.Spool) {
	s.spool = sp
}

func (s *Service) SetMetrics(r *metrics.Registry) {
	s.metrics = r
}

func (s *Service) State() ConnectionState {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.state
}

func (s *Service) UpdateCounts(nodes, pods int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodeCount = nodes
	s.podCount = pods
}

func (s *Service) UpdateTelemetryState(nodes, pods int, k8sVersion string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	s.nodeCount = nodes
	s.podCount = pods
	if k8sVersion != "" {
		s.k8sVersion = k8sVersion
	}
}

func (s *Service) SetK8sVersion(ver string) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if ver != "" {
		s.k8sVersion = ver
	}
}

func (s *Service) Start(ctx context.Context) {
	slog.Info("Heartbeat service started", "interval", s.cfg.HeartbeatInterval.String())

	// Send initial immediate heartbeat
	s.send(ctx)

	for {
		s.mu.RLock()
		currentState := s.state
		attempts := s.reconnectAttempts
		s.mu.RUnlock()

		var interval time.Duration
		if currentState == StateConnected {
			interval = s.cfg.HeartbeatInterval
		} else {
			// Exponential backoff with jitter when reconnecting
			// 2s, 4s, 8s, 16s capped at min(HeartbeatInterval, 30s)
			shift := attempts
			if shift > 4 {
				shift = 4
			}
			maxBackoff := s.cfg.HeartbeatInterval
			if maxBackoff > 30*time.Second {
				maxBackoff = 30 * time.Second
			}
			interval = time.Duration(1<<shift)*time.Second + time.Duration(rand.Intn(1000))*time.Millisecond
			if interval > maxBackoff {
				interval = maxBackoff
			}
		}

		select {
		case <-ctx.Done():
			slog.Info("Heartbeat service stopped")
			return
		case <-time.After(interval):
			s.send(ctx)
		}
	}
}

// checkPermission performs an atomic SelfSubjectAccessReview to check whether the agent identity can perform an action
func (s *Service) checkPermission(ctx context.Context, verb, group, resource, subresource string) bool {
	if s.k8sClient == nil {
		return false
	}
	sar := &authv1.SelfSubjectAccessReview{
		Spec: authv1.SelfSubjectAccessReviewSpec{
			ResourceAttributes: &authv1.ResourceAttributes{
				Verb:        verb,
				Group:       group,
				Resource:    resource,
				Subresource: subresource,
			},
		},
	}
	probeCtx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	res, err := s.k8sClient.AuthorizationV1().SelfSubjectAccessReviews().Create(probeCtx, sar, metav1.CreateOptions{})
	if err != nil {
		slog.Debug("SelfSubjectAccessReview probe skipped or failed", "resource", resource, "verb", verb, "error", err)
		return false
	}
	return res != nil && res.Status.Allowed
}

// DiscoverCapabilities checks live Kubernetes RBAC via SelfSubjectAccessReviews and caches for 5 minutes
func (s *Service) DiscoverCapabilities(ctx context.Context) *transport.OperationalCapabilities {
	s.mu.Lock()
	defer s.mu.Unlock()

	// Return cached capabilities if checked within the last 5 minutes
	if s.cachedCapabilities != nil && time.Since(s.lastCapabilitiesCheck) < 5*time.Minute {
		return s.cachedCapabilities
	}

	if s.k8sClient == nil {
		// Default empty capabilities when client-go client is not present
		caps := &transport.OperationalCapabilities{}
		s.cachedCapabilities = caps
		s.lastCapabilitiesCheck = time.Now()
		return caps
	}

	canDeletePods := s.checkPermission(ctx, "delete", "", "pods", "")
	canRestartDeployments := s.checkPermission(ctx, "patch", "apps", "deployments", "")
	canScaleDeployments := s.checkPermission(ctx, "patch", "apps", "deployments", "scale") || s.checkPermission(ctx, "update", "apps", "deployments", "scale")
	canScaleStatefulSets := s.checkPermission(ctx, "patch", "apps", "statefulsets", "scale") || s.checkPermission(ctx, "update", "apps", "statefulsets", "scale")
	canMutateCronJobs := s.checkPermission(ctx, "patch", "batch", "cronjobs", "") || s.checkPermission(ctx, "update", "batch", "cronjobs", "")
	canCreateJobs := s.checkPermission(ctx, "create", "batch", "jobs", "")
	canDeleteJobs := s.checkPermission(ctx, "delete", "batch", "jobs", "")
	canCordonNodes := s.checkPermission(ctx, "patch", "", "nodes", "") || s.checkPermission(ctx, "update", "", "nodes", "")
	canDrainNodes := canCordonNodes && s.checkPermission(ctx, "create", "", "pods", "eviction")

	caps := &transport.OperationalCapabilities{
		CanDeletePods:         canDeletePods,
		CanRestartDeployments: canRestartDeployments,
		CanScaleDeployments:   canScaleDeployments,
		CanScaleStatefulSets:  canScaleStatefulSets,
		CanMutateCronJobs:     canMutateCronJobs,
		CanCreateJobs:         canCreateJobs,
		CanDeleteJobs:         canDeleteJobs,
		CanCordonNodes:        canCordonNodes,
		CanDrainNodes:         canDrainNodes,
	}

	s.cachedCapabilities = caps
	s.lastCapabilitiesCheck = time.Now()

	slog.Info("Discovered Kubernetes operational capabilities via SelfSubjectAccessReview",
		"canDeletePods", canDeletePods,
		"canRestartDeployments", canRestartDeployments,
		"canScaleDeployments", canScaleDeployments,
		"canScaleStatefulSets", canScaleStatefulSets,
		"canMutateCronJobs", canMutateCronJobs,
		"canCreateJobs", canCreateJobs,
		"canDeleteJobs", canDeleteJobs,
		"canCordonNodes", canCordonNodes,
		"canDrainNodes", canDrainNodes,
	)

	return caps
}

func (s *Service) send(ctx context.Context) {
	s.mu.RLock()
	nodes := s.nodeCount
	pods := s.podCount
	k8sVer := s.k8sVersion
	currState := s.state
	s.mu.RUnlock()

	var qDepth int
	if s.queue != nil {
		qDepth = s.queue.Len()
	}

	var spoolBytes int64
	if s.spool != nil {
		_, spoolBytes = s.spool.Stats()
	}

	circuitState := "CLOSED"
	if cb := s.client.CircuitBreaker(); cb != nil {
		circuitState = string(cb.State())
	}

	// Discover real Kubernetes operational capabilities via SSAR
	opCaps := s.DiscoverCapabilities(ctx)

	// Determine derived permission tier
	permissionTier := "observer"
	if opCaps.CanCordonNodes || opCaps.CanDrainNodes {
		permissionTier = "admin"
	} else if opCaps.CanDeletePods || opCaps.CanRestartDeployments || opCaps.CanScaleDeployments || opCaps.CanScaleStatefulSets || opCaps.CanCreateJobs {
		permissionTier = "operator"
	}

	// Build backward-compatible string array capabilities
	capsList := []string{"metrics", "watches", "spooling", "graph", "intelligence"}
	hasAnyMutation := opCaps.CanDeletePods || opCaps.CanRestartDeployments || opCaps.CanScaleDeployments || opCaps.CanScaleStatefulSets || opCaps.CanMutateCronJobs || opCaps.CanCreateJobs || opCaps.CanCordonNodes
	if hasAnyMutation {
		capsList = append(capsList, "remediation")
	}
	if opCaps.CanDeletePods {
		capsList = append(capsList, "ops:pods:delete")
	}
	if opCaps.CanRestartDeployments {
		capsList = append(capsList, "ops:deployments:restart")
	}
	if opCaps.CanScaleDeployments {
		capsList = append(capsList, "ops:deployments:scale")
	}
	if opCaps.CanScaleStatefulSets {
		capsList = append(capsList, "ops:statefulsets:scale")
	}
	if opCaps.CanMutateCronJobs {
		capsList = append(capsList, "ops:cronjobs:mutate")
	}
	if opCaps.CanCreateJobs {
		capsList = append(capsList, "ops:jobs:create")
	}
	if opCaps.CanDeleteJobs {
		capsList = append(capsList, "ops:jobs:delete")
	}
	if opCaps.CanCordonNodes {
		capsList = append(capsList, "ops:nodes:cordon")
	}
	if opCaps.CanDrainNodes {
		capsList = append(capsList, "ops:nodes:drain")
	}

	payload := transport.HeartbeatPayload{
		ClusterID:               s.cfg.ClusterID,
		AgentID:                 s.cfg.AgentID,
		AgentVersion:            s.cfg.AgentVersion,
		K8sVersion:              k8sVer,
		NodeCount:               nodes,
		PodCount:                pods,
		Timestamp:               time.Now().UnixMilli(),
		UptimeSeconds:           time.Since(s.startTime).Seconds(),
		QueueDepth:              qDepth,
		SpoolBytes:              spoolBytes,
		CircuitState:            circuitState,
		ConnectionState:         string(currState),
		Capabilities:            capsList,
		OperationalCapabilities: opCaps,
		PermissionTier:          permissionTier,
	}

	if err := s.client.SendHeartbeat(ctx, payload); err != nil {
		s.mu.Lock()
		if s.state == StateConnected {
			s.state = StateReconnecting
			s.reconnectAttempts = 1
			s.mu.Unlock()

			slog.Warn("Agent disconnected from central platform",
				"event", "agent_disconnected",
				"clusterId", s.cfg.ClusterID,
				"error", err,
			)
			slog.Warn("Heartbeat dispatch failed",
				"event", "agent_heartbeat_failed",
				"clusterId", s.cfg.ClusterID,
				"error", err,
			)
			slog.Info("Agent automatic reconnect initiated (reusing existing credentials)",
				"event", "agent_reconnect_started",
				"clusterId", s.cfg.ClusterID,
			)
		} else {
			s.reconnectAttempts++
			attempts := s.reconnectAttempts
			s.mu.Unlock()

			slog.Warn("Agent reconnect attempt failed, will retry",
				"event", "agent_reconnect_failed",
				"clusterId", s.cfg.ClusterID,
				"attempt", attempts,
				"error", err,
			)
		}
	} else {
		s.mu.Lock()
		wasReconnecting := s.state != StateConnected
		s.state = StateConnected
		s.reconnectAttempts = 0
		s.mu.Unlock()

		if wasReconnecting {
			slog.Info("Agent successfully reconnected and authenticated with SkyOps",
				"event", "agent_reconnected",
				"clusterId", s.cfg.ClusterID,
			)
		}
	}
}
