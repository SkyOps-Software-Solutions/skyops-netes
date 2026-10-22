package remediation

import (
	"context"
	"testing"
	"time"

	"github.com/skyops-io/skyops/agent/internal/config"
	"github.com/skyops-io/skyops/agent/internal/metrics"
	"github.com/skyops-io/skyops/agent/internal/transport"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestStateMachineTransitions(t *testing.T) {
	sm := NewStateMachine("act-101", "idem-101", "ReplacePodImage")

	if sm.State() != StateProposed {
		t.Fatalf("expected state PROPOSED, got %s", sm.State())
	}

	// Valid sequence: Proposed -> Validating -> Approved -> Executing -> Verifying -> Succeeded
	if err := sm.Transition(StateValidating, "validating"); err != nil {
		t.Fatal(err)
	}
	if err := sm.Transition(StateApproved, "approved"); err != nil {
		t.Fatal(err)
	}
	if err := sm.Transition(StateExecuting, "executing"); err != nil {
		t.Fatal(err)
	}
	if err := sm.Transition(StateVerifying, "verifying"); err != nil {
		t.Fatal(err)
	}
	if err := sm.Transition(StateSucceeded, "succeeded"); err != nil {
		t.Fatal(err)
	}

	// Illegal transition from terminal state
	if err := sm.Transition(StateExecuting, "illegal"); err == nil {
		t.Fatal("expected error on transition from terminal state")
	}

	rec := sm.Record()
	if len(rec.AuditLog) != 6 {
		t.Errorf("expected 6 audit log entries, got %d", len(rec.AuditLog))
	}
}

func TestRemediationExecutionWithFakeK8s(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	// Seed target standalone Pod
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "api-pod",
			Namespace: "default",
			UID:       "uid-pod-123",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{
				{
					Name:  "web",
					Image: "nginx:1.20",
				},
			},
		},
	}
	_, err := fakeClient.CoreV1().Pods("default").Create(ctx, pod, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
		TelemetryInterval:    10 * time.Second,
		ActionPollInterval:   10 * time.Second,
	}
	transportClient := transport.NewClient(cfg)
	reg := metrics.NewRegistry()

	manager := NewManager(cfg, transportClient, fakeClient, reg)

	action := &transport.RemediationAction{
		ID:                   "act-1",
		IdempotencyKey:       "key-1",
		ClusterID:            "cls-test",
		Type:                 "ReplacePodImage",
		Target:               transport.ActionTarget{Kind: "Pod", Namespace: "default", Name: "api-pod", Container: "web", UID: "uid-pod-123"},
		ExpectedCurrentValue: "nginx:1.20",
		ProposedValue:        "nginx:1.21",
	}

	manager.ProcessAction(ctx, action)

	rec := manager.GetExecutionRecord("key-1")
	if rec == nil {
		t.Fatal("expected execution record stored")
	}

	if rec.State != StateSucceeded {
		t.Fatalf("expected action to succeed, got %s (err: %s)", rec.State, rec.ErrorMessage)
	}

	// Verify pod now has nginx:1.21
	updatedPod, err := fakeClient.CoreV1().Pods("default").Get(ctx, "api-pod", metav1.GetOptions{})
	if err != nil {
		t.Fatal(err)
	}
	if updatedPod.Spec.Containers[0].Image != "nginx:1.21" {
		t.Fatalf("expected image nginx:1.21, got %s", updatedPod.Spec.Containers[0].Image)
	}

	// Idempotent retry with same key should recognize it
	manager.ProcessAction(ctx, action)
}

