package inspectors

import (
	"context"
	"os"
	"path/filepath"
	"testing"

	corev1 "k8s.io/api/core/v1"
	"k8s.io/apimachinery/pkg/api/resource"
	metav1 "k8s.io/apimachinery/pkg/apis/meta/v1"
	"k8s.io/client-go/kubernetes/fake"
)

func TestPVCInspector_DiskPressureEvaluation(t *testing.T) {
	ctx := context.Background()
	fakeK8s := fake.NewSimpleClientset()

	// Seed PVCs in default namespace
	scName := "standard"
	pvc1 := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "pvc-normal",
			Namespace: "default",
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			VolumeName:       "pvc-vol-1",
			StorageClassName: &scName,
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("10Gi"),
				},
			},
		},
		Status: corev1.PersistentVolumeClaimStatus{
			Phase: corev1.ClaimBound,
		},
	}

	pvc2 := &corev1.PersistentVolumeClaim{
		ObjectMeta: metav1.ObjectMeta{
			Name:      "pvc-pressure",
			Namespace: "default",
		},
		Spec: corev1.PersistentVolumeClaimSpec{
			VolumeName:       "pvc-vol-2",
			StorageClassName: &scName,
			AccessModes:      []corev1.PersistentVolumeAccessMode{corev1.ReadWriteOnce},
			Resources: corev1.VolumeResourceRequirements{
				Requests: corev1.ResourceList{
					corev1.ResourceStorage: resource.MustParse("100Gi"),
				},
			},
		},
		Status: corev1.PersistentVolumeClaimStatus{
			Phase: corev1.ClaimBound,
		},
	}

	_, err := fakeK8s.CoreV1().PersistentVolumeClaims("default").Create(ctx, pvc1, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}
	_, err = fakeK8s.CoreV1().PersistentVolumeClaims("default").Create(ctx, pvc2, metav1.CreateOptions{})
	if err != nil {
		t.Fatal(err)
	}

	tempDir := t.TempDir()
	if err := os.MkdirAll(filepath.Join(tempDir, "pvc-vol-1"), 0755); err != nil {
		t.Fatal(err)
	}
	if err := os.MkdirAll(filepath.Join(tempDir, "pvc-vol-2"), 0755); err != nil {
		t.Fatal(err)
	}

	inspector := NewPVCInspector(fakeK8s, []string{tempDir}, 85.0)

	// Direct evaluation of PVC 1 with normal storage (50% used)
	inspector.SetStatfsFn(func(path string) (*DiskStat, error) {
		return &DiskStat{
			TotalBytes:        100 * 1024 * 1024 * 1024,
			UsedBytes:         50 * 1024 * 1024 * 1024,
			FreeBytes:         50 * 1024 * 1024 * 1024,
			AvailableBytes:    50 * 1024 * 1024 * 1024,
			UsedPercent:       50.0,
			TotalInodes:       1000000,
			UsedInodes:        200000,
			FreeInodes:        800000,
			InodesUsedPercent: 20.0,
			IsReadOnly:        false,
		}, nil
	})

	rep1 := inspector.evaluatePVC(pvc1)
	if rep1.DiskPressure {
		t.Errorf("expected no disk pressure for 50%% utilization, got true")
	}
	if rep1.DiskPressureSeverity != "NORMAL" {
		t.Errorf("expected NORMAL severity, got %s", rep1.DiskPressureSeverity)
	}

	// Evaluation with disk pressure (>85% threshold, e.g. 89%)
	inspector.SetStatfsFn(func(path string) (*DiskStat, error) {
		return &DiskStat{
			TotalBytes:        100 * 1024 * 1024 * 1024,
			UsedBytes:         89 * 1024 * 1024 * 1024,
			FreeBytes:         11 * 1024 * 1024 * 1024,
			AvailableBytes:    11 * 1024 * 1024 * 1024,
			UsedPercent:       89.0,
			TotalInodes:       1000000,
			UsedInodes:        920000,
			FreeInodes:        80000,
			InodesUsedPercent: 92.0,
			IsReadOnly:        false,
		}, nil
	})

	rep2 := inspector.evaluatePVC(pvc2)
	if !rep2.DiskPressure {
		t.Errorf("expected disk pressure for 89%% utilization, got false")
	}
	if rep2.DiskPressureSeverity != "WARNING" {
		t.Errorf("expected WARNING severity, got %s", rep2.DiskPressureSeverity)
	}
	if !rep2.InodePressure {
		t.Errorf("expected inode pressure for 92%% inode usage, got false")
	}

	// Verify Telemetry Observation conversion
	obs := inspector.ToTelemetryObservations([]PVCInspectionReport{rep1, rep2}, "cluster-test-1")
	if len(obs) != 2 {
		t.Fatalf("expected 2 telemetry observations, got %d", len(obs))
	}
	if obs[1].Health != "WARNING" {
		t.Errorf("expected observation health WARNING for pressured PVC, got %s", obs[1].Health)
	}
}
