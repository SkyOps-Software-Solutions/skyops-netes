package remediation

import (
	"context"
	"encoding/json"
	"fmt"
	"strconv"
	"strings"
	"time"

	"github.com/skyops-io/skyops/agent/internal/transport"
	appsv1 "k8s.io/api/apps/v1"
	batchv1 "k8s.io/api/batch/v1"
	corev1 "k8s.io/api/core/v1"
	policyv1 "k8s.io/api/policy/v1"
	apierrors "k8s.io/apimachinery/pkg/api/errors"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/apimachinery/pkg/types"
	"k8s.io/client-go/kubernetes"
)

// Executor coordinates safe cluster mutation, verification, and rollback
type Executor struct {
	client kubernetes.Interface
}

func NewExecutor(client kubernetes.Interface) *Executor {
	return &Executor{client: client}
}

func isProtectedNamespace(ns string) bool {
	lower := strings.ToLower(strings.TrimSpace(ns))
	return lower == "kube-system" || lower == "kube-public" || lower == "kube-node-lease" || lower == "skyops" || lower == "skyops-system"
}

func isParamTrue(params map[string]interface{}, key string) bool {
	if params == nil {
		return false
	}
	val, ok := params[key]
	if !ok {
		return false
	}
	if b, ok := val.(bool); ok {
		return b
	}
	if s, ok := val.(string); ok {
		lower := strings.ToLower(strings.TrimSpace(s))
		return lower == "true" || lower == "1" || lower == "yes"
	}
	return false
}