func TestDeletePodWithNakedPodConfirmation(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	// 1. Create a standalone (naked) pod
	pod := &corev1.Pod{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "standalone-pod",
			Namespace: "default",
			UID:       "uid-naked-1",
		},
		Spec: corev1.PodSpec{
			Containers: []corev1.Container{{Name: "app", Image: "nginx:latest"}},
		},
	}
	_, _ = fakeClient.CoreV1().Pods("default").Create(ctx, pod, metav1.CreateOptions{})

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
	}
	manager := NewManager(cfg, transport.NewClient(cfg), fakeClient, metrics.NewRegistry())

	// Unconfirmed naked pod delete should fail precondition
	unconfirmedAction := &transport.RemediationAction{
		ID:             "act-del-unconfirmed",
		IdempotencyKey: "del-key-unconfirmed",
		ClusterID:      "cls-test",
		Type:           "DeletePod",
		Target:         transport.ActionTarget{Kind: "Pod", Namespace: "default", Name: "standalone-pod", UID: "uid-naked-1"},
	}
	manager.ProcessAction(ctx, unconfirmedAction)
	rec := manager.GetExecutionRecord("del-key-unconfirmed")
	if rec == nil || rec.State != StateFailed {
		t.Fatalf("expected unconfirmed naked pod delete to fail, got %+v", rec)
	}

	// Confirmed naked pod delete should succeed
	confirmedAction := &transport.RemediationAction{
		ID:             "act-del-confirmed",
		IdempotencyKey: "del-key-confirmed",
		ClusterID:      "cls-test",
		Type:           "DeletePod",
		Target:         transport.ActionTarget{Kind: "Pod", Namespace: "default", Name: "standalone-pod", UID: "uid-naked-1"},
		Parameters: map[string]interface{}{
			"confirmNakedPodDelete": true,
		},
	}
	manager.ProcessAction(ctx, confirmedAction)
	recConfirmed := manager.GetExecutionRecord("del-key-confirmed")
	if recConfirmed == nil || recConfirmed.State != StateSucceeded {
		t.Fatalf("expected confirmed naked pod delete to succeed, got %+v", recConfirmed)
	}
}

func TestScaleDeploymentScaleToZeroSafety(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	initialReplicas := int32(3)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "web-deploy",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &initialReplicas,
			Template: corev1.PodTemplateSpec{
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Name: "web", Image: "nginx"}},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			Replicas:          3,
			ReadyReplicas:     3,
			AvailableReplicas: 3,
			UpdatedReplicas:   3,
		},
	}
	_, _ = fakeClient.AppsV1().Deployments("default").Create(ctx, dep, metav1.CreateOptions{})

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
	}
	manager := NewManager(cfg, transport.NewClient(cfg), fakeClient, metrics.NewRegistry())

	// Scaling to 0 without confirmScaleToZero must fail
	unconfirmedScale := &transport.RemediationAction{
		ID:             "act-scale-0-unconfirmed",
		IdempotencyKey: "scale-0-unconfirmed",
		ClusterID:      "cls-test",
		Type:           "ScaleDeployment",
		Target:         transport.ActionTarget{Kind: "Deployment", Namespace: "default", Name: "web-deploy"},
		ProposedValue:  "0",
	}
	manager.ProcessAction(ctx, unconfirmedScale)
	rec := manager.GetExecutionRecord("scale-0-unconfirmed")
	if rec == nil || rec.State != StateFailed {
		t.Fatalf("expected unconfirmed scale to 0 to fail, got %+v", rec)
	}

	// Scaling to 0 with confirmScaleToZero must succeed
	confirmedScale := &transport.RemediationAction{
		ID:             "act-scale-0-confirmed",
		IdempotencyKey: "scale-0-confirmed",
		ClusterID:      "cls-test",
		Type:           "ScaleDeployment",
		Target:         transport.ActionTarget{Kind: "Deployment", Namespace: "default", Name: "web-deploy"},
		ProposedValue:  "0",
		Parameters: map[string]interface{}{
			"confirmScaleToZero": true,
		},
	}
	manager.ProcessAction(ctx, confirmedScale)
	recConfirmed := manager.GetExecutionRecord("scale-0-confirmed")
	if recConfirmed == nil || recConfirmed.State != StateSucceeded {
		t.Fatalf("expected confirmed scale to 0 to succeed, got %+v", recConfirmed)
	}

	updatedDep, _ := fakeClient.AppsV1().Deployments("default").Get(ctx, "web-deploy", metav1.GetOptions{})
	if updatedDep.Spec.Replicas == nil || *updatedDep.Spec.Replicas != 0 {
		t.Fatalf("expected deployment replicas to be 0, got %v", updatedDep.Spec.Replicas)
	}
}

