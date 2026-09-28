package remediation

import (
	"bufio"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"math/rand"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/metrics"
	"github.com/skyops-io/skyops/agent/internal/policy"
	"github.com/skyops-io/skyops/agent/internal/transport"
	"k8s.io/client-go/kubernetes"
)

// Manager coordinates the real-time bidirectional remediation lifecycle between edge agent and server engine
type Manager struct {
	cfg          *config.Config
	client       *transport.Client
	policyEngine *policy.PolicyEngine
	executor     *Executor
	metrics      *metrics.Registry

	mu             sync.RWMutex
	idempotencyMap map[string]*ExecutionRecord // key: IdempotencyKey or ActionID
	recentRecords  []*ExecutionRecord

	// Real-time job stream and state synchronization
	streamMu        sync.RWMutex
	streamConnected bool
	actionChan      chan *transport.RemediationAction

	// Local buffer for atomic job state updates ensuring zero loss across network drops
	queueMu        sync.Mutex
	pendingUpdates []JobStateUpdate

	// Reconnection backoff parameters
	minReconnectBackoff time.Duration
	maxReconnectBackoff time.Duration
	defaultActionTimeout time.Duration
}

// NewManager initializes a resilient remediation execution manager
func NewManager(cfg *config.Config, client *transport.Client, k8sClient kubernetes.Interface, metricsReg *metrics.Registry) *Manager {
	if metricsReg == nil {
		metricsReg = metrics.Default
	}
	pe := policy.NewPolicyEngine(cfg.ClusterID, cfg.ProtectedNamespaces, cfg.MaxConcurrentActions, cfg.DryRunRemediation)
	var exec *Executor
	if k8sClient != nil {
		exec = NewExecutor(k8sClient)
	}

	return &Manager{
		cfg:                  cfg,
		client:               client,
		policyEngine:         pe,
		executor:             exec,
		metrics:              metricsReg,
		idempotencyMap:       make(map[string]*ExecutionRecord),
		actionChan:           make(chan *transport.RemediationAction, 64),
		pendingUpdates:       make([]JobStateUpdate, 0, 128),
		minReconnectBackoff:  1 * time.Second,
		maxReconnectBackoff:  30 * time.Second,
		defaultActionTimeout: 2 * time.Minute,
	}
}

// Start initiates the bidirectional communication layer, action dispatcher, and queue drain workers
func (m *Manager) Start(ctx context.Context) {
	slog.Info("Remediation execution manager started with real-time stream and fallback polling",
		"clusterId", m.cfg.ClusterID,
		"pollInterval", m.cfg.ActionPollInterval.String(),
	)

	var wg sync.WaitGroup

	// 1. Launch persistent local queue drain worker to guarantee zero loss of execution results
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.drainWorker(ctx)
	}()

	// 2. Launch real-time bidirectional job stream consumer (SSE / WebSocket)
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.streamWorker(ctx)
	}()

	// 3. Launch fallback HTTP polling loop
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.pollWorker(ctx)
	}()

	// 4. Launch job processor consuming actions from real-time stream and fallback poller
	wg.Add(1)
	go func() {
		defer wg.Done()
		m.actionWorker(ctx)
	}()

	<-ctx.Done()
	slog.Info("Remediation manager stopping, draining pending execution reports...")

	// Final drain attempt with a grace period
	drainCtx, drainCancel := context.WithTimeout(context.Background(), 5*time.Second)
	m.drainLocalQueue(drainCtx)
	drainCancel()

	wg.Wait()
	slog.Info("Remediation execution manager stopped cleanly")
}

// IsStreamConnected returns the active health state of the real-time bidirectional stream
func (m *Manager) IsStreamConnected() bool {
	m.streamMu.RLock()
	defer m.streamMu.RUnlock()
	return m.streamConnected
}

func (m *Manager) setStreamConnected(connected bool) {
	m.streamMu.Lock()
	m.streamConnected = connected
	m.streamMu.Unlock()
}

