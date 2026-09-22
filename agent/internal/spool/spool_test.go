package spool

import (
	"os"
	"testing"

	"github.com/skyops-io/skyops/agent/internal/types"
)

func TestSpoolWriteReadAck(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "skyops-spool-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	sp, err := NewSpool(tempDir, 1024*1024)
	if err != nil {
		t.Fatal(err)
	}

	batch := &types.TelemetryBatch{
		ClusterID:        "cls-spool-1",
		Timestamp:        12345678,
		SnapshotComplete: true,
	}

	if err := sp.WriteBatch(batch); err != nil {
		t.Fatalf("failed to write batch: %v", err)
	}

	count, bytesUsed := sp.Stats()
	if count != 1 || bytesUsed == 0 {
		t.Fatalf("expected 1 file, got %d (bytes=%d)", count, bytesUsed)
	}

	readBatch, filePath, err := sp.ReadOldestBatch()
	if err != nil {
		t.Fatalf("failed to read oldest batch: %v", err)
	}

	if readBatch.ClusterID != "cls-spool-1" {
		t.Errorf("expected cls-spool-1, got %s", readBatch.ClusterID)
	}

	if err := sp.AckBatch(filePath); err != nil {
		t.Fatalf("failed to ack batch: %v", err)
	}

	countAfter, bytesAfter := sp.Stats()
	if countAfter != 0 || bytesAfter != 0 {
		t.Fatalf("expected 0 files after ack, got %d", countAfter)
	}

	// Verify empty read
	_, _, err = sp.ReadOldestBatch()
	if err != ErrSpoolEmpty {
		t.Fatalf("expected ErrSpoolEmpty, got %v", err)
	}
}

func TestSpoolQuotaPruning(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "skyops-spool-test-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Max 500 bytes quota
	sp, err := NewSpool(tempDir, 500)
	if err != nil {
		t.Fatal(err)
	}

	b1 := &types.TelemetryBatch{ClusterID: "b1", Timestamp: 1000}
	b2 := &types.TelemetryBatch{ClusterID: "b2", Timestamp: 2000}
	b3 := &types.TelemetryBatch{ClusterID: "b3", Timestamp: 3000}

	_ = sp.WriteBatch(b1)
	_ = sp.WriteBatch(b2)
	_ = sp.WriteBatch(b3)

	_, totalBytes := sp.Stats()
	if totalBytes > 500 {
		t.Errorf("spool exceeded quota: %d bytes > 500 bytes", totalBytes)
	}

	// Should read the latest available (oldest unpruned)
	readBatch, _, err := sp.ReadOldestBatch()
	if err != nil {
		t.Fatalf("failed to read batch: %v", err)
	}
	if readBatch.ClusterID == "b1" {
		t.Errorf("expected b1 to have been pruned, but read it")
	}
}

func TestSpool_CrashRecoveryAndCorruptQuarantine(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "skyops-spool-recovery-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	// Create initial spool instance and write 2 batches
	sp1, err := NewSpool(tempDir, 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	_ = sp1.WriteBatch(&types.TelemetryBatch{ClusterID: "rec-1", Timestamp: 100})
	_ = sp1.WriteBatch(&types.TelemetryBatch{ClusterID: "rec-2", Timestamp: 200})

	// Inject a truncated/corrupt .dat file to simulate power loss or write failure
	corruptPath := tempDir + "/spool-00000000000000000150-corrupt.dat"
	if err := os.WriteFile(corruptPath, []byte("bad"), 0600); err != nil {
		t.Fatal(err)
	}

	// Inject a stray .tmp file to simulate crash during write
	tmpPath := tempDir + "/spool-00000000000000000160-leftover.tmp"
	if err := os.WriteFile(tmpPath, []byte("incomplete"), 0600); err != nil {
		t.Fatal(err)
	}

	_ = sp1.Close()

	// Re-initialize a new Spool instance pointing to the same directory (crash restart)
	sp2, err := NewSpool(tempDir, 1024*1024)
	if err != nil {
		t.Fatalf("failed to initialize spool on crash recovery: %v", err)
	}
	defer sp2.Close()

	// Verify stray .tmp file was purged
	if _, err := os.Stat(tmpPath); !os.IsNotExist(err) {
		t.Errorf("stray .tmp file was not purged during startup crash recovery")
	}

	// Verify corrupt file was quarantined (.corrupt extension)
	if _, err := os.Stat(corruptPath); !os.IsNotExist(err) {
		t.Errorf("corrupt file was not renamed during crash recovery")
	}
	if _, err := os.Stat(corruptPath + ".corrupt"); os.IsNotExist(err) {
		t.Errorf("expected quarantined .corrupt file to exist")
	}

	// Verify valid batches were recovered into index
	count, _ := sp2.Stats()
	if count != 2 {
		t.Fatalf("expected 2 recovered valid batches in index, got %d", count)
	}

	b1, path1, err := sp2.ReadOldestBatch()
	if err != nil || b1.ClusterID != "rec-1" {
		t.Fatalf("expected to read rec-1, got %v (err: %v)", b1, err)
	}
	_ = sp2.AckBatch(path1)

	b2, path2, err := sp2.ReadOldestBatch()
	if err != nil || b2.ClusterID != "rec-2" {
		t.Fatalf("expected to read rec-2, got %v (err: %v)", b2, err)
	}
	_ = sp2.AckBatch(path2)
}

func TestSpool_InMemoryBufferThresholdAndFlush(t *testing.T) {
	tempDir, err := os.MkdirTemp("", "skyops-spool-mem-*")
	if err != nil {
		t.Fatal(err)
	}
	defer os.RemoveAll(tempDir)

	sp, err := NewSpool(tempDir, 1024*1024)
	if err != nil {
		t.Fatal(err)
	}
	defer sp.Close()

	// Configure in-memory threshold of 3 batches
	sp.SetMemThreshold(3)

	// Buffer 1st batch
	if err := sp.BufferBatch(&types.TelemetryBatch{ClusterID: "mem-1"}); err != nil {
		t.Fatal(err)
	}
	count, _ := sp.Stats()
	if count != 0 {
		t.Fatalf("expected 0 files on disk before threshold reached, got %d", count)
	}

	// Buffer 2nd batch
	if err := sp.BufferBatch(&types.TelemetryBatch{ClusterID: "mem-2"}); err != nil {
		t.Fatal(err)
	}
	count, _ = sp.Stats()
	if count != 0 {
		t.Fatalf("expected 0 files on disk before threshold reached, got %d", count)
	}

	// Buffer 3rd batch: reaches threshold, triggers auto flush to disk
	if err := sp.BufferBatch(&types.TelemetryBatch{ClusterID: "mem-3"}); err != nil {
		t.Fatal(err)
	}
	count, _ = sp.Stats()
	if count != 3 {
		t.Fatalf("expected 3 files on disk after threshold auto-flush, got %d", count)
	}
}