func TestRolloutRestartDeployment(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	initialReplicas := int32(2)
	dep := &appsv1.Deployment{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "payment-api",
			Namespace: "default",
		},
		Spec: appsv1.DeploymentSpec{
			Replicas: &initialReplicas,
			Template: corev1.PodTemplateSpec{
				ObjectMeta: metav1.ObjectMeta{
					Annotations: map[string]string{},
				},
				Spec: corev1.PodSpec{
					Containers: []corev1.Container{{Name: "api", Image: "payment:v1"}},
				},
			},
		},
		Status: appsv1.DeploymentStatus{
			Replicas:          2,
			ReadyReplicas:     2,
			AvailableReplicas: 2,
			UpdatedReplicas:   2,
		},
	}
	_, _ = fakeClient.AppsV1().Deployments("default").Create(ctx, dep, metav1.CreateOptions{})

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
	}
	manager := NewManager(cfg, transport.NewClient(cfg), fakeClient, metrics.NewRegistry())

	restartAction := &transport.RemediationAction{
		ID:             "act-restart-1",
		IdempotencyKey: "restart-key-1",
		ClusterID:      "cls-test",
		Type:           "RolloutRestart",
		Target:         transport.ActionTarget{Kind: "Deployment", Namespace: "default", Name: "payment-api"},
	}
	manager.ProcessAction(ctx, restartAction)
	rec := manager.GetExecutionRecord("restart-key-1")
	if rec == nil || rec.State != StateSucceeded {
		t.Fatalf("expected restart to succeed, got %+v", rec)
	}

	updatedDep, _ := fakeClient.AppsV1().Deployments("default").Get(ctx, "payment-api", metav1.GetOptions{})
	if updatedDep.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"] == "" {
		t.Fatal("expected kubectl.kubernetes.io/restartedAt annotation to be populated")
	}
}

func TestCronJobAndJobOperations(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	suspendedFalse := false
	cj := &batchv1.CronJob{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "nightly-sync",
			Namespace: "default",
			UID:       "cj-uid-1",
		},
		Spec: batchv1.CronJobSpec{
			Schedule: "0 0 * * *",
			Suspend:  &suspendedFalse,
			JobTemplate: batchv1.JobTemplateSpec{
				Spec: batchv1.JobSpec{
					Template: corev1.PodTemplateSpec{
						Spec: corev1.PodSpec{
							Containers: []corev1.Container{{Name: "sync", Image: "sync:v1"}},
						},
					},
				},
			},
		},
	}
	_, _ = fakeClient.BatchV1().CronJobs("default").Create(ctx, cj, metav1.CreateOptions{})

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
	}
	manager := NewManager(cfg, transport.NewClient(cfg), fakeClient, metrics.NewRegistry())

	// 1. Suspend CronJob
	suspendAction := &transport.RemediationAction{
		ID:             "act-suspend",
		IdempotencyKey: "suspend-key",
		ClusterID:      "cls-test",
		Type:           "SuspendCronJob",
		Target:         transport.ActionTarget{Kind: "CronJob", Namespace: "default", Name: "nightly-sync"},
	}
	manager.ProcessAction(ctx, suspendAction)
	recSuspend := manager.GetExecutionRecord("suspend-key")
	if recSuspend == nil || recSuspend.State != StateSucceeded {
		t.Fatalf("expected suspend to succeed, got %+v", recSuspend)
	}

	updatedCj, _ := fakeClient.BatchV1().CronJobs("default").Get(ctx, "nightly-sync", metav1.GetOptions{})
	if updatedCj.Spec.Suspend == nil || !*updatedCj.Spec.Suspend {
		t.Fatal("expected CronJob to be suspended")
	}

	// 2. Resume CronJob
	resumeAction := &transport.RemediationAction{
		ID:             "act-resume",
		IdempotencyKey: "resume-key",
		ClusterID:      "cls-test",
		Type:           "ResumeCronJob",
		Target:         transport.ActionTarget{Kind: "CronJob", Namespace: "default", Name: "nightly-sync"},
	}
	manager.ProcessAction(ctx, resumeAction)
	recResume := manager.GetExecutionRecord("resume-key")
	if recResume == nil || recResume.State != StateSucceeded {
		t.Fatalf("expected resume to succeed, got %+v", recResume)
	}

	resumedCj, _ := fakeClient.BatchV1().CronJobs("default").Get(ctx, "nightly-sync", metav1.GetOptions{})
	if resumedCj.Spec.Suspend != nil && *resumedCj.Spec.Suspend {
		t.Fatal("expected CronJob to be active (unsuspended)")
	}

	// 3. Trigger CronJob (instantiates manual Job)
	triggerAction := &transport.RemediationAction{
		ID:             "act-trigger",
		IdempotencyKey: "trigger-key",
		ClusterID:      "cls-test",
		Type:           "TriggerCronJob",
		Target:         transport.ActionTarget{Kind: "CronJob", Namespace: "default", Name: "nightly-sync"},
	}
	manager.ProcessAction(ctx, triggerAction)
	recTrigger := manager.GetExecutionRecord("trigger-key")
	if recTrigger == nil || recTrigger.State != StateSucceeded {
		t.Fatalf("expected trigger to succeed, got %+v", recTrigger)
	}

	jobList, _ := fakeClient.BatchV1().Jobs("default").List(ctx, metav1.ListOptions{})
	if len(jobList.Items) == 0 {
		t.Fatal("expected manual Job to be created")
	}

	// 4. Delete Job
	deleteJobAction := &transport.RemediationAction{
		ID:             "act-del-job",
		IdempotencyKey: "del-job-key",
		ClusterID:      "cls-test",
		Type:           "DeleteJob",
		Target:         transport.ActionTarget{Kind: "Job", Namespace: "default", Name: jobList.Items[0].Name},
	}
	manager.ProcessAction(ctx, deleteJobAction)
	recDelJob := manager.GetExecutionRecord("del-job-key")
	if recDelJob == nil || recDelJob.State != StateSucceeded {
		t.Fatalf("expected job delete to succeed, got %+v", recDelJob)
	}
}