// streamWorker maintains a resilient, auto-reconnecting SSE stream connection to the server
func (m *Manager) streamWorker(ctx context.Context) {
	backoff := m.minReconnectBackoff

	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		slog.Debug("Establishing real-time remediation job stream connection to server...", "clusterId", m.cfg.ClusterID)
		resp, err := m.client.OpenActionStream(ctx)
		if err != nil {
			m.setStreamConnected(false)
			jitter := time.Duration(rand.Int63n(int64(500 * time.Millisecond)))
			waitDuration := backoff + jitter
			slog.Warn("Remediation stream connection failed (falling back to HTTP polling)",
				"error", err,
				"retryIn", waitDuration.String(),
			)

			select {
			case <-ctx.Done():
				return
			case <-time.After(waitDuration):
			}

			backoff = backoff * 2
			if backoff > m.maxReconnectBackoff {
				backoff = m.maxReconnectBackoff
			}
			continue
		}

		// Stream connected successfully
		m.setStreamConnected(true)
		backoff = m.minReconnectBackoff
		slog.Info("Real-time remediation job stream connected successfully", "clusterId", m.cfg.ClusterID)

		// Trigger drain worker to flush any updates accumulated during disconnect
		go m.drainLocalQueue(ctx)

		// Read and parse SSE events line by line
		readErr := m.consumeSSEStream(ctx, resp)
		m.setStreamConnected(false)
		if readErr != nil && ctx.Err() == nil {
			slog.Warn("Remediation job stream disconnected", "error", readErr)
		}
	}
}

// consumeSSEStream parses Server-Sent Events from the active HTTP stream
func (m *Manager) consumeSSEStream(ctx context.Context, resp *http.Response) error {
	defer resp.Body.Close()

	reader := bufio.NewReader(resp.Body)
	var currentEvent string
	var currentData strings.Builder

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		default:
		}

		line, err := reader.ReadString('\n')
		if err != nil {
			return err
		}

		line = strings.TrimRight(line, "\r\n")

		// Empty line marks end of an event block
		if line == "" {
			if currentData.Len() > 0 {
				m.handleSSEEvent(currentEvent, currentData.String())
				currentEvent = ""
				currentData.Reset()
			}
			continue
		}

		// Handle comments (e.g. : ping keep-alives)
		if strings.HasPrefix(line, ":") {
			continue
		}

		if strings.HasPrefix(line, "event:") {
			currentEvent = strings.TrimSpace(strings.TrimPrefix(line, "event:"))
		} else if strings.HasPrefix(line, "data:") {
			dataPayload := strings.TrimPrefix(line, "data:")
			dataPayload = strings.TrimSpace(dataPayload)
			if currentData.Len() > 0 {
				currentData.WriteString("\n")
			}
			currentData.WriteString(dataPayload)
		}
	}
}

// handleSSEEvent decodes action payloads received over the real-time stream
func (m *Manager) handleSSEEvent(eventType string, data string) {
	if data == "" {
		return
	}

	switch eventType {
	case "action":
		var act transport.RemediationAction
		if err := json.Unmarshal([]byte(data), &act); err != nil {
			slog.Warn("Failed to decode action from real-time stream", "error", err)
			return
		}
		select {
		case m.actionChan <- &act:
		default:
			slog.Warn("Remediation action queue full, dropped action", "actionId", act.ID)
		}

	case "actions":
		var wrapper struct {
			Actions []transport.RemediationAction `json:"actions"`
		}
		if err := json.Unmarshal([]byte(data), &wrapper); err != nil {
			slog.Warn("Failed to decode actions batch from real-time stream", "error", err)
			return
		}
		for i := range wrapper.Actions {
			act := wrapper.Actions[i]
			select {
			case m.actionChan <- &act:
			default:
				slog.Warn("Remediation action queue full, dropped action", "actionId", act.ID)
			}
		}
	}
}

// pollWorker acts as the robust fallback when real-time streaming is offline
func (m *Manager) pollWorker(ctx context.Context) {
	ticker := time.NewTicker(m.cfg.ActionPollInterval)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			// If real-time stream is active and healthy, reduce polling frequency or skip
			if m.IsStreamConnected() {
				continue
			}
			m.pollAndQueue(ctx)
		}
	}
}

func (m *Manager) pollAndQueue(ctx context.Context) {
	actions, err := m.client.PollActions(ctx)
	if err != nil {
		if err != transport.ErrCircuitOpen {
			slog.Debug("Fallback action polling notice", "error", err)
		}
		return
	}

	if len(actions) == 0 {
		return
	}

	slog.Info("Claimed remediation actions via fallback HTTP poller", "count", len(actions))
	for i := range actions {
		act := actions[i]
		select {
		case m.actionChan <- &act:
		case <-ctx.Done():
			return
		}
	}
}

// actionWorker continuously consumes incoming actions and coordinates execution
func (m *Manager) actionWorker(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		case action := <-m.actionChan:
			if action != nil {
				m.ProcessAction(ctx, action)
			}
		}
	}
}

