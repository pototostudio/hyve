import { describe, test, expect } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { existsSync } from "node:fs";

const ROOT_DIR = join(import.meta.dir, "..");

// Skill directories are direct children of the root (not under skills/)
const SKILL_DIRS = ["review", "spec", "pickup", "decision", "search", "status", "handoff", "update", "incident", "retro", "upgrade"];

async function findSkillFiles(): Promise<string[]> {
  const skills: string[] = [];

  // Root SKILL.md
  if (existsSync(join(ROOT_DIR, "SKILL.md"))) {
    skills.push(join(ROOT_DIR, "SKILL.md"));
  }

  // Skill subdirectories (direct children of root)
  for (const dir of SKILL_DIRS) {
    const skillFile = join(ROOT_DIR, dir, "SKILL.md");
    if (existsSync(skillFile)) {
      skills.push(skillFile);
    }
  }

  return skills;
}

function parseFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\n([\s\S]*?)\n---/);
  if (!match) return null;

  const yaml = match[1];
  const result: Record<string, string> = {};

  for (const line of yaml.split("\n")) {
    const colonIdx = line.indexOf(":");
    if (colonIdx > 0 && !line.startsWith(" ") && !line.startsWith("\t")) {
      const key = line.substring(0, colonIdx).trim();
      const value = line.substring(colonIdx + 1).trim();
      result[key] = value;
    }
  }

  return result;
}

describe("skill validation", () => {
  test("all skills have valid YAML frontmatter", async () => {
    const skills = await findSkillFiles();
    expect(skills.length).toBe(12); // root + 11 skills

    for (const skillPath of skills) {
      const content = await readFile(skillPath, "utf-8");
      const frontmatter = parseFrontmatter(content);
      expect(frontmatter).not.toBeNull();
      expect(frontmatter).toHaveProperty("name");
      expect(frontmatter).toHaveProperty("version");
      expect(frontmatter).toHaveProperty("description");
    }
  });

  test("all skills have allowed-tools", async () => {
    const skills = await findSkillFiles();

    for (const skillPath of skills) {
      const content = await readFile(skillPath, "utf-8");
      expect(content).toContain("allowed-tools:");
    }
  });

  test("root SKILL.md exists and has correct name", async () => {
    const rootSkill = join(ROOT_DIR, "SKILL.md");
    expect(existsSync(rootSkill)).toBe(true);

    const content = await readFile(rootSkill, "utf-8");
    const frontmatter = parseFrontmatter(content);
    expect(frontmatter?.name).toBe("hyve");
  });

  test.each(SKILL_DIRS)("hyve:%s skill exists with correct name", async (dir) => {
    const skillPath = join(ROOT_DIR, dir, "SKILL.md");
    expect(existsSync(skillPath)).toBe(true);

    const content = await readFile(skillPath, "utf-8");
    const frontmatter = parseFrontmatter(content);
    expect(frontmatter?.name).toBe(`hyve:${dir}`);
  });

  test("all skill names use hyve: prefix", async () => {
    for (const dir of SKILL_DIRS) {
      const content = await readFile(join(ROOT_DIR, dir, "SKILL.md"), "utf-8");
      const frontmatter = parseFrontmatter(content);
      expect(String(frontmatter?.name)).toMatch(/^hyve:/);
    }
  });

  test("VERSION file matches root SKILL.md version", async () => {
    const version = (await readFile(join(ROOT_DIR, "VERSION"), "utf-8")).trim();
    const content = await readFile(join(ROOT_DIR, "SKILL.md"), "utf-8");
    const frontmatter = parseFrontmatter(content);
    expect(frontmatter?.version).toBe(version);
  });
});
