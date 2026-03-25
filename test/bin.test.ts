import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { mkdtemp, rm, readFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";

const BIN_DIR = join(import.meta.dir, "..", "bin");

async function run(
  cmd: string,
  env: Record<string, string> = {}
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const proc = Bun.spawn(["bash", "-c", cmd], {
    env: { ...process.env, ...env },
    stdout: "pipe",
    stderr: "pipe",
  });
  const stdout = await new Response(proc.stdout).text();
  const stderr = await new Response(proc.stderr).text();
  const exitCode = await proc.exited;
  return { stdout: stdout.trim(), stderr: stderr.trim(), exitCode };
}

describe("hyve-config", () => {
  let stateDir: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "hyve-test-"));
  });

  afterAll(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  test("creates config file on first get", async () => {
    const { exitCode } = await run(
      `${BIN_DIR}/hyve-config get role`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);
    const config = await readFile(join(stateDir, "config.yaml"), "utf-8");
    expect(config).toContain("role:");
  });

  test("get returns default role", async () => {
    const { stdout, exitCode } = await run(
      `${BIN_DIR}/hyve-config get role`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("dev");
  });

  test("set updates a key", async () => {
    const { exitCode } = await run(
      `${BIN_DIR}/hyve-config set role pm`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);

    const { stdout } = await run(
      `${BIN_DIR}/hyve-config get role`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(stdout).toBe("pm");
  });

  test("set adds a new key", async () => {
    const { exitCode } = await run(
      `${BIN_DIR}/hyve-config set project myapp`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);

    const { stdout } = await run(
      `${BIN_DIR}/hyve-config get project`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(stdout).toBe("myapp");
  });

  test("get missing key returns empty", async () => {
    const { stdout, exitCode } = await run(
      `${BIN_DIR}/hyve-config get nonexistent`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("");
  });

  test("list shows all config", async () => {
    const { stdout, exitCode } = await run(
      `${BIN_DIR}/hyve-config list`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("role:");
    expect(stdout).toContain("project:");
  });

  test("no args shows usage", async () => {
    const { stderr, exitCode } = await run(
      `${BIN_DIR}/hyve-config`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("Usage:");
  });
});

describe("hyve-slug", () => {
  test("uses HYVE_PROJECT env var when set", async () => {
    const { stdout, exitCode } = await run(
      `${BIN_DIR}/hyve-slug`,
      { HYVE_PROJECT: "my-project" }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toBe("SLUG=my-project");
  });

  test("sanitizes special characters", async () => {
    const { stdout } = await run(
      `${BIN_DIR}/hyve-slug`,
      { HYVE_PROJECT: "My Project (v2)" }
    );
    expect(stdout).toBe("SLUG=my-project-v2");
  });

  test("falls back to current directory name", async () => {
    const tmpDir = await mkdtemp(join(tmpdir(), "slug-test-"));
    const { stdout, exitCode } = await run(
      `cd "${tmpDir}" && ${BIN_DIR}/hyve-slug`,
      { HYVE_PROJECT: "" }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toMatch(/^SLUG=slug-test-/);
    await rm(tmpDir, { recursive: true, force: true });
  });
});

describe("hyve-sync", () => {
  let stateDir: string;

  beforeAll(async () => {
    stateDir = await mkdtemp(join(tmpdir(), "hyve-sync-test-"));
  });

  afterAll(async () => {
    await rm(stateDir, { recursive: true, force: true });
  });

  test("--status on non-existent project shows no state", async () => {
    const { stdout, exitCode } = await run(
      `${BIN_DIR}/hyve-sync --status nonexistent`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(0);
    expect(stdout).toContain("No shared state");
  });

  test("sync on non-git directory shows error", async () => {
    const projectDir = join(stateDir, "projects", "test-project");
    await Bun.write(join(projectDir, "specs", ".gitkeep"), "");
    const { exitCode, stderr } = await run(
      `${BIN_DIR}/hyve-sync test-project`,
      { HYVE_STATE_DIR: stateDir }
    );
    expect(exitCode).toBe(1);
    expect(stderr).toContain("not a git repo");
  });
});
