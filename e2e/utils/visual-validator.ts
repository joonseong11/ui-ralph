import { Locator } from '@playwright/test';

export interface ValidationFailure {
  property: string;
  expected: string;
  actual: string;
  diff: string;
}

export interface ValidationResult {
  passed: boolean;
  failures: ValidationFailure[];
}

export async function validateStyles(
  locator: Locator,
  expectedStyles: Record<string, string>,
  options?: { tolerance?: number },
): Promise<ValidationResult> {
  const tolerance = options?.tolerance ?? 1;
  const failures: ValidationFailure[] = [];

  const actualStyles = await locator.evaluate(
    (el, props) => {
      const cs = getComputedStyle(el);
      const result: Record<string, string> = {};
      for (const prop of props) {
        result[prop] = cs.getPropertyValue(prop);
      }
      return result;
    },
    Object.keys(expectedStyles),
  );

  for (const [property, expected] of Object.entries(expectedStyles)) {
    const actual = actualStyles[property] ?? '';
    if (!isStyleMatch(expected, actual, tolerance)) {
      failures.push({
        property,
        expected,
        actual,
        diff: `expected "${expected}" but got "${actual}"`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

export async function validateLayout(
  locator: Locator,
  expected: { width?: number; height?: number; x?: number; y?: number },
  options?: { tolerance?: number },
): Promise<ValidationResult> {
  const tolerance = options?.tolerance ?? 2;
  const failures: ValidationFailure[] = [];

  const box = await locator.boundingBox();
  if (!box) {
    return {
      passed: false,
      failures: [
        {
          property: 'boundingBox',
          expected: 'element visible',
          actual: 'null (not visible)',
          diff: 'element not found or not visible',
        },
      ],
    };
  }

  const checks: Array<{
    property: string;
    expected: number;
    actual: number;
  }> = [];

  if (expected.width !== undefined)
    checks.push({
      property: 'width',
      expected: expected.width,
      actual: box.width,
    });
  if (expected.height !== undefined)
    checks.push({
      property: 'height',
      expected: expected.height,
      actual: box.height,
    });
  if (expected.x !== undefined)
    checks.push({ property: 'x', expected: expected.x, actual: box.x });
  if (expected.y !== undefined)
    checks.push({ property: 'y', expected: expected.y, actual: box.y });

  for (const check of checks) {
    if (Math.abs(check.expected - check.actual) > tolerance) {
      failures.push({
        property: check.property,
        expected: `${check.expected}px`,
        actual: `${check.actual}px`,
        diff: `off by ${Math.abs(check.expected - check.actual).toFixed(1)}px`,
      });
    }
  }

  return { passed: failures.length === 0, failures };
}

export function formatValidationResult(
  label: string,
  result: ValidationResult,
): string {
  if (result.passed) {
    return `✓ ${label}: PASS`;
  }
  const lines = [`✗ ${label}: FAIL (${result.failures.length} issues)`];
  for (const f of result.failures) {
    lines.push(`  - ${f.property}: ${f.diff}`);
  }
  return lines.join('\n');
}

function isStyleMatch(
  expected: string,
  actual: string,
  tolerance: number,
): boolean {
  if (expected === actual) return true;

  const expectedPx = parseFloat(expected);
  const actualPx = parseFloat(actual);
  if (
    !isNaN(expectedPx) &&
    !isNaN(actualPx) &&
    expected.endsWith('px') &&
    actual.endsWith('px')
  ) {
    return Math.abs(expectedPx - actualPx) <= tolerance;
  }

  const normalizedExpected = normalizeColor(expected);
  const normalizedActual = normalizeColor(actual);
  if (normalizedExpected && normalizedActual) {
    return normalizedExpected === normalizedActual;
  }

  return false;
}

function normalizeColor(color: string): string | null {
  const trimmed = color.trim().toLowerCase();

  const rgbaMatch = trimmed.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/,
  );
  if (rgbaMatch) {
    const [, r, g, b, a] = rgbaMatch;
    return `rgba(${r}, ${g}, ${b}, ${a ?? '1'})`;
  }

  const hexMatch = trimmed.match(/^#([0-9a-f]{3,8})$/);
  if (hexMatch) {
    let hex = hexMatch[1];
    if (hex.length === 3) {
      hex = hex
        .split('')
        .map((c) => c + c)
        .join('');
    }
    if (hex.length === 6) hex += 'ff';
    const r = parseInt(hex.slice(0, 2), 16);
    const g = parseInt(hex.slice(2, 4), 16);
    const b = parseInt(hex.slice(4, 6), 16);
    const a = parseInt(hex.slice(6, 8), 16) / 255;
    return `rgba(${r}, ${g}, ${b}, ${a})`;
  }

  return null;
}
