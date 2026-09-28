package spool

import (
	"context"
	"crypto/rand"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"hash/crc32"
	"io"
	"log/slog"
	"os"
	"os/signal"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/skyops-io/skyops/agent/internal/types"
)

var (
	ErrSpoolEmpty   = errors.New("spool is empty")
	ErrSpoolCorrupt = errors.New("spool file corrupted or failed checksum")
	ErrSpoolClosed  = errors.New("spool is closed")
)

// Spool provides persistent disk-backed buffering for telemetry batches during backend outages
type Spool struct {
	mu           sync.RWMutex
	dir          string
	maxBytes     int64
	memThreshold int                     // Threshold count of in-memory batches before flushing to disk
	memBuffer    []*types.TelemetryBatch // In-memory staging buffer
	fileIndex    []string                // In-memory index of sorted .dat files (prevents disk thrashing & memory exhaustion)
	closed       bool
	sigChan      chan os.Signal
}

type spoolEntryHeader struct {
	Magic     uint32 `json:"magic"`
	CRC32     uint32 `json:"crc32"`
	Length    int    `json:"length"`
	Timestamp int64  `json:"timestamp"`
}

const spoolMagic uint32 = 0x534B5953 // "SKYS"

func NewSpool(dir string, maxBytes int64) (*Spool, error) {
	if maxBytes <= 0 {
		maxBytes = 50 * 1024 * 1024 // 50MB default
	}

	// Try creating target directory
	if err := os.MkdirAll(dir, 0750); err != nil {
		slog.Warn("Failed to create primary spool directory; falling back to temporary spool dir", "primary", dir, "error", err)
		dir = filepath.Join(os.TempDir(), "skyops-spool")
		if err := os.MkdirAll(dir, 0750); err != nil {
			return nil, fmt.Errorf("failed to create fallback spool directory %q: %w", dir, err)
		}
	}

	// Verify directory is writable
	testFile := filepath.Join(dir, ".perm_test")
	if err := os.WriteFile(testFile, []byte("ok"), 0600); err != nil {
		slog.Warn("Primary spool directory is not writable; falling back to temporary spool dir", "primary", dir, "error", err)
		dir = filepath.Join(os.TempDir(), "skyops-spool")
		_ = os.MkdirAll(dir, 0750)
	} else {
		_ = os.Remove(testFile)
	}

	s := &Spool{
		dir:          dir,
		maxBytes:     maxBytes,
		memThreshold: 1, // Default to immediate disk persistence for strict durability
		memBuffer:    make([]*types.TelemetryBatch, 0, 16),
		fileIndex:    make([]string, 0),
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	// Crash-recovery on startup: purge incomplete .tmp files
	s.cleanTmpFilesLocked()

	// Crash-recovery on startup: scan, re-index, and validate existing .dat files without loading payload into RAM
	s.recoverAndReindexLocked()

	// Attach OS shutdown signal hook (SIGINT/SIGTERM) to flush in-memory buffers
	s.initSignalHandlerLocked()

	return s, nil
}

func (s *Spool) Dir() string {
	s.mu.RLock()
	defer s.mu.RUnlock()
	return s.dir
}

// SetMemThreshold configures the number of batches buffered in memory before triggering an automatic disk flush
func (s *Spool) SetMemThreshold(threshold int) {
	s.mu.Lock()
	defer s.mu.Unlock()
	if threshold > 0 {
		s.memThreshold = threshold
	}
}

func (s *Spool) initSignalHandlerLocked() {
	s.sigChan = make(chan os.Signal, 2)
	signal.Notify(s.sigChan, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		sig, ok := <-s.sigChan
		if !ok {
			return
		}
		slog.Info("OS shutdown signal received in spool manager; flushing in-memory telemetry buffers to disk",
			"signal", sig.String(),
		)
		_ = s.Flush()
	}()
}

func (s *Spool) cleanTmpFilesLocked() {
	files, err := os.ReadDir(s.dir)
	if err != nil {
		return
	}
	for _, f := range files {
		if strings.HasSuffix(f.Name(), ".tmp") {
			_ = os.Remove(filepath.Join(s.dir, f.Name()))
		}
	}
}

// recoverAndReindexLocked executes crash recovery on startup.
// It inspects headers of existing spool files without loading full payloads into memory,
// eliminating memory exhaustion risk even when thousands of spool files reside on disk.
func (s *Spool) recoverAndReindexLocked() {
	entries, err := os.ReadDir(s.dir)
	if err != nil {
		slog.Error("Failed to scan spool directory for crash recovery", "dir", s.dir, "error", err)
		return
	}

	var validFiles []string
	hdrLenBuf := make([]byte, 4)

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".dat") {
			continue
		}

		filePath := filepath.Join(s.dir, e.Name())
		f, err := os.Open(filePath)
		if err != nil {
			continue
		}

		// Read only the 4-byte header length without reading payload
		_, err = io.ReadFull(f, hdrLenBuf)
		if err != nil {
			_ = f.Close()
			slog.Warn("Quarantining truncated/corrupted spool file during crash recovery", "file", e.Name())
			_ = os.Rename(filePath, filePath+".corrupt")
			continue
		}

		hdrLen := int(binary.BigEndian.Uint32(hdrLenBuf))
		if hdrLen <= 0 || hdrLen > 64*1024 { // Sanity check header length
			_ = f.Close()
			slog.Warn("Quarantining invalid header spool file during crash recovery", "file", e.Name())
			_ = os.Rename(filePath, filePath+".corrupt")
			continue
		}

		hdrBuf := make([]byte, hdrLen)
		_, err = io.ReadFull(f, hdrBuf)
		_ = f.Close()
		if err != nil {
			slog.Warn("Quarantining incomplete header spool file during crash recovery", "file", e.Name())
			_ = os.Rename(filePath, filePath+".corrupt")
			continue
		}

		var hdr spoolEntryHeader
		if err := json.Unmarshal(hdrBuf, &hdr); err != nil || hdr.Magic != spoolMagic {
			slog.Warn("Quarantining corrupt magic spool file during crash recovery", "file", e.Name())
			_ = os.Rename(filePath, filePath+".corrupt")
			continue
		}

		validFiles = append(validFiles, e.Name())
	}

	sort.Strings(validFiles) // Chronological order (spool-%020d...)
	s.fileIndex = validFiles

	if len(validFiles) > 0 {
		slog.Info("Spool crash-recovery completed: successfully re-indexed un-flushed spool batches",
			"recoveredBatches", len(validFiles),
			"dir", s.dir,
		)
	}
}

