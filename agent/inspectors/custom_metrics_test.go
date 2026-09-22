package inspectors

import (
	"strings"
	"testing"
)

func TestParsePrometheusMetrics(t *testing.T) {
	promText := `# HELP http_requests_total Total number of HTTP requests made.
# TYPE http_requests_total counter
http_requests_total{method="POST",handler="/api/login"} 1027 1726980000000
http_requests_total{method="GET",handler="/healthz"} 42100

# HELP node_cpu_utilization_ratio Current CPU utilization ratio.
# TYPE node_cpu_utilization_ratio gauge
node_cpu_utilization_ratio{node="worker-1",mode="idle"} 0.152
node_cpu_utilization_ratio{node="worker-1",mode="user"} 0.654
`

	points, err := ParsePrometheusMetrics(strings.NewReader(promText))
	if err != nil {
		t.Fatalf("failed to parse prometheus metrics: %v", err)
	}

	if len(points) != 4 {
		t.Fatalf("expected 4 metric data points, got %d", len(points))
	}

	p1 := points[0]
	if p1.Name != "http_requests_total" {
		t.Errorf("expected metric name http_requests_total, got %s", p1.Name)
	}
	if p1.Type != MetricTypeCounter {
		t.Errorf("expected counter type, got %s", p1.Type)
	}
	if p1.Value != 1027 {
		t.Errorf("expected value 1027, got %f", p1.Value)
	}
	if p1.Labels["method"] != "POST" || p1.Labels["handler"] != "/api/login" {
		t.Errorf("unexpected labels: %v", p1.Labels)
	}

	p3 := points[2]
	if p3.Name != "node_cpu_utilization_ratio" {
		t.Errorf("expected node_cpu_utilization_ratio, got %s", p3.Name)
	}
	if p3.Type != MetricTypeGauge {
		t.Errorf("expected gauge type, got %s", p3.Type)
	}
	if p3.Value != 0.152 {
		t.Errorf("expected 0.152, got %f", p3.Value)
	}
}

func TestParseJSONMetrics(t *testing.T) {
	jsonData := []byte(`{
		"service": "billing",
		"status": "HEALTHY",
		"metrics": {
			"activeConnections": 42,
			"circuitBreakerOpen": false,
			"avgLatencyMs": 14.85
		}
	}`)

	points, err := ParseJSONMetrics(jsonData, "app")
	if err != nil {
		t.Fatalf("failed to parse JSON metrics: %v", err)
	}

	foundMap := make(map[string]MetricDataPoint)
	for _, p := range points {
		foundMap[p.Name] = p
	}

	if p, ok := foundMap["app.metrics.activeConnections"]; !ok || p.Value != 42 {
		t.Errorf("expected app.metrics.activeConnections == 42, got %v", p)
	}

	if p, ok := foundMap["app.metrics.circuitBreakerOpen"]; !ok || p.Value != 0.0 {
		t.Errorf("expected app.metrics.circuitBreakerOpen == 0.0, got %v", p)
	}

	if p, ok := foundMap["app.status"]; !ok || p.Value != 1.0 || p.StringValue != "HEALTHY" {
		t.Errorf("expected app.status == 1.0 (HEALTHY), got %v", p)
	}
}

func TestParseKeyValueStdout(t *testing.T) {
	cliOutput := `# Diagnostic system output
total_memory_mb=16384
free_memory_mb=4096
disk_read_iops: 1250
cluster_status = OK
`

	points, err := ParseKeyValueStdout(cliOutput, "=")
	if err != nil {
		t.Fatalf("failed to parse CLI stdout: %v", err)
	}

	foundMap := make(map[string]MetricDataPoint)
	for _, p := range points {
		foundMap[p.Name] = p
	}

	if p, ok := foundMap["total_memory_mb"]; !ok || p.Value != 16384 {
		t.Errorf("expected total_memory_mb == 16384, got %v", p)
	}
	if p, ok := foundMap["disk_read_iops"]; !ok || p.Value != 1250 {
		t.Errorf("expected disk_read_iops == 1250, got %v", p)
	}
	if p, ok := foundMap["cluster_status"]; !ok || p.Value != 1.0 {
		t.Errorf("expected cluster_status == 1.0, got %v", p)
	}
}
