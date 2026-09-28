package transport

import (
	"errors"
	"fmt"
	"log/slog"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/types"
)

type CircuitState string

const (
	StateClosed   CircuitState = "CLOSED"
	StateOpen     CircuitState = "OPEN"
	StateHalfOpen CircuitState = "HALF_OPEN"
)

var ErrCircuitOpen = errors.New("circuit breaker is open: backend unreachable")

// Spooler defines the interface for persisting dropped/redirected telemetry batches during circuit open state
type Spooler interface {
	WriteBatch(batch *types.TelemetryBatch) error
}

// CircuitBreaker guards against cascading failures and unnecessary load during backend outages
type CircuitBreaker struct {
	mu                   sync.RWMutex
	state                CircuitState
	failureCount         int
	consecutiveSuccesses int
	threshold            int           // Consecutive failures to trip Closed -> Open
	successThreshold     int           // Consecutive successes in Half-Open to reset to Closed
	cooldown             time.Duration // Time to wait in Open before transitioning to Half-Open probe
	lastFailure          time.Time     // Timestamp of the most recent failure
	halfOpenMaxProbes    int           // Max probe requests allowed through in Half-Open
	halfOpenInFlight     int           // Active probe requests in Half-Open
	spooler              Spooler       // Disk spool fallback for dropped telemetry during outages
}

func NewCircuitBreaker(threshold int, cooldown time.Duration) *CircuitBreaker {
	if threshold <= 0 {
		threshold = 5
	}
	if cooldown <= 0 {
		cooldown = 30 * time.Second
	}
	return &CircuitBreaker{
		state:             StateClosed,
		threshold:         threshold,
		successThreshold:  1, // 1 success resets to closed (backward-compatible; configurable via SetSuccessThreshold)
		cooldown:          cooldown,
		halfOpenMaxProbes: 1, // Allow 1 controlled probe through during Half-Open trial
	}
}

// SetSpooler registers a persistent disk spooler to buffer telemetry dropped while circuit is OPEN
func (cb *CircuitBreaker) SetSpooler(s Spooler) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.spooler = s
}

// SetSuccessThreshold sets how many consecutive successes are needed in Half-Open to close the circuit
func (cb *CircuitBreaker) SetSuccessThreshold(threshold int) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if threshold > 0 {
		cb.successThreshold = threshold
	}
}

// SetHalfOpenMaxProbes configures the controlled count of test requests allowed in Half-Open
func (cb *CircuitBreaker) SetHalfOpenMaxProbes(maxProbes int) {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if maxProbes > 0 {
		cb.halfOpenMaxProbes = maxProbes
	}
}

// Allow checks whether a request may proceed based on the circuit breaker state machine
func (cb *CircuitBreaker) Allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	now := time.Now()

	switch cb.state {
	case StateClosed:
		// Normal operation: all telemetry and requests are allowed through
		return true

	case StateOpen:
		// Atomic transition point: check if cooldown has elapsed to probe health
		if now.Sub(cb.lastFailure) >= cb.cooldown {
			cb.state = StateHalfOpen
			cb.halfOpenInFlight = 1 // Permit this probe request
			cb.consecutiveSuccesses = 0
			slog.Info("Circuit breaker cooldown elapsed: transitioned from OPEN to HALF_OPEN (probing backend health)",
				"cooldown", cb.cooldown.String(),
			)
			return true
		}
		// Still in cooldown: drop request
		return false

	case StateHalfOpen:
		// Controlled probe limiting: only permit up to halfOpenMaxProbes test requests through
		if cb.halfOpenInFlight < cb.halfOpenMaxProbes {
			cb.halfOpenInFlight++
			return true
		}
		// Probe quota saturated: reject subsequent requests until trial probe completes
		return false

	default:
		cb.state = StateClosed
		return true
	}
}

