package remediation

import (
	"time"

	"github.com/skyops-io/skyops/agent/internal/transport"
)

// ActionState represents the explicit lifecycle phase of a remediation action
type ActionState string

const (
	StateProposed    ActionState = "PROPOSED"
	StateValidating  ActionState = "VALIDATING"
	StateApproved    ActionState = "APPROVED"
	StateExecuting   ActionState = "EXECUTING"
	StateVerifying   ActionState = "VERIFYING"
	StateSucceeded   ActionState = "SUCCEEDED"
	StateFailed      ActionState = "FAILED"
	StateRejected    ActionState = "REJECTED"
	StateRollingBack ActionState = "ROLLING_BACK"
	StateRolledBack  ActionState = "ROLLED_BACK"

	// Central server job queue states
	StatePending   ActionState = "PENDING"
	StateRunning   ActionState = "RUNNING"
	StateCancelled ActionState = "CANCELLED"
)

// AuditLogEntry records an immutable record in the audit trail
type AuditLogEntry struct {
	Timestamp int64       `json:"timestamp"`
	FromState ActionState `json:"fromState"`
	ToState   ActionState `json:"toState"`
	Message   string      `json:"message"`
	Actor     string      `json:"actor,omitempty"`
}

// TraceEntry records detailed runtime phase execution milestones
type TraceEntry struct {
	Timestamp int64  `json:"timestamp"`
	Phase     string `json:"phase"`
	Message   string `json:"message"`
	Error     string `json:"error,omitempty"`
}

// JobStateUpdate represents an atomic state update dispatched to the central server job queue
type JobStateUpdate struct {
	JobID              string                  `json:"jobId"`
	ActionID           string                  `json:"actionId"`
	IncidentID         string                  `json:"incidentId,omitempty"`
	ExecutionID        string                  `json:"executionId,omitempty"`
	ActionType         string                  `json:"actionType,omitempty"`
	ClusterID          string                  `json:"clusterId"`
	Target             *transport.ActionTarget `json:"target,omitempty"`
	State              ActionState             `json:"state"` // PENDING, RUNNING, EXECUTING, VERIFYING, SUCCEEDED, FAILED, ROLLING_BACK, ROLLED_BACK
	Success            bool                    `json:"success"`
	Message            string                  `json:"message"`
	ExecutionContext   map[string]interface{}  `json:"executionContext,omitempty"`
	RuntimeTraces      []TraceEntry            `json:"runtimeTraces,omitempty"`
	VerificationResult map[string]interface{}  `json:"verificationResult,omitempty"`
	RollbackResult     map[string]interface{}  `json:"rollbackResult,omitempty"`
	StdErr             string                  `json:"stdErr,omitempty"`
	DurationMs         int64                   `json:"durationMs,omitempty"`
	Timestamp          int64                   `json:"timestamp"`
	AgentID            string                  `json:"agentId,omitempty"`
}

// ExecutionRecord stores complete lifecycle details of a remediation action
type ExecutionRecord struct {
	ActionID         string                 `json:"actionId"`
	IdempotencyKey   string                 `json:"idempotencyKey"`
	ActionType       string                 `json:"actionType"`
	State            ActionState            `json:"state"`
	StartTime        time.Time              `json:"startTime"`
	EndTime          *time.Time             `json:"endTime,omitempty"`
	AuditLog         []AuditLogEntry        `json:"auditLog"`
	RuntimeTraces    []TraceEntry           `json:"runtimeTraces,omitempty"`
	ExecutionContext map[string]interface{} `json:"executionContext,omitempty"`
	PreviousState    string                 `json:"previousState,omitempty"`
	ErrorMessage     string                 `json:"errorMessage,omitempty"`
	StdErr           string                 `json:"stdErr,omitempty"`
}
