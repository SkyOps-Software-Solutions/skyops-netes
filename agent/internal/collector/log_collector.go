package collector

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/metrics"
	"github.com/skyops-io/skyops/agent/internal/transport"
)

// LogCollector coordinates continuous log streaming, on-demand pod log retrieval, and diagnostic capture
type LogCollector struct {
	cfg            *config.Config
	client         *transport.Client
	k8sClient      *InClusterK8sClient
	metrics        *metrics.Registry
	reqQueue       chan transport.LogRequest
	workersRunning bool
	workerWg       sync.WaitGroup
	mu             sync.Mutex

	// Continuous collection tracking
	checkpointsMu sync.RWMutex
	checkpoints   map[string]int64 // key: namespace/pod/container -> last collected epoch seconds
	restartCounts map[string]int   // key: namespace/pod/container -> last observed restart count
}

func NewLogCollector(cfg *config.Config, client *transport.Client, k8sClient *InClusterK8sClient, m *metrics.Registry) *LogCollector {
	if m == nil {
		m = metrics.Default
	}
	return &LogCollector{
		cfg:           cfg,
		client:        client,
		k8sClient:     k8sClient,
		metrics:       m,
		reqQueue:      make(chan transport.LogRequest, 32), // Bounded worker channel to prevent unbounded memory growth
		checkpoints:   make(map[string]int64),
		restartCounts: make(map[string]int),
	}
}

// Start begins periodic polling for on-demand pod log requests and starts continuous container log collection
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

	// Launch continuous container log collection background routine
	continuousInterval := 10 * time.Second
	if l.cfg.TelemetryInterval > 0 {
		continuousInterval = l.cfg.TelemetryInterval
	}
	if continuousInterval < 5*time.Second {
		continuousInterval = 5 * time.Second
	}
	go l.runContinuousCollectionLoop(ctx, continuousInterval)

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

func (l *LogCollector) isNamespaceAllowed(ns string) bool {
	if ns == "" {
		return true
	}
	if strings.HasPrefix(ns, "kube-node-lease") {
		return false
	}
	for _, excl := range l.cfg.ExcludedNamespaces {
		if strings.EqualFold(strings.TrimSpace(excl), ns) {
			return false
		}
	}
	if len(l.cfg.IncludedNamespaces) > 0 {
		for _, incl := range l.cfg.IncludedNamespaces {
			if strings.EqualFold(strings.TrimSpace(incl), ns) {
				return true
			}
		}
		return false
	}
	return true
}

func (l *LogCollector) runContinuousCollectionLoop(ctx context.Context, interval time.Duration) {
	ticker := time.NewTicker(interval)
	defer ticker.Stop()

	// Initial collection pass after short delay to let cluster connection settle
	select {
	case <-ctx.Done():
		return
	case <-time.After(1 * time.Second):
		l.collectContinuousLogs(ctx)
	}

	for {
		select {
		case <-ctx.Done():
			return
		case <-ticker.C:
			l.collectContinuousLogs(ctx)
		}
	}
}

