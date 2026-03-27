import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { existsSync } from "node:fs";

const HOOKS_DIR = join(import.meta.dir, "..", "hooks");

async function runHook(
  script: string,
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["node", join(HOOKS_DIR, script)], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

describe("session-start hook", () => {
  let stateDir: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "hyve-hook-test-"));
    // Create minimal config
    await writeFile(join(stateDir, "config.yaml"), "role: dev\nproject: test-project\n");
  });

  afterAll(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  test("outputs valid JSON with additionalContext", async () => {
    const { stdout, exitCode } = await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
    });
    expect(exitCode).toBe(0);
    const parsed = JSON.parse(stdout);
    expect(parsed.result).toBe("additionalContext");
    expect(parsed.content).toContain("[hyve-mind]");
    expect(parsed.content).toContain("test-project");
  });

  test("shows role from config", async () => {
    const { stdout } = await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.content).toContain("Role: dev");
  });

  test("quiet mode suppresses output", async () => {
    await writeFile(join(stateDir, "config.yaml"), "role: dev\nproject: test-project\nquiet: true\n");
    const { stdout } = await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.content).toContain("Quiet mode");
    // Restore
    await writeFile(join(stateDir, "config.yaml"), "role: dev\nproject: test-project\n");
  });

  test("creates watermark file", async () => {
    await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
      USER: "testuser",
    });
    const watermarkPath = join(stateDir, ".last-seen-testuser.json");
    expect(existsSync(watermarkPath)).toBe(true);
  });

  test("detects new files since last session", async () => {
    // First run — creates watermark
    await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
      USER: "diffuser",
    });

    // Create a new spec file
    const specsDir = join(stateDir, "projects", "test-project", "specs");
    await mkdir(specsDir, { recursive: true });
    // Wait a moment so mtime differs
    await new Promise(r => setTimeout(r, 50));
    await writeFile(join(specsDir, "VER-123-spec.md"), "---\nstatus: active\n---\n# Spec");

    // Second run — should detect the new file
    const { stdout } = await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
      USER: "diffuser",
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.content).toContain("1 new spec(s)");
  });

  test("shows shared state counts", async () => {
    const { stdout } = await runHook("session-start.mjs", {
      HYVE_STATE_DIR: stateDir,
      USER: "countuser",
    });
    const parsed = JSON.parse(stdout);
    expect(parsed.content).toContain("1 specs");
  });
});

describe("hooks.json", () => {
  test("is valid JSON", async () => {
    const content = await Bun.file(join(HOOKS_DIR, "hooks.json")).text();
    const parsed = JSON.parse(content);
    expect(parsed).toHaveProperty("hooks");
    expect(parsed.hooks).toHaveProperty("SessionStart");
  });

  test("session-start hook has correct structure", async () => {
    const content = await Bun.file(join(HOOKS_DIR, "hooks.json")).text();
    const parsed = JSON.parse(content);
    const sessionStart = parsed.hooks.SessionStart[0];
    expect(sessionStart.matcher).toBe("startup|resume");
    expect(sessionStart.hooks[0].type).toBe("command");
    expect(sessionStart.hooks[0].timeout).toBe(2000);
  });
});
