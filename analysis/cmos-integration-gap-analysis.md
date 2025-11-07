# CMOS & Mission Protocol Integration Gap Analysis - REVISED

## Executive Summary

**Critical Clarification**: The `cmos/` folder is project management infrastructure for Mission Protocol's internal development and will be **removed before public publishing**. Mission Protocol must work independently, with optional integration when `cmos/` is present in a project.

**Revised Goal**: Make Mission Protocol's intelligence layer robust and self-contained, with lightweight, optional integration with CMOS when both systems coexist in a project.

## Current Architecture Understanding

### Mission Protocol (Published Package)
- **Purpose**: MCP server for mission template management
- **Location**: `src/` directory - this is what gets published
- **Dependencies**: TypeScript, Node.js, various npm packages
- **Data Storage**: Currently file-based (intended to be self-contained)

### CMOS (Internal Project Management)
- **Purpose**: Project management and orchestration for Mission Protocol development
- **Location**: `cmos/` directory - **will be removed before publishing**
- **Dependencies**: Python, SQLite
- **Data Storage**: SQLite (canonical) with file mirrors
- **Status**: Internal tool, not part of published package

## Critical Integration Requirements (Revised)

### 1. Mission Protocol Must Work Standalone
**Requirement**: Mission Protocol intelligence layer should function without any CMOS dependencies

**Current State**: 
- `agents-md-loader.ts` depends on `agents.md` file
- `agentic-controller.ts` uses file-based state management
- No hard dependencies on CMOS structure

**Gap**: Need to ensure all Mission Protocol tools work without `cmos/` present

### 2. Optional CMOS Detection
**Requirement**: Mission Protocol should detect and integrate with CMOS when present

**Current State**: No detection mechanism exists

**Gap**: Need to add runtime detection of CMOS presence

### 3. Lightweight Integration Points
**Requirement**: When CMOS is present, share data without tight coupling

**Current State**: No integration exists

**Gap**: Need to define minimal integration surface

## Integration Strategy (Revised)

### Approach: Opt-In, Non-Intrusive Integration

Mission Protocol should:
1. **Work independently** with its own file-based storage
2. **Detect CMOS presence** at runtime
3. **Optionally sync** with CMOS when available
4. **Not break** if CMOS is removed or unavailable

### Integration Points

#### 1. Session Event Sharing
```typescript
// Mission Protocol logs sessions independently
// If CMOS is present, also write to SQLite
if (cmosDetector.isPresent()) {
  await cmosSync.logSessionEvent(event);
}
```

#### 2. Context Awareness
```typescript
// Mission Protocol maintains its own context
// If CMOS context exists, merge or reference it
if (cmosDetector.hasContext()) {
  const cmosContext = await cmosSync.getContext();
  // Use cmosContext to enhance Mission Protocol operations
}
```

#### 3. Mission Backlog Awareness
```typescript
// Mission Protocol can operate independently
// If CMOS backlog exists, optionally use it for mission selection
if (cmosDetector.hasBacklog()) {
  const missions = await cmosSync.getActiveMissions();
  // Use missions to inform Mission Protocol workflow
}
```

## Implementation Recommendations (Revised)

### Priority 1: Make Mission Protocol Self-Contained

**Goal**: Ensure Mission Protocol works without any `cmos/` dependencies

**Actions**:
1. **Consolidate Mission Protocol State**: Use a single `agentic_state.json` in project root
2. **Independent Session Logging**: Write to `SESSIONS.jsonl` in project root
3. **Standalone Context Management**: Use `PROJECT_CONTEXT.json` in project root
4. **Remove CMOS Assumptions**: Ensure no code assumes `cmos/` structure exists

### Priority 2: Add CMOS Detection Layer

**Goal**: Runtime detection of CMOS presence

**Actions**:
1. **Create `cmos-detector.ts`**: Detect if `cmos/` exists and has SQLite DB
2. **Feature Flag Integration**: Use detection to enable/disable CMOS features
3. **Graceful Degradation**: Work normally when CMOS is absent

### Priority 3: Add Optional Sync Service

**Goal**: Bidirectional sync when CMOS is present