// WriteBatch writes a telemetry batch directly to disk storage with CRC32 integrity check and hardware sync
func (s *Spool) WriteBatch(batch *types.TelemetryBatch) error {
	if batch == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return ErrSpoolClosed
	}

	return s.writeSingleBatchLocked(batch)
}

// BufferBatch buffers a telemetry batch in memory, flushing to persistent disk storage
// upon reaching the configured memThreshold
func (s *Spool) BufferBatch(batch *types.TelemetryBatch) error {
	if batch == nil {
		return nil
	}

	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return ErrSpoolClosed
	}

	s.memBuffer = append(s.memBuffer, batch)
	if len(s.memBuffer) >= s.memThreshold {
		return s.flushLocked()
	}

	return nil
}

// Flush flushes all pending in-memory batches to persistent disk storage
func (s *Spool) Flush() error {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.flushLocked()
}

func (s *Spool) flushLocked() error {
	if len(s.memBuffer) == 0 {
		return nil
	}

	for _, batch := range s.memBuffer {
		if err := s.writeSingleBatchLocked(batch); err != nil {
			return fmt.Errorf("failed to flush batch to disk: %w", err)
		}
	}

	s.memBuffer = s.memBuffer[:0]
	return nil
}

// writeSingleBatchLocked serializes and persists a batch to disk with hardware sync (file.Sync)
func (s *Spool) writeSingleBatchLocked(batch *types.TelemetryBatch) error {
	data, err := json.Marshal(batch)
	if err != nil {
		return fmt.Errorf("failed to marshal batch for spooling: %w", err)
	}

	checksum := crc32.ChecksumIEEE(data)
	header := spoolEntryHeader{
		Magic:     spoolMagic,
		CRC32:     checksum,
		Length:    len(data),
		Timestamp: time.Now().UnixMilli(),
	}

	headerBytes, err := json.Marshal(header)
	if err != nil {
		return err
	}

	// Format on disk: 4-byte header length + header JSON + raw data JSON
	hdrLenBytes := make([]byte, 4)
	binary.BigEndian.PutUint32(hdrLenBytes, uint32(len(headerBytes)))

	var payload []byte
	payload = append(payload, hdrLenBytes...)
	payload = append(payload, headerBytes...)
	payload = append(payload, data...)

	// Enforce disk quota before write
	s.pruneOldestLocked(int64(len(payload)))

	randBytes := make([]byte, 4)
	_, _ = rand.Read(randBytes)
	randStr := hex.EncodeToString(randBytes)

	ts := time.Now().UnixNano()
	tmpPath := filepath.Join(s.dir, fmt.Sprintf("spool-%020d-%s.tmp", ts, randStr))
	finalName := fmt.Sprintf("spool-%020d-%s.dat", ts, randStr)
	finalPath := filepath.Join(s.dir, finalName)

	// Open file with strict permissions
	tmpFile, err := os.OpenFile(tmpPath, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0600)
	if err != nil {
		return fmt.Errorf("open spool tmp file: %w", err)
	}

	if _, err := tmpFile.Write(payload); err != nil {
		_ = tmpFile.Close()
		_ = os.Remove(tmpPath)
		return fmt.Errorf("write spool tmp file: %w", err)
	}

	// DISK-SYNC WRITE POINT: guarantee physical disk sync to prevent corruption across power outages
	if err := tmpFile.Sync(); err != nil {
		slog.Warn("Hardware disk sync warning for spool file", "error", err)
	}

	if err := tmpFile.Close(); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("close spool tmp file: %w", err)
	}

	// Atomic commit via rename
	if err := os.Rename(tmpPath, finalPath); err != nil {
		_ = os.Remove(tmpPath)
		return fmt.Errorf("rename spool file: %w", err)
	}

	// Maintain in-memory sorted index
	s.fileIndex = append(s.fileIndex, finalName)

	return nil
}