func (l *LogCollector) collectContinuousLogs(ctx context.Context) {
	if l.k8sClient == nil {
		return
	}

	// 1. Discover pods across namespaces with bounded timeout
	listCtx, listCancel := context.WithTimeout(ctx, 15*time.Second)
	var podList K8sPodList
	status, err := l.k8sClient.GetJSONWithStatus(listCtx, "/api/v1/pods", &podList)
	listCancel()

	if err != nil {
		if status == http.StatusUnauthorized || status == http.StatusForbidden {
			slog.Debug("Continuous log collection skipped: permission denied on /api/v1/pods")
		} else {
			slog.Debug("Continuous log collection pod discovery notice", "status", status, "error", err)
		}
		return
	}

	if len(podList.Items) == 0 {
		return
	}

	nowSec := time.Now().Unix()
	activeKeys := make(map[string]bool)

	// Bounded concurrency pool for continuous log scraping (max 4 concurrent fetches)
	sem := make(chan struct{}, 4)
	var wg sync.WaitGroup

	for _, pod := range podList.Items {
		ns := pod.Metadata.Namespace
		if ns == "" {
			ns = "default"
		}

		if !l.isNamespaceAllowed(ns) {
			continue
		}

		// Track restart counts per container
		restarts := make(map[string]int)
		for _, cs := range pod.Status.ContainerStatuses {
			restarts[cs.Name] = cs.RestartCount
		}

		for _, c := range pod.Spec.Containers {
			containerName := c.Name
			key := fmt.Sprintf("%s/%s/%s", ns, pod.Metadata.Name, containerName)
			activeKeys[key] = true

			l.checkpointsMu.RLock()
			lastCollectedSec, exists := l.checkpoints[key]
			lastRestartCount, hasRestart := l.restartCounts[key]
			l.checkpointsMu.RUnlock()

			currentRestart := restarts[containerName]
			shouldCollectPrevious := hasRestart && currentRestart > lastRestartCount

			var sinceSec int
			var tailLines int
			if !exists {
				// First scrape: bounded recent history (last 5 min or 100 lines)
				sinceSec = 300
				tailLines = 100
			} else {
				diff := int(nowSec - lastCollectedSec)
				if diff < 2 {
					diff = 2
				}
				sinceSec = diff + 3 // 3-second grace overlap to avoid gaps
				if sinceSec > 600 {
					sinceSec = 600
				}
				tailLines = 250
			}

			// If container restarted, collect previous container crash logs
			if shouldCollectPrevious {
				wg.Add(1)
				go func(pNamespace, pPod, pContainer string) {
					defer wg.Done()
					select {
					case <-ctx.Done():
						return
					case sem <- struct{}{}:
					}
					defer func() { <-sem }()

					prevCtx, prevCancel := context.WithTimeout(ctx, 10*time.Second)
					defer prevCancel()

					prevRes, prevErr := l.k8sClient.GetPodLogs(prevCtx, pNamespace, pPod, PodLogOptions{
						Container:    pContainer,
						Previous:     true,
						TailLines:    150,
						Timestamps:   true,
						SinceSeconds: 600,
						LimitBytes:   256 * 1024,
					})
					if prevErr == nil && prevRes != nil && len(prevRes.Logs) > 0 {
						sendCtx, sendCancel := context.WithTimeout(ctx, 10*time.Second)
						_ = l.client.SendPodLogs(sendCtx, transport.LogIngestPayload{
							Namespace: pNamespace,
							PodName:   pPod,
							Container: pContainer,
							Logs:      prevRes.Logs,
							Previous:  true,
							Status:    prevRes.Status,
						})
						sendCancel()
					}
				}(ns, pod.Metadata.Name, containerName)
			}

			// Scrape current logs
			wg.Add(1)
			go func(pNamespace, pPod, pContainer string, pSinceSec, pTailLines, pCurrentRestart int, pKey string) {
				defer wg.Done()
				select {
				case <-ctx.Done():
					return
				case sem <- struct{}{}:
				}
				defer func() { <-sem }()

				fetchCtx, fetchCancel := context.WithTimeout(ctx, 10*time.Second)
				defer fetchCancel()

				res, fetchErr := l.k8sClient.GetPodLogs(fetchCtx, pNamespace, pPod, PodLogOptions{
					Container:    pContainer,
					Previous:     false,
					TailLines:    pTailLines,
					Timestamps:   true,
					SinceSeconds: pSinceSec,
					LimitBytes:   256 * 1024,
				})

				if fetchErr == nil && res != nil {
					if len(res.Logs) > 0 {
						sendCtx, sendCancel := context.WithTimeout(ctx, 10*time.Second)
						sendErr := l.client.SendPodLogs(sendCtx, transport.LogIngestPayload{
							Namespace: pNamespace,
							PodName:   pPod,
							Container: pContainer,
							Logs:      res.Logs,
							Previous:  false,
							Status:    res.Status,
						})
						sendCancel()
						if sendErr != nil {
							slog.Debug("Continuous log forward notice", "key", pKey, "error", sendErr)
						}
					}

					if res.Status == "SUCCESS" || res.Status == "NO_LOGS" || res.Status == "EMPTY_LOGS" {
						l.checkpointsMu.Lock()
						l.checkpoints[pKey] = time.Now().Unix()
						l.restartCounts[pKey] = pCurrentRestart
						l.checkpointsMu.Unlock()
					}
				}
			}(ns, pod.Metadata.Name, containerName, sinceSec, tailLines, currentRestart, key)
		}
	}

	wg.Wait()

	// Prune inactive pod checkpoints to prevent memory growth
	l.checkpointsMu.Lock()
	for k := range l.checkpoints {
		if !activeKeys[k] {
			delete(l.checkpoints, k)
			delete(l.restartCounts, k)
		}
	}
	l.checkpointsMu.Unlock()
}