// PreconditionCheck checks live state before execution and returns the previous state for rollback
func (e *Executor) PreconditionCheck(ctx context.Context, action *transport.RemediationAction) (previousState string, err error) {
	if action.Target.Namespace != "" && isProtectedNamespace(action.Target.Namespace) {
		return "", fmt.Errorf("precondition failed: namespace %q is protected against remediation actions", action.Target.Namespace)
	}

	actionType := action.CanonicalType()

	switch actionType {
	case "ReplacePodImage":
		if action.Target.Kind == "Pod" {
			pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: target pod not found: %w", err)
			}
			if action.Target.UID != "" && string(pod.UID) != action.Target.UID {
				return "", fmt.Errorf("precondition failed: target pod UID changed (stale action: expected %s, got %s)", action.Target.UID, string(pod.UID))
			}

			// Find container
			var foundContainer *corev1.Container
			for i := range pod.Spec.Containers {
				if pod.Spec.Containers[i].Name == action.Target.Container {
					foundContainer = &pod.Spec.Containers[i]
					break
				}
			}
			if foundContainer == nil {
				return "", fmt.Errorf("precondition failed: container %q not found in pod", action.Target.Container)
			}

			// Idempotency: already matches proposed
			if foundContainer.Image == action.ProposedValue {
				return action.ProposedValue, nil
			}

			if action.ExpectedCurrentValue != "" && foundContainer.Image != action.ExpectedCurrentValue {
				return "", fmt.Errorf("precondition failed: expected live image %q does not match actual %q", action.ExpectedCurrentValue, foundContainer.Image)
			}
			return foundContainer.Image, nil

		} else if action.Target.Kind == "Deployment" {
			dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
			}
			var foundContainer *corev1.Container
			for i := range dep.Spec.Template.Spec.Containers {
				if dep.Spec.Template.Spec.Containers[i].Name == action.Target.Container {
					foundContainer = &dep.Spec.Template.Spec.Containers[i]
					break
				}
			}
			if foundContainer == nil {
				return "", fmt.Errorf("precondition failed: container %q not found in deployment template", action.Target.Container)
			}
			if foundContainer.Image == action.ProposedValue {
				return action.ProposedValue, nil
			}
			if action.ExpectedCurrentValue != "" && foundContainer.Image != action.ExpectedCurrentValue {
				return "", fmt.Errorf("precondition failed: expected deployment image %q does not match actual %q", action.ExpectedCurrentValue, foundContainer.Image)
			}
			return foundContainer.Image, nil
		}

	case "RestartPod":
		if action.Target.Kind == "Pod" {
			pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: target pod not found: %w", err)
			}
			if action.Target.UID != "" && string(pod.UID) != action.Target.UID {
				return "", fmt.Errorf("precondition failed: target pod UID changed (stale action: expected %s, got %s)", action.Target.UID, string(pod.UID))
			}
			return string(pod.UID), nil
		} else if action.Target.Kind == "Deployment" {
			dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
			}
			if dep.Spec.Template.Annotations == nil {
				return "", nil
			}
			return dep.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"], nil
		}

	case "DeletePod":
		pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: target pod not found: %w", err)
		}
		if action.Target.UID != "" && string(pod.UID) != action.Target.UID {
			return "", fmt.Errorf("precondition failed: target pod UID changed (stale action: expected %s, got %s)", action.Target.UID, string(pod.UID))
		}
		// Standalone naked pod safety check
		if len(pod.OwnerReferences) == 0 && !isParamTrue(action.Parameters, "confirmNakedPodDelete") {
			return "", fmt.Errorf("precondition failed: pod %q is standalone without a controller owner; explicit confirmNakedPodDelete confirmation is required", action.Target.Name)
		}
		return string(pod.UID), nil

	case "RolloutRestart":
		kind := strings.ToLower(action.Target.Kind)
		switch kind {
		case "deployment":
			dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
			}
			if dep.Spec.Template.Annotations == nil {
				return "", nil
			}
			return dep.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"], nil
		case "statefulset":
			sts, err := e.client.AppsV1().StatefulSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: statefulset not found: %w", err)
			}
			if sts.Spec.Template.Annotations == nil {
				return "", nil
			}
			return sts.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"], nil
		case "daemonset":
			ds, err := e.client.AppsV1().DaemonSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: daemonset not found: %w", err)
			}
			if ds.Spec.Template.Annotations == nil {
				return "", nil
			}
			return ds.Spec.Template.Annotations["kubectl.kubernetes.io/restartedAt"], nil
		default:
			return "", fmt.Errorf("precondition failed: unsupported workload kind for RolloutRestart: %s", action.Target.Kind)
		}

	case "RollbackDeployment":
		dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
		}

		currentRevStr := dep.Annotations["deployment.kubernetes.io/revision"]
		currentRev, _ := strconv.ParseInt(currentRevStr, 10, 64)

		rsList, err := e.client.AppsV1().ReplicaSets(action.Target.Namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: list replicasets: %w", err)
		}

		var targetRS *appsv1.ReplicaSet
		var highestPrevRev int64 = -1

		for i := range rsList.Items {
			rs := &rsList.Items[i]
			isOwner := false
			for _, owner := range rs.OwnerReferences {
				if owner.Kind == "Deployment" && owner.Name == dep.Name {
					isOwner = true
					break
				}
			}
			if !isOwner {
				continue
			}

			revStr := rs.Annotations["deployment.kubernetes.io/revision"]
			rev, err := strconv.ParseInt(revStr, 10, 64)
			if err != nil {
				continue
			}

			if currentRev > 0 && rev < currentRev && rev > highestPrevRev {
				highestPrevRev = rev
				targetRS = rs
			} else if currentRev <= 0 && rev > highestPrevRev {
				highestPrevRev = rev
				targetRS = rs
			}
		}

		if targetRS == nil {
			return "", fmt.Errorf("precondition failed: no previous healthy ReplicaSet revision found for deployment %q", dep.Name)
		}

		// Save current template JSON for rollback
		currTemplateBytes, _ := json.Marshal(dep.Spec.Template)
		return string(currTemplateBytes), nil

	case "ScaleDeployment":
		dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
		}
		targetReplicas, err := strconv.Atoi(action.ProposedValue)
		if err != nil {
			return "", fmt.Errorf("precondition failed: invalid replica count %q: %w", action.ProposedValue, err)
		}
		if targetReplicas < 0 {
			return "", fmt.Errorf("precondition failed: negative replica count (%d) is invalid", targetReplicas)
		}
		if targetReplicas == 0 && !isParamTrue(action.Parameters, "confirmScaleToZero") {
			return "", fmt.Errorf("precondition failed: scaling to zero requires explicit confirmation (confirmScaleToZero)")
		}
		currReplicas := int32(1)
		if dep.Spec.Replicas != nil {
			currReplicas = *dep.Spec.Replicas
		}
		if int(currReplicas) == targetReplicas {
			return action.ProposedValue, nil
		}
		return strconv.Itoa(int(currReplicas)), nil

	case "ScaleWorkload":
		kind := strings.ToLower(action.Target.Kind)
		targetReplicas, err := strconv.Atoi(action.ProposedValue)
		if err != nil {
			return "", fmt.Errorf("precondition failed: invalid replica count %q: %w", action.ProposedValue, err)
		}
		if targetReplicas < 0 {
			return "", fmt.Errorf("precondition failed: negative replica count (%d) is invalid", targetReplicas)
		}
		if targetReplicas == 0 && !isParamTrue(action.Parameters, "confirmScaleToZero") {
			return "", fmt.Errorf("precondition failed: scaling to zero requires explicit confirmation (confirmScaleToZero)")
		}

		switch kind {
		case "deployment":
			dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: deployment not found: %w", err)
			}
			currReplicas := int32(1)
			if dep.Spec.Replicas != nil {
				currReplicas = *dep.Spec.Replicas
			}
			return strconv.Itoa(int(currReplicas)), nil
		case "statefulset":
			sts, err := e.client.AppsV1().StatefulSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return "", fmt.Errorf("precondition failed: statefulset not found: %w", err)
			}
			currReplicas := int32(1)
			if sts.Spec.Replicas != nil {
				currReplicas = *sts.Spec.Replicas
			}
			return strconv.Itoa(int(currReplicas)), nil
		default:
			return "", fmt.Errorf("precondition failed: unsupported workload kind for ScaleWorkload: %s", action.Target.Kind)
		}

	case "SuspendCronJob":
		cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: cronjob not found: %w", err)
		}
		isSuspended := cj.Spec.Suspend != nil && *cj.Spec.Suspend
		return strconv.FormatBool(isSuspended), nil

	case "ResumeCronJob":
		cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: cronjob not found: %w", err)
		}
		isSuspended := cj.Spec.Suspend != nil && *cj.Spec.Suspend
		return strconv.FormatBool(isSuspended), nil

	case "TriggerCronJob":
		cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: cronjob not found: %w", err)
		}
		if len(cj.Spec.JobTemplate.Spec.Template.Spec.Containers) == 0 {
			return "", fmt.Errorf("precondition failed: cronjob has no containers defined in template")
		}
		return cj.Name, nil

	case "RerunJob":
		job, err := e.client.BatchV1().Jobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: source job not found: %w", err)
		}
		return job.Name, nil

	case "DeleteJob":
		job, err := e.client.BatchV1().Jobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: target job not found: %w", err)
		}
		return string(job.UID), nil

	case "CordonNode", "UncordonNode":
		node, err := e.client.CoreV1().Nodes().Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: node not found: %w", err)
		}
		return strconv.FormatBool(node.Spec.Unschedulable), nil

	case "DrainNode":
		if !isParamTrue(action.Parameters, "confirmDrain") {
			return "", fmt.Errorf("precondition failed: node drain requires explicit confirmation (confirmDrain)")
		}
		node, err := e.client.CoreV1().Nodes().Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return "", fmt.Errorf("precondition failed: target node not found: %w", err)
		}
		return strconv.FormatBool(node.Spec.Unschedulable), nil
	}

	return "", fmt.Errorf("unsupported action type: %s", actionType)
}