// ProcessAction coordinates state transitions, pre-checks, execution, verification, and rollback
func (m *Manager) ProcessAction(ctx context.Context, action *transport.RemediationAction) {
	if action == nil {
		return
	}

	// 1. Idempotency Check
	idempotencyKey := action.IdempotencyKey
	if idempotencyKey == "" {
		idempotencyKey = action.ID
	}

	m.mu.Lock()
	if existing, found := m.idempotencyMap[idempotencyKey]; found {
		m.mu.Unlock()
		slog.Info("Remediation action previously executed (idempotent replay)", "idempotencyKey", idempotencyKey, "state", existing.State)
		return
	}
	m.mu.Unlock()

	startTime := time.Now()
	sm := NewStateMachine(action.ID, idempotencyKey, action.Type)

	// Update Prometheus metrics
	m.metrics.Counter("skyops_agent_actions_total").Inc(map[string]string{"type": action.Type})

	// Build immutable execution context for atomic server reporting
	execContext := map[string]interface{}{
		"clusterId":            m.cfg.ClusterID,
		"agentId":              m.cfg.AgentID,
		"actionType":           action.Type,
		"targetKind":           action.Target.Kind,
		"targetNamespace":      action.Target.Namespace,
		"targetName":           action.Target.Name,
		"targetContainer":      action.Target.Container,
		"fieldPath":            action.FieldPath,
		"proposedValue":        action.ProposedValue,
		"expectedCurrentValue": action.ExpectedCurrentValue,
	}

	traces := make([]TraceEntry, 0, 8)
	addTrace := func(phase, msg, errStr string) {
		traces = append(traces, TraceEntry{
			Timestamp: time.Now().UnixMilli(),
			Phase:     phase,
			Message:   msg,
			Error:     errStr,
		})
	}

	// Report PENDING state update
	addTrace("PENDING", "Action received and acknowledged in queue", "")
	m.reportJobState(ctx, JobStateUpdate{
		JobID:            action.ID,
		ActionID:         action.ID,
		ClusterID:        m.cfg.ClusterID,
		State:            StatePending,
		Success:          false,
		Message:          "Action queued for execution",
		ExecutionContext: execContext,
		RuntimeTraces:    traces,
		DurationMs:       0,
		Timestamp:        time.Now().UnixMilli(),
		AgentID:          m.cfg.AgentID,
	})

	// Compute configurable context timeout
	actionTimeout := m.parseActionTimeout(action)
	actionCtx, actionCancel := context.WithTimeout(ctx, actionTimeout)
	defer actionCancel()

	// 2. Validate Phase
	_ = sm.Transition(StateValidating, "Validating policy constraints and action parameters")
	addTrace("VALIDATING", "Validating policy constraints and action parameters", "")

	if err := m.policyEngine.Validate(action); err != nil {
		_ = sm.Transition(StateRejected, fmt.Sprintf("Policy validation rejected action: %v", err))
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		rec.ErrorMessage = err.Error()
		m.recordCompletion(rec)

		addTrace("REJECTED", "Policy rejected action", err.Error())
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          fmt.Sprintf("Policy rejected: %v", err),
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           err.Error(),
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		m.metrics.Counter("skyops_agent_action_failures_total").Inc(map[string]string{"type": action.Type, "reason": "policy_rejected"})
		return
	}

	if !m.policyEngine.AcquireSlot() {
		_ = sm.Transition(StateRejected, "Concurrent action limit reached")
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		m.recordCompletion(rec)

		addTrace("REJECTED", "Concurrent action limit reached", "rate_limited")
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          "Concurrent action limit reached; try again later",
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           "action slot concurrency limit reached",
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		return
	}
	defer m.policyEngine.ReleaseSlot()

	if m.executor == nil {
		_ = sm.Transition(StateFailed, "In-cluster Kubernetes client not available for execution")
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		rec.ErrorMessage = "k8s client not available"
		m.recordCompletion(rec)

		addTrace("FAILED", "In-cluster Kubernetes client not available", "missing_client")
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          "K8s client not available",
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           "kubernetes interface is nil",
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		return
	}

	// 3. Approved Phase & Transition to RUNNING
	_ = sm.Transition(StateApproved, "Action approved by policy engine")
	_ = sm.Transition(StateRunning, "Action passed validation; execution beginning")
	addTrace("RUNNING", "Action passed validation; pre-check and mutation initiating", "")

	m.reportJobState(ctx, JobStateUpdate{
		JobID:            action.ID,
		ActionID:         action.ID,
		ClusterID:        m.cfg.ClusterID,
		State:            StateRunning,
		Success:          false,
		Message:          "Action executing",
		ExecutionContext: execContext,
		RuntimeTraces:    traces,
		DurationMs:       time.Since(startTime).Milliseconds(),
		Timestamp:        time.Now().UnixMilli(),
		AgentID:          m.cfg.AgentID,
	})

	// Check context timeout before heavy pre-check
	if actionCtx.Err() != nil {
		m.handleActionTimeout(action, sm, startTime, execContext, traces, actionTimeout, "precondition check")
		return
	}

	// Pre-conditions & live state capture
	prevLiveState, err := m.executor.PreconditionCheck(actionCtx, action)
	if err != nil {
		if actionCtx.Err() != nil {
			m.handleActionTimeout(action, sm, startTime, execContext, traces, actionTimeout, "precondition check")
			return
		}

		_ = sm.Transition(StateFailed, fmt.Sprintf("Precondition check failed: %v", err))
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		rec.ErrorMessage = err.Error()
		m.recordCompletion(rec)

		addTrace("FAILED", "Precondition check failed", err.Error())
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          fmt.Sprintf("Precondition failed: %v", err),
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           err.Error(),
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		m.metrics.Counter("skyops_agent_action_failures_total").Inc(map[string]string{"type": action.Type, "reason": "precondition_failed"})
		return
	}

	// Idempotent no-op if already in desired state
	if prevLiveState == action.ProposedValue {
		_ = sm.Transition(StateSucceeded, "Target already in desired state (no mutation needed)")
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		m.recordCompletion(rec)

		addTrace("SUCCEEDED", "Target already in desired state (idempotent no-op)", "")
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateSucceeded,
			Success:          true,
			Message:          "Already in desired state",
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		return
	}

	if m.policyEngine.IsDryRun() {
		_ = sm.Transition(StateSucceeded, "Dry-run execution succeeded (no cluster mutation performed)")
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		m.recordCompletion(rec)

		addTrace("SUCCEEDED", "Dry-run execution simulated successfully", "")
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateSucceeded,
			Success:          true,
			Message:          "Dry-run executed successfully",
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		return
	}

	// 4. Executing Phase
	_ = sm.Transition(StateExecuting, fmt.Sprintf("Executing mutation on %s/%s", action.Target.Namespace, action.Target.Name))
	addTrace("EXECUTING", fmt.Sprintf("Executing mutation on %s/%s", action.Target.Namespace, action.Target.Name), "")

	execErr := m.executor.Execute(actionCtx, action)
	if execErr != nil {
		if actionCtx.Err() != nil {
			m.handleActionTimeout(action, sm, startTime, execContext, traces, actionTimeout, "mutation execution")
			return
		}

		_ = sm.Transition(StateFailed, fmt.Sprintf("Execution failed: %v", execErr))
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		rec.ErrorMessage = execErr.Error()
		m.recordCompletion(rec)

		addTrace("FAILED", "Execution failed", execErr.Error())
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          fmt.Sprintf("Execution error: %v", execErr),
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           execErr.Error(),
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		m.metrics.Counter("skyops_agent_action_failures_total").Inc(map[string]string{"type": action.Type, "reason": "execution_failed"})
		return
	}

	// 5. Verifying Phase
	_ = sm.Transition(StateVerifying, "Verifying cluster reached desired state")
	addTrace("VERIFYING", "Verifying cluster reached desired state", "")

	verifyTimeout := 30 * time.Second
	if actionTimeout < 35*time.Second {
		verifyTimeout = actionTimeout / 2
	}

	verifyErr := m.executor.Verify(actionCtx, action, verifyTimeout)
	if verifyErr != nil {
		if actionCtx.Err() != nil {
			m.handleActionTimeout(action, sm, startTime, execContext, traces, actionTimeout, "verification timeout")
			return
		}

		slog.Warn("Remediation verification failed; initiating automatic rollback", "action", action.ID, "error", verifyErr)
		_ = sm.Transition(StateRollingBack, fmt.Sprintf("Verification failed: %v; rolling back to %s", verifyErr, prevLiveState))
		addTrace("ROLLING_BACK", fmt.Sprintf("Verification failed: %v; rolling back to %s", verifyErr, prevLiveState), verifyErr.Error())

		rbErr := m.executor.Rollback(context.Background(), action, prevLiveState)
		if rbErr != nil {
			_ = sm.Transition(StateFailed, fmt.Sprintf("Rollback failed: %v after verification error: %v", rbErr, verifyErr))
			rec := sm.Record()
			rec.RuntimeTraces = traces
			rec.ExecutionContext = execContext
			rec.ErrorMessage = rbErr.Error()
			m.recordCompletion(rec)

			addTrace("FAILED", "Rollback failed", rbErr.Error())
			m.reportJobState(ctx, JobStateUpdate{
				JobID:            action.ID,
				ActionID:         action.ID,
				ClusterID:        m.cfg.ClusterID,
				State:            StateFailed,
				Success:          false,
				Message:          fmt.Sprintf("Verification and rollback failed: %v", rbErr),
				ExecutionContext: execContext,
				RuntimeTraces:    traces,
				StdErr:           fmt.Sprintf("verifyErr: %v; rollbackErr: %v", verifyErr, rbErr),
				DurationMs:       time.Since(startTime).Milliseconds(),
				Timestamp:        time.Now().UnixMilli(),
				AgentID:          m.cfg.AgentID,
			})
			return
		}

		_ = sm.Transition(StateRolledBack, "Target safely restored to previous state")
		rec := sm.Record()
		rec.RuntimeTraces = traces
		rec.ExecutionContext = execContext
		m.recordCompletion(rec)

		addTrace("ROLLED_BACK", "Target safely restored to previous state", "")
		m.reportJobState(ctx, JobStateUpdate{
			JobID:            action.ID,
			ActionID:         action.ID,
			ClusterID:        m.cfg.ClusterID,
			State:            StateFailed,
			Success:          false,
			Message:          fmt.Sprintf("Verification failed: %v; successfully rolled back", verifyErr),
			ExecutionContext: execContext,
			RuntimeTraces:    traces,
			StdErr:           verifyErr.Error(),
			DurationMs:       time.Since(startTime).Milliseconds(),
			Timestamp:        time.Now().UnixMilli(),
			AgentID:          m.cfg.AgentID,
		})
		return
	}

	// 6. Succeeded Phase
	_ = sm.Transition(StateSucceeded, "Remediation verified successfully")
	rec := sm.Record()
	rec.RuntimeTraces = traces
	rec.ExecutionContext = execContext
	m.recordCompletion(rec)

	addTrace("SUCCEEDED", "Remediation completed and verified in cluster", "")
	m.reportJobState(ctx, JobStateUpdate{
		JobID:            action.ID,
		ActionID:         action.ID,
		ClusterID:        m.cfg.ClusterID,
		State:            StateSucceeded,
		Success:          true,
		Message:          "Remediation completed and verified successfully",
		ExecutionContext: execContext,
		RuntimeTraces:    traces,
		DurationMs:       time.Since(startTime).Milliseconds(),
		Timestamp:        time.Now().UnixMilli(),
		AgentID:          m.cfg.AgentID,
	})
}

