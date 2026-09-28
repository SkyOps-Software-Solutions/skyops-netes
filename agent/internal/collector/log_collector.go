package collector

import (
	"context"
	"log/slog"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/metrics"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// LogCollector coordinates on-demand and diagnostic Kubernetes container log retrieval
type LogCollector struct {
	cfg            *config.Config
	client         *transport.Client
	k8sClient      *InClusterK8sClient
	metrics        *metrics.Registry
	reqQueue       chan transport.LogRequest
	workersRunning bool
	workerWg       sync.WaitGroup
	mu             sync.Mutex
}

func NewLogCollector(cfg *config.Config, client *transport.Client, k8sClient *InClusterK8sClient, m *metrics.Registry) *LogCollector {
	if m == nil {
		m = metrics.Default
	}
	return &LogCollector{
		cfg:       cfg,
		client:    client,
		k8sClient: k8sClient,
		metrics:   m,
		reqQueue:  make(chan transport.LogRequest, 32), // Bounded worker channel to prevent unbounded memory growth
	}
}

// Start begins periodic polling for on-demand pod log retrieval requests
func (l *LogCollector) Start(ctx context.Context) {
	if l.k8sClient == nil {
		slog.Warn("Log collector disabled (no in-cluster Kubernetes client available)")
		return
	}

	pollInterval := l.cfg.LogPollInterval
	if pollInterval <= 0 {
		pollInterval = 2 * time.Second
	}

	ticker := time.NewTicker(pollInterval)
	defer ticker.Stop()

	slog.Info("Kubernetes pod log collector started", "pollInterval", pollInterval.String())

	// Initialize worker pool for processing on-demand log requests
	const workerCount = 4
	l.mu.Lock()
	l.workersRunning = true
	l.mu.Unlock()

	for i := 0; i < workerCount; i++ {
		l.workerWg.Add(1)
		go func(workerID int) {
			defer l.workerWg.Done()
			for {
				select {
				case <-ctx.Done(): // Context cancellation guard: cleanly terminate worker goroutine to prevent leaks
					return
				case req, ok := <-l.reqQueue:
					if !ok {
						return
					}
					l.processLogRequest(ctx, req)
				}
			}
		}(i)
	}

	defer func() {
		l.mu.Lock()
		l.workersRunning = false
		l.mu.Unlock()
		// Clean teardown: wait for all worker goroutines to terminate cleanly
		l.workerWg.Wait()
	}()

	for {
		select {
		case <-ctx.Done():
			slog.Info("Kubernetes pod log collector shutting down")
			return
		case <-ticker.C:
			l.pollAndProcess(ctx)
		}
	}
}

func (l *LogCollector) pollAndProcess(ctx context.Context) {
	// 1. Process log requests with strict context timeout to prevent hanging reads
	pollCtx, pollCancel := context.WithTimeout(ctx, 10*time.Second)
	requests, err := l.client.PollLogRequests(pollCtx)
	pollCancel()

	if err != nil {
		if err != transport.ErrCircuitOpen {
			slog.Debug("Log request polling notice", "error", err)
		}
	} else if len(requests) > 0 {
		slog.Info("Received on-demand pod log collection requests", "count", len(requests))

		l.mu.Lock()
		running := l.workersRunning
		l.mu.Unlock()

		for _, req := range requests {
			if running {
				select {
				case <-ctx.Done(): // Context cancellation guard
					return
				case l.reqQueue <- req:
				default:
					// Bounded worker channel saturated: process inline with context guard to avoid drop
					l.processLogRequest(ctx, req)
				}
			} else {
				// Standalone or direct execution (e.g. tests)
				l.processLogRequest(ctx, req)
			}
		}
	}

	// 2. Process metrics server live verification requests with strict context timeout
	l.pollMetricsServerVerification(ctx)
}

func (l *LogCollector) pollMetricsServerVerification(ctx context.Context) {
	// Strict context timeout to prevent blocking on slow networks
	pollCtx, pollCancel := context.WithTimeout(ctx, 10*time.Second)
	reqs, err := l.client.PollMetricsServerVerificationRequests(pollCtx)
	pollCancel()

	if err != nil {
		if err != transport.ErrCircuitOpen {
			slog.Debug("Metrics server verification polling notice", "error", err)
		}
		return
	}
	if len(reqs) == 0 {
		return
	}

	slog.Info("Received Metrics Server live verification requests", "count", len(reqs))
	for _, req := range reqs {
		select {
		case <-ctx.Done(): // Goroutine leak prevention
			return
		default:
		}

		// Enforce strict timeout for each verification query to prevent hung execution
		vCtx, vCancel := context.WithTimeout(ctx, 15*time.Second)
		result := VerifyMetricsServer(vCtx, l.k8sClient, l.cfg.ClusterID, req.ID)
		if sendErr := l.client.SendMetricsServerVerificationResult(vCtx, result); sendErr != nil {
			slog.Warn("Failed to send metrics server verification result to backend", "requestId", req.ID, "error", sendErr)
		} else {
			slog.Info("Successfully sent metrics server verification result", "requestId", req.ID, "status", result.Status)
		}
		vCancel()
	}
}

func (l *LogCollector) processLogRequest(ctx context.Context, req transport.LogRequest) {
	select {
	case <-ctx.Done(): // Context cancellation guard
		return
	default:
	}

	tailLines := req.TailLines
	if tailLines <= 0 {
		tailLines = l.cfg.MaxLogTailLines
	}
	if tailLines > 1000 {
		tailLines = 1000
	}

	limitBytes := req.LimitBytes
	if limitBytes <= 0 {
		limitBytes = l.cfg.MaxLogBytes
	}
	if limitBytes > 1024*1024 {
		limitBytes = 1024 * 1024
	}

	timeout := l.cfg.LogRequestTimeout
	if timeout <= 0 {
		timeout = 10 * time.Second
	}

	// Strict context timeout per log extraction request to prevent hanging reads
	reqCtx, reqCancel := context.WithTimeout(ctx, timeout)
	defer reqCancel()

	opts := PodLogOptions{
		Container:    req.Container,
		TailLines:    tailLines,
		Previous:     req.Previous,
		Timestamps:   req.Timestamps,
		SinceSeconds: req.SinceSeconds,
		LimitBytes:   limitBytes,
		Timeout:      timeout,
	}

	res, err := l.k8sClient.GetPodLogs(reqCtx, req.Namespace, req.PodName, opts)
	if err != nil {
		slog.Error("Failed to retrieve container logs from Kubernetes API",
			"namespace", req.Namespace,
			"pod", req.PodName,
			"container", req.Container,
			"error", err,
		)
		return
	}

	payload := transport.LogIngestPayload{
		RequestID:    req.ID,
		Namespace:    req.Namespace,
		PodName:      req.PodName,
		Container:    req.Container,
		Logs:         res.Logs,
		Previous:     req.Previous,
		Status:       res.Status,
		ErrorMessage: res.ErrorMessage,
	}

	// Strict timeout for forwarding logs to prevent network hangs
	sendCtx, sendCancel := context.WithTimeout(ctx, 15*time.Second)
	defer sendCancel()

	if sendErr := l.client.SendPodLogs(sendCtx, payload); sendErr != nil {
		slog.Warn("Failed to send pod logs to SkyOps backend",
			"namespace", req.Namespace,
			"pod", req.PodName,
			"container", req.Container,
			"error", sendErr,
		)
	} else {
		slog.Info("Successfully collected and forwarded pod logs",
			"namespace", req.Namespace,
			"pod", req.PodName,
			"container", req.Container,
			"status", res.Status,
			"lines", res.LinesReturned,
			"bytes", res.BytesRead,
			"previous", req.Previous,
		)
	}
}