// Execute performs the requested mutation
func (e *Executor) Execute(ctx context.Context, action *transport.RemediationAction) error {
	actionType := action.CanonicalType()

	switch actionType {
	case "ReplacePodImage":
		if action.Target.Kind == "Deployment" {
			patch := fmt.Sprintf(`{"spec":{"template":{"spec":{"containers":[{"name":%q,"image":%q}]}}}}`, action.Target.Container, action.ProposedValue)
			_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
			return err
		}

		if action.Target.Kind == "Pod" {
			pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
			if err != nil {
				return err
			}

			// If pod is owned by a Deployment/ReplicaSet, update the deployment
			if len(pod.OwnerReferences) > 0 {
				owner := pod.OwnerReferences[0]
				if owner.Kind == "ReplicaSet" {
					rs, err := e.client.AppsV1().ReplicaSets(action.Target.Namespace).Get(ctx, owner.Name, metav1.GetOptions{})
					if err == nil && len(rs.OwnerReferences) > 0 && rs.OwnerReferences[0].Kind == "Deployment" {
						depName := rs.OwnerReferences[0].Name
						patch := fmt.Sprintf(`{"spec":{"template":{"spec":{"containers":[{"name":%q,"image":%q}]}}}}`, action.Target.Container, action.ProposedValue)
						_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, depName, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
						return err
					}
				}
				return fmt.Errorf("cannot mutate image on controller-owned pod without Deployment owner")
			}

			// Standalone Pod
			for i := range pod.Spec.Containers {
				if pod.Spec.Containers[i].Name == action.Target.Container {
					pod.Spec.Containers[i].Image = action.ProposedValue
					break
				}
			}
			pod.ResourceVersion = ""
			pod.UID = ""
			pod.CreationTimestamp = metav1.Time{}
			pod.ManagedFields = nil
			pod.Status = corev1.PodStatus{}
			pod.OwnerReferences = nil

			if err := e.client.CoreV1().Pods(action.Target.Namespace).Delete(ctx, action.Target.Name, metav1.DeleteOptions{}); err != nil {
				return fmt.Errorf("delete standalone pod: %w", err)
			}
			if _, err := e.client.CoreV1().Pods(action.Target.Namespace).Create(ctx, pod, metav1.CreateOptions{}); err != nil {
				return fmt.Errorf("create replacement pod: %w", err)
			}
			return nil
		}

	case "RestartPod":
		if action.Target.Kind == "Pod" {
			return e.client.CoreV1().Pods(action.Target.Namespace).Delete(ctx, action.Target.Name, metav1.DeleteOptions{})
		}
		if action.Target.Kind == "Deployment" {
			restartedAt := time.Now().Format(time.RFC3339)
			patchMap := map[string]interface{}{
				"spec": map[string]interface{}{
					"template": map[string]interface{}{
						"metadata": map[string]interface{}{
							"annotations": map[string]string{
								"kubectl.kubernetes.io/restartedAt": restartedAt,
							},
						},
					},
				},
			}
			patchBytes, _ := json.Marshal(patchMap)
			_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
			return err
		}

	case "DeletePod":
		return e.client.CoreV1().Pods(action.Target.Namespace).Delete(ctx, action.Target.Name, metav1.DeleteOptions{})

	case "RolloutRestart":
		restartedAt := time.Now().Format(time.RFC3339)
		patchMap := map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"annotations": map[string]string{
							"kubectl.kubernetes.io/restartedAt": restartedAt,
						},
					},
				},
			},
		}
		patchBytes, _ := json.Marshal(patchMap)

		kind := strings.ToLower(action.Target.Kind)
		switch kind {
		case "deployment":
			_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
			return err
		case "statefulset":
			_, err := e.client.AppsV1().StatefulSets(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
			return err
		case "daemonset":
			_, err := e.client.AppsV1().DaemonSets(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
			return err
		default:
			return fmt.Errorf("unsupported workload kind for RolloutRestart: %s", action.Target.Kind)
		}

	case "RollbackDeployment":
		dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get deployment: %w", err)
		}

		currentRevStr := dep.Annotations["deployment.kubernetes.io/revision"]
		currentRev, _ := strconv.ParseInt(currentRevStr, 10, 64)

		rsList, err := e.client.AppsV1().ReplicaSets(action.Target.Namespace).List(ctx, metav1.ListOptions{})
		if err != nil {
			return fmt.Errorf("list replicasets: %w", err)
		}

		var targetRS *appsv1.ReplicaSet
		var highestPrevRev int64 = -1

		for i := range rsList.Items {
			rs := &rsList.Items[i]
			isOwner := false
			for _, owner := range rs.OwnerReferences {
				if owner.Kind == "Deployment" && owner.Name == dep.Name {
					isOwner = true
					break
				}
			}
			if !isOwner {
				continue
			}

			revStr := rs.Annotations["deployment.kubernetes.io/revision"]
			rev, err := strconv.ParseInt(revStr, 10, 64)
			if err != nil {
				continue
			}

			if currentRev > 0 && rev < currentRev && rev > highestPrevRev {
				highestPrevRev = rev
				targetRS = rs
			} else if currentRev <= 0 && rev > highestPrevRev {
				highestPrevRev = rev
				targetRS = rs
			}
		}

		if targetRS == nil {
			return fmt.Errorf("no previous healthy ReplicaSet found for rollback")
		}

		// Restore previous pod template
		patchMap := map[string]interface{}{
			"spec": map[string]interface{}{
				"template": targetRS.Spec.Template,
			},
		}
		patchBytes, _ := json.Marshal(patchMap)
		_, err = e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
		return err

	case "ScaleDeployment":
		targetReplicas, err := strconv.Atoi(action.ProposedValue)
		if err != nil {
			return fmt.Errorf("invalid replica count %q: %w", action.ProposedValue, err)
		}
		if targetReplicas < 0 {
			return fmt.Errorf("negative replica count (%d) is prohibited", targetReplicas)
		}
		if targetReplicas == 0 && !isParamTrue(action.Parameters, "confirmScaleToZero") {
			return fmt.Errorf("refusing to scale deployment to zero without explicit confirmation")
		}
		patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, targetReplicas)
		_, err = e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err

	case "ScaleWorkload":
		kind := strings.ToLower(action.Target.Kind)
		targetReplicas, err := strconv.Atoi(action.ProposedValue)
		if err != nil {
			return fmt.Errorf("invalid replica count %q: %w", action.ProposedValue, err)
		}
		if targetReplicas < 0 {
			return fmt.Errorf("negative replica count (%d) is prohibited", targetReplicas)
		}
		if targetReplicas == 0 && !isParamTrue(action.Parameters, "confirmScaleToZero") {
			return fmt.Errorf("refusing to scale workload to zero without explicit confirmation")
		}
		patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, targetReplicas)

		switch kind {
		case "deployment":
			_, err = e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
			return err
		case "statefulset":
			_, err = e.client.AppsV1().StatefulSets(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
			return err
		default:
			return fmt.Errorf("unsupported workload kind for ScaleWorkload: %s", action.Target.Kind)
		}

	case "SuspendCronJob":
		patch := `{"spec":{"suspend":true}}`
		_, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err

	case "ResumeCronJob":
		patch := `{"spec":{"suspend":false}}`
		_, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err

	case "TriggerCronJob":
		cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get cronjob: %w", err)
		}
		timestampSuffix := time.Now().Format("20060102150405")
		jobName := fmt.Sprintf("%s-manual-%s", cj.Name, timestampSuffix)
		if len(jobName) > 63 {
			jobName = jobName[:63]
		}

		isController := true
		job := &batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{
				Name:      jobName,
				Namespace: cj.Namespace,
				Labels: map[string]string{
					"cronjob.kubernetes.io/instantiated-by": cj.Name,
					"app.kubernetes.io/managed-by":          "skyops",
				},
				Annotations: map[string]string{
					"cronjob.kubernetes.io/instantiate": "manual",
				},
				OwnerReferences: []metav1.OwnerReference{
					{
						APIVersion: "batch/v1",
						Kind:       "CronJob",
						Name:       cj.Name,
						UID:        cj.UID,
						Controller: &isController,
					},
				},
			},
			Spec: cj.Spec.JobTemplate.Spec,
		}
		_, err = e.client.BatchV1().Jobs(cj.Namespace).Create(ctx, job, metav1.CreateOptions{})
		return err

	case "RerunJob":
		sourceJob, err := e.client.BatchV1().Jobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
		if err != nil {
			return fmt.Errorf("get source job: %w", err)
		}
		timestampSuffix := time.Now().Format("20060102150405")
		newJobName := fmt.Sprintf("%s-rerun-%s", sourceJob.Name, timestampSuffix)
		if len(newJobName) > 63 {
			newJobName = newJobName[:63]
		}
		newJob := &batchv1.Job{
			ObjectMeta: metav1.ObjectMeta{
				Name:        newJobName,
				Namespace:   sourceJob.Namespace,
				Labels:      sourceJob.Labels,
				Annotations: sourceJob.Annotations,
			},
			Spec: batchv1.JobSpec{
				Template:                sourceJob.Spec.Template,
				BackoffLimit:            sourceJob.Spec.BackoffLimit,
				Completions:             sourceJob.Spec.Completions,
				Parallelism:             sourceJob.Spec.Parallelism,
				ActiveDeadlineSeconds:   sourceJob.Spec.ActiveDeadlineSeconds,
				TTLSecondsAfterFinished: sourceJob.Spec.TTLSecondsAfterFinished,
			},
		}
		_, err = e.client.BatchV1().Jobs(sourceJob.Namespace).Create(ctx, newJob, metav1.CreateOptions{})
		return err

	case "DeleteJob":
		propagation := metav1.DeletePropagationBackground
		return e.client.BatchV1().Jobs(action.Target.Namespace).Delete(ctx, action.Target.Name, metav1.DeleteOptions{
			PropagationPolicy: &propagation,
		})

	case "CordonNode":
		patch := `{"spec":{"unschedulable":true}}`
		_, err := e.client.CoreV1().Nodes().Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err

	case "UncordonNode":
		patch := `{"spec":{"unschedulable":false}}`
		_, err := e.client.CoreV1().Nodes().Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err

	case "DrainNode":
		// 1. Cordon the node first
		cordonPatch := `{"spec":{"unschedulable":true}}`
		if _, err := e.client.CoreV1().Nodes().Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(cordonPatch), metav1.PatchOptions{}); err != nil {
			return fmt.Errorf("drain failed: unable to cordon node: %w", err)
		}

		// 2. Query all pods scheduled on this node
		pods, err := e.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
			FieldSelector: fmt.Sprintf("spec.nodeName=%s", action.Target.Name),
		})
		if err != nil {
			return fmt.Errorf("drain failed: unable to list pods on node: %w", err)
		}

		deleteEmptyDir := isParamTrue(action.Parameters, "deleteEmptyDirData")

		// 3. Evict eligible pods
		for i := range pods.Items {
			pod := &pods.Items[i]

			// Skip mirror pods
			if _, isMirror := pod.Annotations[corev1.MirrorPodAnnotationKey]; isMirror {
				continue
			}

			// Skip DaemonSet managed pods
			isDaemonSet := false
			for _, owner := range pod.OwnerReferences {
				if owner.Kind == "DaemonSet" {
					isDaemonSet = true
					break
				}
			}
			if isDaemonSet {
				continue
			}

			// Check emptyDir storage
			hasEmptyDir := false
			for _, v := range pod.Spec.Volumes {
				if v.EmptyDir != nil {
					hasEmptyDir = true
					break
				}
			}
			if hasEmptyDir && !deleteEmptyDir {
				return fmt.Errorf("drain blocked: pod %q has local emptyDir data and deleteEmptyDirData was not confirmed", pod.Name)
			}

			// Evict pod using PolicyV1 Eviction API
			eviction := &policyv1.Eviction{
				ObjectMeta: metav1.ObjectMeta{
					Name:      pod.Name,
					Namespace: pod.Namespace,
				},
			}
			if err := e.client.PolicyV1().Evictions(pod.Namespace).Evict(ctx, eviction); err != nil {
				if !apierrors.IsNotFound(err) {
					return fmt.Errorf("drain evicted failed for pod %s/%s: %w", pod.Namespace, pod.Name, err)
				}
			}
		}
		return nil
	}

	return fmt.Errorf("unsupported execution action: %s", actionType)
}