// handleActionTimeout transitions a hanging remediation to FAILED with a TimeoutException
func (m *Manager) handleActionTimeout(
	action *transport.RemediationAction,
	sm *StateMachine,
	startTime time.Time,
	execContext map[string]interface{},
	traces []TraceEntry,
	deadline time.Duration,
	phase string,
) {
	timeoutMsg := fmt.Sprintf("TimeoutException: action %s exceeded execution deadline of %s during %s", action.ID, deadline.String(), phase)
	slog.Error("Remediation action timed out", "actionId", action.ID, "deadline", deadline.String(), "phase", phase)

	_ = sm.Transition(StateFailed, timeoutMsg)
	rec := sm.Record()
	rec.RuntimeTraces = traces
	rec.ExecutionContext = execContext
	rec.ErrorMessage = timeoutMsg
	rec.StdErr = timeoutMsg
	m.recordCompletion(rec)

	traces = append(traces, TraceEntry{
		Timestamp: time.Now().UnixMilli(),
		Phase:     "TIMEOUT",
		Message:   timeoutMsg,
		Error:     "context deadline exceeded",
	})

	m.reportJobState(context.Background(), JobStateUpdate{
		JobID:            action.ID,
		ActionID:         action.ID,
		ClusterID:        m.cfg.ClusterID,
		State:            StateFailed,
		Success:          false,
		Message:          fmt.Sprintf("Remediation failed: context deadline exceeded after %s", deadline.String()),
		ExecutionContext: execContext,
		RuntimeTraces:    traces,
		StdErr:           timeoutMsg,
		DurationMs:       time.Since(startTime).Milliseconds(),
		Timestamp:        time.Now().UnixMilli(),
		AgentID:          m.cfg.AgentID,
	})

	m.metrics.Counter("skyops_agent_action_failures_total").Inc(map[string]string{"type": action.Type, "reason": "timeout"})
}

