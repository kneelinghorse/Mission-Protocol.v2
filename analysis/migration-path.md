# Migration Path: Optional CMOS Integration

## Overview

This document provides a migration path to make Mission Protocol work independently while adding optional CMOS integration. The `cmos/` directory is internal project management and will be removed before publishing.

## Migration Strategy

### Approach: Self-Containment First, Optional Integration Second

1. **Make Mission Protocol work without `cmos/`** (required)
2. **Add optional CMOS detection and sync** (enhancement)
3. **Ensure `cmos/` can be removed without breaking anything** (validation)

## Pre-Migration Checklist

### Prerequisites
- [ ] Mission Protocol v2.0+ codebase
- [ ] All tests passing with current `cmos/` structure
- [ ] Backup of current state
- [ ] Understanding of which code depends on `cmos/`

### Assessment
- [ ] Identify all hardcoded `cmos/` paths
- [ ] Document current dependencies on `cmos/` structure
- [ ] Test current behavior without `cmos/`
- [ ] Plan path changes

## Migration Phases

### Phase 0: Preparation (1 day)

#### Step 1: Backup Current State
```bash
# Create backup
mkdir -p backup/pre-migration-$(date +%Y%m%d)
cp -r cmos/ backup/pre-migration-$(date +%Y%m%d)/
cp agents.md backup/pre-migration-$(date +%Y%m%d)/
cp SESSIONS.jsonl backup/pre-migration-$(date +%Y%m%d)/ 2>/dev/null || true
cp PROJECT_CONTEXT.json backup/pre-migration-$(date +%Y%m%d)/ 2>/dev/null || true
cp agentic_state.json backup/pre-migration-$(date +%Y%m%d)/ 2>/dev/null || true
```

#### Step 2: Identify Hardcoded Paths
```bash
# Find all references to cmos/
grep -r "cmos/" src/ --include="*.ts" --include="*.js"

# Expected findings:
# - src/intelligence/agentic-controller.ts: DEFAULT_STATE_PATH
# - src/intelligence/agentic-controller.ts: DEFAULT_SESSIONS_PATH
# - Possibly other path references
```

#### Step 3: Test Current Behavior Without cmos/
```bash
# Temporarily hide cmos/
mv cmos cmos.test-hide

# Run tests to see what breaks
npm test 2>&1 | tee test-without-cmos.log

# Restore cmos/
mv cmos.test-hide cmos
```

### Phase 1: Make Paths Configurable (2-3 days)

#### Step 1: Update Default Paths in agentic-controller.ts
```typescript
// src/intelligence/agentic-controller.ts

// BEFORE:
const DEFAULT_STATE_PATH = 'cmos/context/agentic_state.json';
const DEFAULT_SESSIONS_PATH = 'cmos/SESSIONS.jsonl';

// AFTER:
const DEFAULT_STATE_PATH = 'agentic_state.json';
const DEFAULT_SESSIONS_PATH = 'SESSIONS.jsonl';
```

#### Step 2: Update Agents MD Loader Paths
```typescript
// src/intelligence/agents-md-loader.ts

// Ensure it looks for agents.md in project root by default
// Already configurable via options, just verify defaults are sensible
```

#### Step 3: Move Current Files to Project Root
```bash
# Copy current files to project root (don't move yet)
cp cmos/context/agentic_state.json ./agentic_state.json
cp cmos/SESSIONS.jsonl ./SESSIONS.jsonl
cp cmos/PROJECT_CONTEXT.json ./PROJECT_CONTEXT.json

# Verify they exist
ls -la agentic_state.json SESSIONS.jsonl PROJECT_CONTEXT.json
```

#### Step 4: Test With Files in Both Locations
```bash
# Run tests - should work with files in both locations
npm test

# Verify which files are being used
# (May need to add logging to see which paths are accessed)
```

#### Step 5: Update Configuration Loading
```typescript
// Add path configuration to agents.md playbook

## Paths
- `state_path`: './agentic_state.json'
- `sessions_path`: './SESSIONS.jsonl'
- `project_context_path`: './PROJECT_CONTEXT.json'
```

### Phase 2: Test Without cmos/ Directory (2 days)

#### Step 1: Hide cmos/ and Test
```bash
# Hide cmos/
mv cmos cmos.phase2-test

# Run all tests
npm test

# Expected: All tests should pass
```

#### Step 2: Test Mission Execution
```bash
# Run a test mission
npm run mission:test -- --mission-id=phase2-test

# Should work without cmos/
```

#### Step 3: Verify File Operations
```bash
# Check that files are being written to project root
ls -la agentic_state.json SESSIONS.jsonl

# Should see updates
```

#### Step 4: Restore cmos/
```bash
# Restore cmos/
mv cmos.phase2-test cmos
```