// Verify ensures target reached the intended state
func (e *Executor) Verify(ctx context.Context, action *transport.RemediationAction, timeout time.Duration) error {
	actionType := action.CanonicalType()
	deadline := time.Now().Add(timeout)
	ticker := time.NewTicker(1 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-ticker.C:
			if time.Now().After(deadline) {
				return fmt.Errorf("verification timeout reached (%s)", timeout)
			}

			switch actionType {
			case "ReplacePodImage":
				if action.Target.Kind == "Deployment" {
					dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && dep.Spec.Replicas != nil {
						for _, c := range dep.Spec.Template.Spec.Containers {
							if c.Name == action.Target.Container && c.Image == action.ProposedValue {
								// Check rollout progress across updated, available, and ready replicas
								if dep.Status.UpdatedReplicas == *dep.Spec.Replicas &&
									dep.Status.AvailableReplicas == *dep.Spec.Replicas &&
									dep.Status.ReadyReplicas == *dep.Spec.Replicas &&
									dep.Status.UnavailableReplicas == 0 &&
									dep.Status.ObservedGeneration >= dep.Generation {
									return nil // Verified
								}
							}
						}
					}
				} else if action.Target.Kind == "Pod" {
					pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil {
						// Fail fast on explicit container failure
						for _, cs := range pod.Status.ContainerStatuses {
							if cs.Name == action.Target.Container && cs.State.Waiting != nil {
								if cs.State.Waiting.Reason == "CrashLoopBackOff" || cs.State.Waiting.Reason == "ImagePullBackOff" || cs.State.Waiting.Reason == "ErrImagePull" {
									return fmt.Errorf("container failed: %s (%s)", cs.State.Waiting.Reason, cs.State.Waiting.Message)
								}
							}
						}

						for _, c := range pod.Spec.Containers {
							if c.Name == action.Target.Container && c.Image == action.ProposedValue {
								if len(pod.Status.ContainerStatuses) == 0 || pod.Status.Phase == corev1.PodRunning {
									return nil // Verified
								}
								for _, cs := range pod.Status.ContainerStatuses {
									if cs.Name == action.Target.Container && cs.Ready {
										return nil // Verified
									}
								}
							}
						}
					}
				}

			case "RestartPod":
				if action.Target.Kind == "Pod" {
					pod, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil {
						if pod.Status.Phase == corev1.PodRunning {
							readyCount := 0
							for _, cs := range pod.Status.ContainerStatuses {
								if cs.Ready {
									readyCount++
								}
							}
							if readyCount == len(pod.Spec.Containers) && len(pod.Spec.Containers) > 0 {
								return nil // Verified
							}
						}
					} else {
						// Pod was deleted; verify replacement pod from controller exists and is Running & Ready
						podList, listErr := e.client.CoreV1().Pods(action.Target.Namespace).List(ctx, metav1.ListOptions{})
						if listErr == nil {
							for i := range podList.Items {
								p := &podList.Items[i]
								if string(p.UID) != action.Target.UID && p.Status.Phase == corev1.PodRunning {
									readyCount := 0
									for _, cs := range p.Status.ContainerStatuses {
										if cs.Ready {
											readyCount++
										}
									}
									if readyCount == len(p.Spec.Containers) && len(p.Spec.Containers) > 0 {
										return nil
									}
								}
							}
						}
					}
				} else if action.Target.Kind == "Deployment" {
					dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && dep.Spec.Replicas != nil {
						if dep.Status.UpdatedReplicas == *dep.Spec.Replicas &&
							dep.Status.AvailableReplicas == *dep.Spec.Replicas &&
							dep.Status.ReadyReplicas == *dep.Spec.Replicas &&
							dep.Status.UnavailableReplicas == 0 &&
							dep.Status.ObservedGeneration >= dep.Generation {
							return nil
						}
					}
				}

			case "DeletePod":
				_, err := e.client.CoreV1().Pods(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if apierrors.IsNotFound(err) {
					return nil // Verified deleted
				}

			case "RolloutRestart":
				kind := strings.ToLower(action.Target.Kind)
				if kind == "deployment" {
					dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && dep.Spec.Replicas != nil {
						if dep.Status.UpdatedReplicas == *dep.Spec.Replicas &&
							dep.Status.AvailableReplicas == *dep.Spec.Replicas &&
							dep.Status.ReadyReplicas == *dep.Spec.Replicas &&
							dep.Status.UnavailableReplicas == 0 &&
							dep.Status.ObservedGeneration >= dep.Generation {
							return nil // Verified
						}
					}
				} else if kind == "statefulset" {
					sts, err := e.client.AppsV1().StatefulSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && sts.Spec.Replicas != nil {
						if sts.Status.UpdatedReplicas == *sts.Spec.Replicas && sts.Status.ReadyReplicas == *sts.Spec.Replicas {
							return nil
						}
					}
				} else if kind == "daemonset" {
					ds, err := e.client.AppsV1().DaemonSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil {
						if ds.Status.UpdatedNumberScheduled == ds.Status.DesiredNumberScheduled &&
							ds.Status.NumberReady == ds.Status.DesiredNumberScheduled {
							return nil
						}
					}
				}

			case "RollbackDeployment":
				dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && dep.Spec.Replicas != nil {
					if dep.Status.UpdatedReplicas == *dep.Spec.Replicas &&
						dep.Status.AvailableReplicas == *dep.Spec.Replicas &&
						dep.Status.ReadyReplicas == *dep.Spec.Replicas &&
						dep.Status.UnavailableReplicas == 0 &&
						dep.Status.ObservedGeneration >= dep.Generation {
						return nil // Verified
					}
				}

			case "ScaleDeployment":
				dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && dep.Spec.Replicas != nil {
					target, _ := strconv.Atoi(action.ProposedValue)
					if int(*dep.Spec.Replicas) == target {
						if target == 0 {
							if dep.Status.Replicas == 0 || dep.Status.AvailableReplicas == 0 {
								return nil // Verified scaled to 0
							}
						} else {
							if int(dep.Status.UpdatedReplicas) == target &&
								int(dep.Status.AvailableReplicas) == target &&
								int(dep.Status.ReadyReplicas) == target &&
								dep.Status.UnavailableReplicas == 0 {
								return nil // Verified scaled up/down
							}
						}
					}
				}

			case "ScaleWorkload":
				kind := strings.ToLower(action.Target.Kind)
				target, _ := strconv.Atoi(action.ProposedValue)
				if kind == "deployment" {
					dep, err := e.client.AppsV1().Deployments(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && dep.Spec.Replicas != nil && int(*dep.Spec.Replicas) == target {
						if target == 0 || (int(dep.Status.ReadyReplicas) == target && dep.Status.UnavailableReplicas == 0) {
							return nil
						}
					}
				} else if kind == "statefulset" {
					sts, err := e.client.AppsV1().StatefulSets(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
					if err == nil && sts.Spec.Replicas != nil && int(*sts.Spec.Replicas) == target {
						if target == 0 || int(sts.Status.ReadyReplicas) == target {
							return nil
						}
					}
				}

			case "SuspendCronJob":
				cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && cj.Spec.Suspend != nil && *cj.Spec.Suspend {
					return nil // Verified suspended
				}

			case "ResumeCronJob":
				cj, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && (cj.Spec.Suspend == nil || !*cj.Spec.Suspend) {
					return nil // Verified active
				}

			case "TriggerCronJob", "RerunJob":
				return nil // Job creation verified upon successful API Create call

			case "DeleteJob":
				_, err := e.client.BatchV1().Jobs(action.Target.Namespace).Get(ctx, action.Target.Name, metav1.GetOptions{})
				if apierrors.IsNotFound(err) {
					return nil // Verified deleted
				}

			case "CordonNode":
				node, err := e.client.CoreV1().Nodes().Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && node.Spec.Unschedulable {
					return nil // Verified cordoned
				}

			case "UncordonNode":
				node, err := e.client.CoreV1().Nodes().Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && !node.Spec.Unschedulable {
					return nil // Verified uncordoned
				}

			case "DrainNode":
				node, err := e.client.CoreV1().Nodes().Get(ctx, action.Target.Name, metav1.GetOptions{})
				if err == nil && node.Spec.Unschedulable {
					pods, listErr := e.client.CoreV1().Pods("").List(ctx, metav1.ListOptions{
						FieldSelector: fmt.Sprintf("spec.nodeName=%s", action.Target.Name),
					})
					if listErr == nil {
						remainingEligible := 0
						for i := range pods.Items {
							p := &pods.Items[i]
							if _, isMirror := p.Annotations[corev1.MirrorPodAnnotationKey]; isMirror {
								continue
							}
							isDaemon := false
							for _, o := range p.OwnerReferences {
								if o.Kind == "DaemonSet" {
									isDaemon = true
									break
								}
							}
							if !isDaemon {
								remainingEligible++
							}
						}
						if remainingEligible == 0 {
							return nil // Drain verified: zero eligible non-daemon pods remain
						}
					}
				}
			}
		}
	}
}

// Rollback reverts target to previous state if verification failed
func (e *Executor) Rollback(ctx context.Context, action *transport.RemediationAction, previousState string) error {
	if previousState == "" {
		return fmt.Errorf("cannot rollback without known previous state")
	}

	actionType := action.CanonicalType()

	switch actionType {
	case "ReplacePodImage":
		if action.Target.Kind == "Deployment" {
			patch := fmt.Sprintf(`{"spec":{"template":{"spec":{"containers":[{"name":%q,"image":%q}]}}}}`, action.Target.Container, previousState)
			_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
			return err
		}
	case "RolloutRestart":
		patchMap := map[string]interface{}{
			"spec": map[string]interface{}{
				"template": map[string]interface{}{
					"metadata": map[string]interface{}{
						"annotations": map[string]string{
							"kubectl.kubernetes.io/restartedAt": previousState,
						},
					},
				},
			},
		}
		patchBytes, _ := json.Marshal(patchMap)
		_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
		return err
	case "RollbackDeployment":
		var prevTemplate corev1.PodTemplateSpec
		if err := json.Unmarshal([]byte(previousState), &prevTemplate); err == nil {
			patchMap := map[string]interface{}{
				"spec": map[string]interface{}{
					"template": prevTemplate,
				},
			}
			patchBytes, _ := json.Marshal(patchMap)
			_, err := e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, patchBytes, metav1.PatchOptions{})
			return err
		}
	case "ScaleDeployment":
		prevReplicas, err := strconv.Atoi(previousState)
		if err == nil {
			patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, prevReplicas)
			_, err = e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
			return err
		}
	case "ScaleWorkload":
		prevReplicas, err := strconv.Atoi(previousState)
		if err == nil {
			kind := strings.ToLower(action.Target.Kind)
			patch := fmt.Sprintf(`{"spec":{"replicas":%d}}`, prevReplicas)
			if kind == "deployment" {
				_, err = e.client.AppsV1().Deployments(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
				return err
			} else if kind == "statefulset" {
				_, err = e.client.AppsV1().StatefulSets(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
				return err
			}
		}
	case "SuspendCronJob":
		prevSuspend, _ := strconv.ParseBool(previousState)
		patch := fmt.Sprintf(`{"spec":{"suspend":%t}}`, prevSuspend)
		_, err := e.client.BatchV1().CronJobs(action.Target.Namespace).Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err
	case "CordonNode", "UncordonNode":
		prevUnschedulable, _ := strconv.ParseBool(previousState)
		patch := fmt.Sprintf(`{"spec":{"unschedulable":%t}}`, prevUnschedulable)
		_, err := e.client.CoreV1().Nodes().Patch(ctx, action.Target.Name, types.StrategicMergePatchType, []byte(patch), metav1.PatchOptions{})
		return err
	}
	return nil
}
