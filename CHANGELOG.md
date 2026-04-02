# Changelog

## 0.6.1

### Changed
- Strengthened exact-mode parity rules so the original Figma reference is treated as the final authority instead of a lossy flattened spec.
- Added scene-oriented spec guidance for complex multi-page, multi-state, and multi-variant UI requests.
- Added `sceneCoverage` requirements for exact scene-based specs to prevent unmapped Figma references from silently passing.
- Tightened verify guidance so exact mode cannot pass when only a subset of scenes are covered.
- Strengthened generation guidance so scene-based requests must produce scene-aware test coverage.

### Fixed
- Reduced the risk of complex Figma requests passing with incomplete scene mapping or partial coverage.

### Tests
- Added a replay golden regression case for `exact-scene-coverage-incomplete`.
- Verified replay harness passes with the new exact scene coverage guard.

### Notes
- `npm run maintainer:check` could not complete in this environment because `rg` was unavailable.
- Git push was not completed in this environment because GitHub HTTPS credentials were unavailable.