#### Step 5: Fix Any Issues
If tests failed:
- Identify what depends on `cmos/`
- Make those dependencies optional
- Add fallback behavior

### Phase 3: Add CMOS Detection (3-4 days)

#### Step 1: Create CMOS Detector
```bash
# Create new file
touch src/intelligence/cmos-detector.ts
```

```typescript
// src/intelligence/cmos-detector.ts
// Implementation as described in architecture plan
```

#### Step 2: Integrate Detector into Agentic Controller
```typescript
// src/intelligence/agentic-controller.ts

import { CMOSDetector } from './cmos-detector';

export class AgenticController {
  private readonly cmosDetector: CMOSDetector;

  constructor(options: AgenticControllerOptions = {}) {
    // ... existing initialization
    this.cmosDetector = CMOSDetector.getInstance();
    
    // Log detection status
    if (this.cmosDetector.isPresent()) {
      console.log('CMOS detected at:', this.cmosDetector.getCMOSPath());
    } else {
      console.log('CMOS not detected, running in standalone mode');
    }
  }
}
```

#### Step 3: Test Detection
```bash
# Test with cmos/
npm run test:cmos-detection
# Should log: "CMOS detected at: /path/to/cmos"

# Test without cmos/
mv cmos cmos.phase3-test
npm run test:cmos-detection
# Should log: "CMOS not detected, running in standalone mode"

# Restore
mv cmos.phase3-test cmos
```

#### Step 4: Add Feature Flags
```typescript
// Add to agents.md

## CMOS Integration
- `cmos.detection.enabled`: true  # Enable CMOS detection
- `cmos.sync.enabled`: false      # Disable sync by default
```

### Phase 4: Add Optional Sync Service (1 week)

#### Step 1: Create SQLite Client
```bash
# Install SQLite dependency
npm install better-sqlite3 @types/better-sqlite3 --save
```

```typescript
// src/intelligence/sqlite-client.ts
// Lightweight client for CMOS SQLite access
```

#### Step 2: Create Sync Service
```typescript
// src/intelligence/cmos-sync.ts
// Optional sync between Mission Protocol and CMOS
```

#### Step 3: Integrate Sync into Controller
```typescript
// src/intelligence/agentic-controller.ts

export class AgenticController {
  private readonly cmosSync: CMOSSync | null;

  constructor(options: AgenticControllerOptions = {}) {
    // ... existing initialization
    
    if (options.enableCMOSSync && this.cmosDetector.isPresent()) {
      this.cmosSync = options.cmosSync ?? new CMOSSync();
      console.log('CMOS sync enabled');
    } else {
      this.cmosSync = null;
    }
  }

  async startMission(missionId: string, options: StartMissionOptions = {}) {
    const state = await this.startMissionInternal(missionId, options);
    
    // Sync to CMOS if enabled and present
    if (this.cmosSync) {
      try {
        await this.cmosSync.logSessionEvent({
          ts: new Date().toISOString(),
          mission: missionId,
          action: 'mission_started',
        });
      } catch (error) {
        console.warn('CMOS sync failed (non-critical):', error);
      }
    }
    
    return state;
  }
}
```

#### Step 4: Test Sync Functionality
```bash
# Test with sync enabled
CMOS_SYNC_ENABLED=true npm test

# Test with sync disabled
CMOS_SYNC_ENABLED=false npm test

# Test without cmos/ (should not error)
mv cmos cmos.phase4-test
CMOS_SYNC_ENABLED=true npm test
# Should log warnings but not fail

# Restore
mv cmos.phase4-test cmos
```

### Phase 5: Final Validation (2 days)

#### Step 1: Comprehensive Testing
```bash
# Test matrix
echo "Testing all combinations..."

# 1. With cmos/, sync enabled
CMOS_SYNC_ENABLED=true npm test

# 2. With cmos/, sync disabled
CMOS_SYNC_ENABLED=false npm test

# 3. Without cmos/, sync enabled (should degrade gracefully)
mv cmos cmos.final-test
CMOS_SYNC_ENABLED=true npm test

# 4. Without cmos/, sync disabled
CMOS_SYNC_ENABLED=false npm test

# Restore
mv cmos.final-test cmos
```

#### Step 2: Performance Testing
```bash
# Benchmark with cmos/
npm run perf:benchmark -- --with-cmos

# Benchmark without cmos/
mv cmos cmos.perf-test
npm run perf:benchmark -- --without-cmos
mv cmos.perf-test cmos

# Compare results - should be <2% difference
```

#### Step 3: Integration Testing
```bash
# Test full mission lifecycle with cmos/
npm run test:integration -- --cmos-present

# Test full mission lifecycle without cmos/
mv cmos cmos.integration-test
npm run test:integration -- --cmos-absent
mv cmos.integration-test cmos
```

