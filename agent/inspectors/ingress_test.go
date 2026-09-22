package inspectors

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	networkingv1 "k8s.io/api/networking/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestIngressInspector_SyntheticProbeStatusClassification(t *testing.T) {
	ctx := context.Background()

	// 1. Setup mock HTTP servers for various health scenarios
	tsOK := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`{"status":"ok"}`))
	}))
	defer tsOK.Close()

	tsBadGateway := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusBadGateway)
		_, _ = w.Write([]byte(`502 Bad Gateway: Upstream connection failed`))
	}))
	defer tsBadGateway.Close()

	tsGatewayTimeout := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusGatewayTimeout)
		_, _ = w.Write([]byte(`504 Gateway Timeout: Upstream did not respond`))
	}))
	defer tsGatewayTimeout.Close()

	inspector := NewIngressInspector(nil, 2*time.Second, 30)

	// Test 200 OK
	resOK := inspector.InspectEndpoint(ctx, tsOK.URL)
	if !resOK.Reachable || resOK.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK reachable, got code=%d, reachable=%v", resOK.StatusCode, resOK.Reachable)
	}
	if resOK.ErrorType != ErrorNone {
		t.Errorf("expected ErrorNone, got %s", resOK.ErrorType)
	}

	// Test 502 Bad Gateway detection
	res502 := inspector.InspectEndpoint(ctx, tsBadGateway.URL)
	if res502.StatusCode != http.StatusBadGateway {
		t.Errorf("expected status 502, got %d", res502.StatusCode)
	}
	if res502.ErrorType != ErrorBadGateway {
		t.Errorf("expected ErrorBadGateway, got %s", res502.ErrorType)
	}

	// Test 504 Gateway Timeout detection
	res504 := inspector.InspectEndpoint(ctx, tsGatewayTimeout.URL)
	if res504.StatusCode != http.StatusGatewayTimeout {
		t.Errorf("expected status 504, got %d", res504.StatusCode)
	}
	if res504.ErrorType != ErrorGatewayTimeout {
		t.Errorf("expected ErrorGatewayTimeout, got %s", res504.ErrorType)
	}
}

func TestIngressInspector_KubernetesIngressEvaluation(t *testing.T) {
	ctx := context.Background()
	fakeK8s := fake.NewSimpleClientset()

	ingClass := "nginx"
	pathType := networkingv1.PathTypePrefix
	ing := &networkingv1.Ingress{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-ingress",
			Namespace: "production",
		},
		Spec: networkingv1.IngressSpec{
			IngressClassName: &ingClass,
			Rules: []networkingv1.IngressRule{
				{
					Host: "api.example.com",
					IngressRuleValue: networkingv1.IngressRuleValue{
						HTTP: &networkingv1.HTTPIngressRuleValue{
							Paths: []networkingv1.HTTPIngressPath{
								{
									Path:     "/v1",
									PathType: &pathType,
									Backend: networkingv1.IngressBackend{
										Service: &networkingv1.IngressServiceBackend{
											Name: "api-service",
											Port: networkingv1.ServiceBackendPort{Number: 8080},
										},
									},
								},
							},
						},
					},
				},
			},
		},
	}

	_, err := fakeK8s.NetworkingV1().Ingresses("production").Create(ctx, ing, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}

	inspector := NewIngressInspector(fakeK8s, 1*time.Second, 30)
	reports, err := inspector.Inspect(ctx, "production")
	if err != nil {
		t.Fatalf("inspection failed: %v", err)
	}

	if len(reports) != 1 {
		t.Fatalf("expected 1 ingress report, got %d", len(reports))
	}

	rep := reports[0]
	if rep.Name != "web-ingress" || rep.Namespace != "production" {
		t.Errorf("unexpected ingress metadata: %s/%s", rep.Namespace, rep.Name)
	}

	obs := inspector.ToTelemetryObservations(reports, "cluster-1")
	if len(obs) != 1 {
		t.Fatalf("expected 1 telemetry observation, got %d", len(obs))
	}
	if obs[0].Kind != "Ingress" {
		t.Errorf("expected Kind Ingress, got %s", obs[0].Kind)
	}
}