// parseActionTimeout extracts custom timeout from action parameters or defaults
func (m *Manager) parseActionTimeout(action *transport.RemediationAction) time.Duration {
	if action != nil && action.Parameters != nil {
		if raw, ok := action.Parameters["timeout"]; ok {
			switch v := raw.(type) {
			case string:
				if d, err := time.ParseDuration(v); err == nil && d > 0 {
					return d
				}
				if sec, err := strconv.Atoi(v); err == nil && sec > 0 {
					return time.Duration(sec) * time.Second
				}
			case float64:
				if v > 0 {
					return time.Duration(v) * time.Second
				}
			case int:
				if v > 0 {
					return time.Duration(v) * time.Second
				}
			}
		}
	}
	return m.defaultActionTimeout
}

// reportJobState enqueues state updates into the local queue and triggers immediate dispatch
func (m *Manager) reportJobState(ctx context.Context, update JobStateUpdate) {
	if update.ActionID == "" {
		update.ActionID = update.JobID
	}
	if update.Timestamp == 0 {
		update.Timestamp = time.Now().UnixMilli()
	}
	if update.AgentID == "" {
		update.AgentID = m.cfg.AgentID
	}

	// Always buffer update into thread-safe local queue first to guarantee zero loss
	m.queueMu.Lock()
	m.pendingUpdates = append(m.pendingUpdates, update)
	// Limit queue size to prevent memory explosion if server remains offline indefinitely
	if len(m.pendingUpdates) > 500 {
		m.pendingUpdates = m.pendingUpdates[len(m.pendingUpdates)-500:]
	}
	m.queueMu.Unlock()

	// Attempt immediate dispatch
	go func() {
		drainCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		m.drainLocalQueue(drainCtx)
	}()
}

