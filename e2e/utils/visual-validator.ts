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

export interface LayoutExpectation {
  width?: number;
  height?: number;
  x?: number;
  y?: number;
  right?: number;
  bottom?: number;
  centerX?: number;
  centerY?: number;
}

export interface PlacementExpectation {
  top?: number;
  left?: number;
  right?: number;
  width?: number;
  height?: number;
  marginTop?: number;
}

export interface AlignmentGapExpectation {
  target: Locator;
  axis?: 'horizontal' | 'vertical';
  value: number;
}

export interface AlignmentExpectation {
  horizontalCenterWithin?: Locator;
  leftAlignedWithin?: Locator;
  gapTo?: AlignmentGapExpectation;
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
  expected: LayoutExpectation,
  options?: { tolerance?: number },
): Promise<ValidationResult> {
  const tolerance = options?.tolerance ?? 2;
  const failures: ValidationFailure[] = [];

  const box = await locator.boundingBox();
  if (!box) {
    return missingBoundingBoxResult();
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
  if (expected.right !== undefined)
    checks.push({
      property: 'right',
      expected: expected.right,
      actual: box.x + box.width,
    });
  if (expected.bottom !== undefined)
    checks.push({
      property: 'bottom',
      expected: expected.bottom,
      actual: box.y + box.height,
    });
  if (expected.centerX !== undefined)
    checks.push({
      property: 'centerX',
      expected: expected.centerX,
      actual: box.x + box.width / 2,
    });
  if (expected.centerY !== undefined)
    checks.push({
      property: 'centerY',
      expected: expected.centerY,
      actual: box.y + box.height / 2,
    });

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

export async function validatePlacement(
  locator: Locator,
  expected: PlacementExpectation,
  options?: { tolerance?: number; container?: Locator },
): Promise<ValidationResult> {
  const tolerance = options?.tolerance ?? 2;
  const box = await locator.boundingBox();

  if (!box) {
    return missingBoundingBoxResult();
  }

  const containerBox = options?.container
    ? await options.container.boundingBox()
    : null;

  if (options?.container && !containerBox) {
    return {
      passed: false,
      failures: [
        {
          property: 'placement.container',
          expected: 'container visible',
          actual: 'null (not visible)',
          diff: 'container not found or not visible',
        },
      ],
    };
  }

  const referenceTop = containerBox?.y ?? 0;
  const referenceLeft = containerBox?.x ?? 0;
  const referenceRight = containerBox
    ? containerBox.x + containerBox.width
    : undefined;
  const failures: ValidationFailure[] = [];

  pushNumericFailureIfNeeded(
    failures,
    'top',
    expected.top,
    box.y - referenceTop,
    tolerance,
  );
  pushNumericFailureIfNeeded(
    failures,
    'left',
    expected.left,
    box.x - referenceLeft,
    tolerance,
  );
  pushNumericFailureIfNeeded(
    failures,
    'width',
    expected.width,
    box.width,
    tolerance,
  );
  pushNumericFailureIfNeeded(
    failures,
    'height',
    expected.height,
    box.height,
    tolerance,
  );
  pushNumericFailureIfNeeded(
    failures,
    'right',
    expected.right,
    referenceRight !== undefined ? referenceRight - (box.x + box.width) : box.x + box.width,
    tolerance,
  );
  pushNumericFailureIfNeeded(
    failures,
    'marginTop',
    expected.marginTop,
    box.y - referenceTop,
    tolerance,
  );

  return { passed: failures.length === 0, failures };
}

export async function validateAlignment(
  locator: Locator,
  expected: AlignmentExpectation,
  options?: { tolerance?: number },
): Promise<ValidationResult> {
  const tolerance = options?.tolerance ?? 2;
  const box = await locator.boundingBox();

  if (!box) {
    return missingBoundingBoxResult();
  }

  const failures: ValidationFailure[] = [];

  if (expected.horizontalCenterWithin) {
    const containerBox = await expected.horizontalCenterWithin.boundingBox();
    if (!containerBox) {
      failures.push({
        property: 'horizontalCenterWithin',
        expected: 'container visible',
        actual: 'null (not visible)',
        diff: 'alignment container not found or not visible',
      });
    } else {
      const actualCenter = box.x + box.width / 2;
      const expectedCenter = containerBox.x + containerBox.width / 2;
      pushNumericFailureIfNeeded(
        failures,
        'horizontalCenterWithin',
        expectedCenter,
        actualCenter,
        tolerance,
      );
    }
  }

  if (expected.leftAlignedWithin) {
    const containerBox = await expected.leftAlignedWithin.boundingBox();
    if (!containerBox) {
      failures.push({
        property: 'leftAlignedWithin',
        expected: 'container visible',
        actual: 'null (not visible)',
        diff: 'alignment container not found or not visible',
      });
    } else {
      pushNumericFailureIfNeeded(
        failures,
        'leftAlignedWithin',
        containerBox.x,
        box.x,
        tolerance,
      );
    }
  }

  if (expected.gapTo) {
    const targetBox = await expected.gapTo.target.boundingBox();
    if (!targetBox) {
      failures.push({
        property: 'gapTo',
        expected: 'target visible',
        actual: 'null (not visible)',
        diff: 'gap target not found or not visible',
      });
    } else {
      const axis = expected.gapTo.axis ?? 'vertical';
      const actualGap =
        axis === 'horizontal'
          ? box.x - (targetBox.x + targetBox.width)
          : box.y - (targetBox.y + targetBox.height);
      pushNumericFailureIfNeeded(
        failures,
        `gapTo.${axis}`,
        expected.gapTo.value,
        actualGap,
        tolerance,
      );
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

function pushNumericFailureIfNeeded(
  failures: ValidationFailure[],
  property: string,
  expected: number | undefined,
  actual: number | undefined,
  tolerance: number,
): void {
  if (expected === undefined || actual === undefined) {
    return;
  }

  if (Math.abs(expected - actual) > tolerance) {
    failures.push({
      property,
      expected: `${expected}px`,
      actual: `${actual}px`,
      diff: `off by ${Math.abs(expected - actual).toFixed(1)}px`,
    });
  }
}

function missingBoundingBoxResult(): ValidationResult {
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