// RecordSuccess records a successful transmission and evaluates recovery transitions
func (cb *CircuitBreaker) RecordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	switch cb.state {
	case StateHalfOpen:
		if cb.halfOpenInFlight > 0 {
			cb.halfOpenInFlight--
		}
		cb.consecutiveSuccesses++
		// Atomic state transition: recover from HALF_OPEN to CLOSED upon consecutive successes
		if cb.consecutiveSuccesses >= cb.successThreshold {
			cb.state = StateClosed
			cb.failureCount = 0
			cb.consecutiveSuccesses = 0
			cb.halfOpenInFlight = 0
			slog.Info("Circuit breaker recovered: transitioned from HALF_OPEN to CLOSED",
				"consecutiveSuccesses", cb.consecutiveSuccesses,
			)
		}

	case StateClosed:
		// Reset transient failure counter on clean transmission
		cb.failureCount = 0
		cb.consecutiveSuccesses = 0

	case StateOpen:
		// Exceptional recovery
		cb.state = StateClosed
		cb.failureCount = 0
		cb.consecutiveSuccesses = 0
		cb.halfOpenInFlight = 0
	}
}

// RecordFailure records an error and evaluates circuit tripping transitions
func (cb *CircuitBreaker) RecordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()

	cb.lastFailure = time.Now()
	cb.consecutiveSuccesses = 0

	switch cb.state {
	case StateHalfOpen:
		// Atomic state transition: probe failed during HALF_OPEN, immediately trip back to OPEN
		cb.state = StateOpen
		cb.halfOpenInFlight = 0
		slog.Warn("Circuit breaker probe failed in HALF_OPEN; immediately tripped back to OPEN",
			"cooldown", cb.cooldown.String(),
		)

	case StateClosed:
		cb.failureCount++
		// Atomic state transition: failure threshold exceeded, trip from CLOSED to OPEN
		if cb.failureCount >= cb.threshold {
			cb.state = StateOpen
			slog.Warn("Circuit breaker failure threshold exceeded; tripped from CLOSED to OPEN",
				"failures", cb.failureCount,
				"threshold", cb.threshold,
				"cooldown", cb.cooldown.String(),
			)
		}

	case StateOpen:
		// Already OPEN: keep tracking latest failure timestamp to push back cooldown if needed
	}
}

// State returns current circuit state safely under read lock
func (cb *CircuitBreaker) State() CircuitState {
	cb.mu.RLock()
	defer cb.mu.RUnlock()
	return cb.state
}

// RedirectToSpool safely routes dropped or rejected telemetry batches to disk spool
// without throwing fatal panics or leaking memory during OPEN or degraded states
func (cb *CircuitBreaker) RedirectToSpool(batch *types.TelemetryBatch) error {
	if batch == nil {
		return nil // Guard against nil pointer panic
	}

	cb.mu.RLock()
	sp := cb.spooler
	state := cb.state
	cb.mu.RUnlock()

	if sp == nil {
		slog.Debug("Circuit open: telemetry batch dropped (no durable disk spooler attached)",
			"state", string(state),
			"clusterId", batch.ClusterID,
		)
		return ErrCircuitOpen
	}

	slog.Info("Circuit open: redirecting telemetry batch to persistent disk spool for offline durability",
		"state", string(state),
		"clusterId", batch.ClusterID,
		"itemCount", len(batch.Items),
	)

	// Persist batch to disk spool to prevent memory exhaustion
	if err := sp.WriteBatch(batch); err != nil {
		slog.Error("Failed to persist redirected telemetry batch to disk spool", "error", err)
		return fmt.Errorf("spool write error: %w", err)
	}

	return nil
}

// ExecuteWithSpoolFallback executes sendFn; if circuit is open or sendFn fails with an error,
// it cleanly redirects the batch to internal spool rather than causing panics or data loss
func (cb *CircuitBreaker) ExecuteWithSpoolFallback(batch *types.TelemetryBatch, sendFn func() error) error {
	if !cb.Allow() {
		// Circuit is open: cleanly redirect to disk spool
		return cb.RedirectToSpool(batch)
	}

	err := sendFn()
	if err != nil {
		cb.RecordFailure()
		// Network write failed: redirect batch to spool for offline buffering
		if spoolErr := cb.RedirectToSpool(batch); spoolErr != nil {
			return fmt.Errorf("send failed (%v) and spool redirect failed: %w", err, spoolErr)
		}
		return nil // Buffered safely in spool
	}

	cb.RecordSuccess()
	return nil
}