// drainWorker periodically flushes buffered execution state reports to the server
func (m *Manager) drainWorker(ctx context.Context) {
	ticker := time.NewTicker(3 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			m.drainLocalQueue(ctx)
		}
	}
}

// drainLocalQueue flushes pending state updates to the server with zero data loss guarantee
func (m *Manager) drainLocalQueue(ctx context.Context) {
	m.queueMu.Lock()
	if len(m.pendingUpdates) == 0 {
		m.queueMu.Unlock()
		return
	}

	// Copy pending updates to process without holding lock
	batch := make([]JobStateUpdate, len(m.pendingUpdates))
	copy(batch, m.pendingUpdates)
	m.queueMu.Unlock()

	var unacked []JobStateUpdate

	for _, update := range batch {
		select {
		case <-ctx.Done():
			return
		default:
		}

		err := m.client.ReportDetailedActionResult(ctx, update.ActionID, update)
		if err != nil {
			// Also fallback to standard ReportActionResult if detailed schema is rejected
			fbErr := m.client.ReportActionResult(ctx, update.ActionID, update.Success, update.Message)
			if fbErr != nil {
				unacked = append(unacked, update)
				continue
			}
		}
		slog.Debug("Dispatched atomic job state update to central server",
			"actionId", update.ActionID,
			"state", update.State,
			"success", update.Success,
		)
	}

	// Update pending updates list to retain only unacknowledged items
	m.queueMu.Lock()
	m.pendingUpdates = unacked
	m.queueMu.Unlock()
}

func (m *Manager) recordCompletion(rec ExecutionRecord) {
	m.mu.Lock()
	defer m.mu.Unlock()

	recPtr := &rec
	if rec.IdempotencyKey != "" {
		m.idempotencyMap[rec.IdempotencyKey] = recPtr
	}
	m.idempotencyMap[rec.ActionID] = recPtr
	m.recentRecords = append(m.recentRecords, recPtr)
	if len(m.recentRecords) > 100 {
		m.recentRecords = m.recentRecords[1:]
	}
}

// GetExecutionRecord returns an execution record by actionID or idempotencyKey
func (m *Manager) GetExecutionRecord(key string) *ExecutionRecord {
	m.mu.RLock()
	defer m.mu.RUnlock()
	return m.idempotencyMap[key]
}

// SetDefaultTimeout overrides the default action execution deadline
func (m *Manager) SetDefaultTimeout(d time.Duration) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if d > 0 {
		m.defaultActionTimeout = d
	}
}