// ReadOldestBatch retrieves the oldest available spooled batch from disk
func (s *Spool) ReadOldestBatch() (*types.TelemetryBatch, string, error) {
	s.mu.Lock()
	defer s.mu.Unlock()

	for {
		if len(s.fileIndex) == 0 {
			return nil, "", ErrSpoolEmpty
		}

		fileName := s.fileIndex[0]
		filePath := filepath.Join(s.dir, fileName)

		raw, err := os.ReadFile(filePath)
		if err != nil {
			// File missing or unreadable, remove from index and try next
			s.fileIndex = s.fileIndex[1:]
			continue
		}

		if len(raw) < 4 {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", ErrSpoolCorrupt
		}

		hdrLen := int(binary.BigEndian.Uint32(raw[:4]))
		if len(raw) < 4+hdrLen {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", ErrSpoolCorrupt
		}

		var header spoolEntryHeader
		if err := json.Unmarshal(raw[4:4+hdrLen], &header); err != nil || header.Magic != spoolMagic {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", ErrSpoolCorrupt
		}

		batchBytes := raw[4+hdrLen:]
		if len(batchBytes) != header.Length {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", ErrSpoolCorrupt
		}

		if crc32.ChecksumIEEE(batchBytes) != header.CRC32 {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", ErrSpoolCorrupt
		}

		var batch types.TelemetryBatch
		if err := json.Unmarshal(batchBytes, &batch); err != nil {
			_ = os.Remove(filePath)
			s.fileIndex = s.fileIndex[1:]
			return nil, "", fmt.Errorf("unmarshal spooled batch: %w", err)
		}

		return &batch, filePath, nil
	}
}

// AckBatch removes a successfully uploaded spooled batch file and updates the in-memory index
func (s *Spool) AckBatch(filePath string) error {
	s.mu.Lock()
	defer s.mu.Unlock()

	baseName := filepath.Base(filePath)
	for i, f := range s.fileIndex {
		if f == baseName {
			s.fileIndex = append(s.fileIndex[:i], s.fileIndex[i+1:]...)
			break
		}
	}

	return os.Remove(filePath)
}

// Drain streams un-flushed spool files one-by-one from disk into the transport pipeline.
// Only a single batch is loaded into memory at a time to prevent memory exhaustion.
func (s *Spool) Drain(ctx context.Context, handler func(*types.TelemetryBatch) error) error {
	for {
		select {
		case <-ctx.Done(): // Goroutine leak and context timeout guard
			return ctx.Err()
		default:
		}

		batch, filePath, err := s.ReadOldestBatch()
		if err != nil {
			if errors.Is(err, ErrSpoolEmpty) {
				return nil // All batches successfully drained
			}
			return err
		}

		// Dispatch batch to downstream transport handler
		if err := handler(batch); err != nil {
			slog.Warn("Spool drain paused due to handler transmission failure", "file", filePath, "error", err)
			return err
		}

		if err := s.AckBatch(filePath); err != nil {
			slog.Warn("Failed to ack spooled batch file after delivery", "file", filePath, "error", err)
		}
	}
}

// Stats returns count of files and total disk bytes used
func (s *Spool) Stats() (int, int64) {
	s.mu.RLock()
	defer s.mu.RUnlock()

	var totalBytes int64
	for _, f := range s.fileIndex {
		if fi, err := os.Stat(filepath.Join(s.dir, f)); err == nil {
			totalBytes += fi.Size()
		}
	}
	return len(s.fileIndex), totalBytes
}

func (s *Spool) pruneOldestLocked(neededBytes int64) {
	var totalBytes int64
	fileSizes := make(map[string]int64)
	for _, f := range s.fileIndex {
		if fi, err := os.Stat(filepath.Join(s.dir, f)); err == nil {
			totalBytes += fi.Size()
			fileSizes[f] = fi.Size()
		}
	}

	// If current size + needed exceeds maxBytes, delete oldest files
	for len(s.fileIndex) > 0 && (totalBytes+neededBytes > s.maxBytes) {
		oldest := s.fileIndex[0]
		_ = os.Remove(filepath.Join(s.dir, oldest))
		totalBytes -= fileSizes[oldest]
		s.fileIndex = s.fileIndex[1:]
		slog.Warn("Pruned oldest spooled telemetry batch due to disk limit", "file", oldest)
	}
}

// Close flushes all remaining in-memory buffers and releases resources
func (s *Spool) Close() error {
	s.mu.Lock()
	defer s.mu.Unlock()

	if s.closed {
		return nil
	}

	s.closed = true
	if s.sigChan != nil {
		signal.Stop(s.sigChan)
		close(s.sigChan)
	}

	return s.flushLocked()
}

