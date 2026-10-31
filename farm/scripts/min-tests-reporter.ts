/*  A reporter that fails the run when too few tests actually execute.
    Guards against a silently empty suite (an include glob that matches
    nothing still exits 0 in vitest). */
import type { Reporter, TestCase } from "vitest/node";

const MIN_TESTS = 25;

export class MinTestsReporter implements Reporter {
  private count = 0;

  onTestCaseResult(testCase: TestCase): void {
    void testCase;
    this.count += 1;
  }

  onTestRunEnd(): void {
    if (this.count < MIN_TESTS) {
      throw new Error(`[min-tests] only ${this.count} test(s) ran (minimum ${MIN_TESTS})`);
    }
    console.log(`\n[min-tests] OK — ${this.count} test(s) ran (minimum ${MIN_TESTS}).`);
  }
}