**Actions**:
1. **Create `cmos-sync.ts`**: Optional sync between Mission Protocol and CMOS
2. **Configurable Sync**: Allow users to enable/disable sync
3. **Conflict Resolution**: Handle cases where both systems have data

## Files That Need Changes

### Mission Protocol Core (Will Be Published)

**Current files that reference cmos/**:
- `src/intelligence/agentic-controller.ts` (line 172: `DEFAULT_STATE_PATH = 'cmos/context/agentic_state.json'`)
- `src/intelligence/agents-md-loader.ts` (assumes `agents.md` in specific locations)

**Changes needed**:
1. **Make paths configurable** with sensible defaults
2. **Default to project root** instead of `cmos/` subdirectory
3. **Add CMOS detection** as optional enhancement

### CMOS Directory (Will Be Removed)

**No changes needed** - this is internal project management

## Corrected Architecture Vision

### Mission Protocol Standalone Mode (Default)
```
project-root/
├── agents.md                    # Project playbook
├── PROJECT_CONTEXT.json         # Mission Protocol context
├── SESSIONS.jsonl              # Mission Protocol sessions
├── agentic_state.json          # Mission Protocol state
└── src/                        # Mission Protocol code
    └── intelligence/           # Intelligence layer
        ├── agentic-controller.ts
        ├── agents-md-loader.ts
        └── ...
```

### Mission Protocol with CMOS (Optional)
```
project-root/
├── agents.md                    # Project playbook
├── PROJECT_CONTEXT.json         # Mission Protocol context
├── SESSIONS.jsonl              # Mission Protocol sessions
├── agentic_state.json          # Mission Protocol state
├── src/                        # Mission Protocol code
│   └── intelligence/           # Intelligence layer
│       ├── agentic-controller.ts
│       ├── agents-md-loader.ts
│       ├── cmos-detector.ts    # NEW: Detects CMOS
│       └── cmos-sync.ts        # NEW: Optional sync
└── cmos/                       # Internal project management (optional)
    ├── db/cmos.sqlite         # SQLite database
    ├── PROJECT_CONTEXT.json   # CMOS context (mirror)
    ├── SESSIONS.jsonl         # CMOS sessions (mirror)
    └── ...
```

## Key Differences from Original Analysis

| Aspect | Original (Incorrect) | Revised (Correct) |
|--------|---------------------|-------------------|
| **CMOS Status** | Part of published package | Internal, will be removed |
| **Integration** | Tight coupling required | Loose, optional coupling |
| **Mission Protocol** | Depends on CMOS | Works independently |
| **Architecture** | SQLite-first everywhere | File-based with optional sync |
| **Migration** | Complex, required | Simple, optional |
| **Priority** | High - blocker | Medium - enhancement |

## Implementation Phases (Revised)

### Phase 1: Mission Protocol Self-Containment (1 week)
- Move default paths from `cmos/` to project root
- Ensure all functionality works without `cmos/`
- Consolidate state management

### Phase 2: CMOS Detection (3-4 days)
- Add runtime detection of CMOS presence
- Create feature flags for CMOS integration
- Add graceful degradation

### Phase 3: Optional Sync (1 week)
- Implement bidirectional sync service
- Add configuration options
- Test with and without CMOS

### Phase 4: Documentation & Cleanup (2-3 days)
- Document optional CMOS integration
- Update examples
- Remove any remaining hard dependencies

## Success Criteria (Revised)

1. **Mission Protocol works without cmos/**: All tests pass when `cmos/` is absent
2. **Optional CMOS integration**: When `cmos/` is present, data is optionally shared
3. **No breaking changes**: Existing projects continue to work
4. **Clean separation**: Clear boundaries between Mission Protocol and CMOS
5. **Easy removal**: `cmos/` can be deleted without breaking Mission Protocol

## Conclusion

The revised approach focuses on making Mission Protocol robust and self-contained, with CMOS integration as an optional enhancement rather than a requirement. This aligns with the goal of publishing Mission Protocol as an independent package while maintaining the ability to integrate with CMOS when both systems coexist in a project.