func TestNodeCordonAndUncordon(t *testing.T) {
	ctx := context.Background()
	fakeClient := fake.NewSimpleClientset()

	node := &corev1.Node{
		ObjectMeta: metav1.ObjectMeta{
			Name: "worker-node-1",
		},
		Spec: corev1.NodeSpec{
			Unschedulable: false,
		},
	}
	_, _ = fakeClient.CoreV1().Nodes().Create(ctx, node, metav1.CreateOptions{})

	cfg := &config.Config{
		ClusterID:            "cls-test",
		AgentToken:           "tok",
		ServerURL:            "http://localhost:9999",
		MaxConcurrentActions: 2,
	}
	manager := NewManager(cfg, transport.NewClient(cfg), fakeClient, metrics.NewRegistry())

	// 1. Cordon Node
	cordonAction := &transport.RemediationAction{
		ID:             "act-cordon",
		IdempotencyKey: "cordon-key",
		ClusterID:      "cls-test",
		Type:           "CordonNode",
		Target:         transport.ActionTarget{Kind: "Node", Name: "worker-node-1"},
	}
	manager.ProcessAction(ctx, cordonAction)
	recCordon := manager.GetExecutionRecord("cordon-key")
	if recCordon == nil || recCordon.State != StateSucceeded {
		t.Fatalf("expected cordon to succeed, got %+v", recCordon)
	}

	updatedNode, _ := fakeClient.CoreV1().Nodes().Get(ctx, "worker-node-1", metav1.GetOptions{})
	if !updatedNode.Spec.Unschedulable {
		t.Fatal("expected node to be unschedulable (cordoned)")
	}

	// 2. Uncordon Node
	uncordonAction := &transport.RemediationAction{
		ID:             "act-uncordon",
		IdempotencyKey: "uncordon-key",
		ClusterID:      "cls-test",
		Type:           "UncordonNode",
		Target:         transport.ActionTarget{Kind: "Node", Name: "worker-node-1"},
	}
	manager.ProcessAction(ctx, uncordonAction)
	recUncordon := manager.GetExecutionRecord("uncordon-key")
	if recUncordon == nil || recUncordon.State != StateSucceeded {
		t.Fatalf("expected uncordon to succeed, got %+v", recUncordon)
	}

	resumedNode, _ := fakeClient.CoreV1().Nodes().Get(ctx, "worker-node-1", metav1.GetOptions{})
	if resumedNode.Spec.Unschedulable {
		t.Fatal("expected node to be schedulable (uncordoned)")
	}
}