#### Step 4: Documentation Update
Update all documentation to reflect:
- Mission Protocol works standalone
- CMOS integration is optional
- Configuration options for CMOS sync

### Phase 6: Cleanup (1 day)

#### Step 1: Remove Temporary Files
```bash
# Clean up test files
rm -f agentic_state.json.test SESSIONS.jsonl.test PROJECT_CONTEXT.json.test

# Remove backup if everything works
rm -rf backup/pre-migration-*/
```

#### Step 2: Verify cmos/ Removability
```bash
# The ultimate test - remove cmos/ entirely
mv cmos cmos.can-delete

# All tests should pass
npm test

# Build should succeed
npm run build

# If everything passes, cmos/ is truly optional!
echo "✅ CMOS is now optional"
```

#### Step 3: Finalize Documentation
```bash
# Update README.md
# Update agents.md template
# Update API documentation
# Add CMOS integration guide
```

## Rollback Procedures

### If Something Breaks

#### Rollback Path 1: Restore cmos/ Structure
```bash
# Restore from backup
cp -r backup/pre-migration-*/cmos ./

# Restore original files
cp backup/pre-migration-*/agents.md ./
cp backup/pre-migration-*/SESSIONS.jsonl ./ 2>/dev/null || true
cp backup/pre-migration-*/PROJECT_CONTEXT.json ./ 2>/dev/null || true
cp backup/pre-migration-*/agentic_state.json ./ 2>/dev/null || true

# Revert code changes
git checkout HEAD -- src/intelligence/
```

#### Rollback Path 2: Disable CMOS Features
```typescript
// In agents.md
## CMOS Integration
- `cmos.detection.enabled`: false
- `cmos.sync.enabled`: false
```

## Validation Checkpoints

### After Each Phase

Run these checks:

```bash
# 1. All tests pass
npm test

# 2. No hardcoded cmos/ dependencies
! grep -r "cmos/" src/ --include="*.ts" | grep -v "cmos-detector" | grep -v "cmos-sync"

# 3. Works without cmos/
mv cmos cmos.check
npm test
mv cmos.check cmos

# 4. TypeScript compiles
npm run build

# 5. No breaking changes to public API
npm run test:api-compatibility
```

### Final Validation

Before considering migration complete:

- [ ] All tests pass with `cmos/` present
- [ ] All tests pass without `cmos/` present
- [ ] Mission execution works in both modes
- [ ] Performance impact < 2%
- [ ] No hardcoded `cmos/` paths (except in detector/sync)
- [ ] Documentation updated
- [ ] `cmos/` can be removed without breaking anything
- [ ] Optional sync works when enabled
- [ ] Graceful degradation when sync fails

## Post-Migration Tasks

### Before Publishing

- [ ] Remove `cmos/` directory entirely
- [ ] Verify all tests still pass
- [ ] Update package.json if needed
- [ ] Update main README
- [ ] Create migration guide for existing users
- [ ] Tag release

### Documentation Updates

1. **Main README**: Document standalone nature
2. **API Docs**: Document optional CMOS integration
3. **Examples**: Provide both standalone and CMOS examples
4. **Migration Guide**: For users upgrading from older versions

### Monitoring

After migration:
- Monitor for any issues in production
- Track usage of CMOS integration (if any)
- Gather feedback from users
- Iterate on sync functionality if needed

## Troubleshooting

### Common Issues

#### Issue: Tests fail without cmos/
```bash
# Check what's failing
npm test -- --verbose

# Likely causes:
# 1. Hardcoded paths - update to use configurable paths
# 2. Missing default files - create empty defaults
# 3. Assumptions about cmos/ structure - make optional
```

#### Issue: Sync not working
```bash
# Check if CMOS is detected
npm run test:cmos-detection

# Check sync logs
cat SESSIONS.jsonl | tail -20

# Verify SQLite exists
ls -la cmos/db/cmos.sqlite
```

#### Issue: Performance regression
```bash
# Profile the code
npm run perf:profile

# Likely culprits:
# 1. CMOS detection on every operation - add caching
# 2. Sync blocking operations - make async
# 3. File system checks - optimize
```

## Timeline Estimate

### Total: 2-3 weeks

- **Phase 0**: 1 day
- **Phase 1**: 2-3 days
- **Phase 2**: 2 days
- **Phase 3**: 3-4 days
- **Phase 4**: 1 week
- **Phase 5**: 2 days
- **Phase 6**: 1 day

### Buffer: 3-4 days for issues and testing

## Conclusion

This migration path transforms Mission Protocol into a self-contained package that works independently while maintaining optional integration with CMOS. The key is making `cmos/` truly optional so it can be removed before publishing without any loss of functionality.

The phased approach allows for validation at each step and provides multiple rollback points if issues arise.