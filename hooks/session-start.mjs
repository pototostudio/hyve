#!/usr/bin/env node
// hyve session-start hook
// Fires on SessionStart events. Reads shared state and produces a personalized briefing.
//
// Output format: JSON with { result: "additionalContext", content: "..." }
// The content string is injected into Claude's context at session start.

import { readFileSync, existsSync, writeFileSync, mkdirSync, readdirSync, statSync } from "node:fs";
import { join, basename } from "node:path";
import { homedir } from "node:os";
import { execFileSync } from "node:child_process";

const STATE_DIR = process.env.HYVE_STATE_DIR || join(homedir(), ".hyve");

function getConfig(key) {
  try {
    const configPath = join(STATE_DIR, "config.yaml");
    if (!existsSync(configPath)) return "";
    const content = readFileSync(configPath, "utf-8");
    for (const line of content.split("\n")) {
      if (line.startsWith(`${key}:`)) {
        return line.substring(key.length + 1).trim();
      }
    }
  } catch { /* ignore */ }
  return "";
}

function getSlug() {
  try {
    const configured = getConfig("project");
    if (configured) return configured;
    const remote = execFileSync("git", ["remote", "get-url", "origin"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (remote) return basename(remote).replace(/\.git$/, "");
    const toplevel = execFileSync("git", ["rev-parse", "--show-toplevel"], { encoding: "utf-8", stdio: ["pipe", "pipe", "pipe"] }).trim();
    if (toplevel) return basename(toplevel);
  } catch { /* ignore */ }
  return basename(process.cwd());
}

function countFiles(dir) {
  try {
    if (!existsSync(dir)) return 0;
    return readdirSync(dir).filter(f => f.endsWith(".md")).length;
  } catch { return 0; }
}

function getNewFilesSince(dir, since) {
  const newFiles = [];
  try {
    if (!existsSync(dir)) return newFiles;
    for (const file of readdirSync(dir).filter(f => f.endsWith(".md"))) {
      const stat = statSync(join(dir, file));
      if (stat.mtimeMs > since) {
        newFiles.push(file);
      }
    }
  } catch { /* ignore */ }
  return newFiles;
}

function getLastSeen(user) {
  const watermarkPath = join(STATE_DIR, `.last-seen-${user}.json`);
  try {
    if (existsSync(watermarkPath)) {
      return JSON.parse(readFileSync(watermarkPath, "utf-8"));
    }
  } catch { /* ignore */ }
  return null;
}

function saveLastSeen(user, data) {
  try {
    mkdirSync(STATE_DIR, { recursive: true });
    writeFileSync(join(STATE_DIR, `.last-seen-${user}.json`), JSON.stringify(data));
  } catch { /* ignore */ }
}

// Main
const quiet = getConfig("quiet");
if (quiet === "true") {
  console.log(JSON.stringify({
    result: "additionalContext",
    content: "[hyve] Quiet mode — run /hyve:review, /hyve:spec, /hyve:pickup, /hyve:decision"
  }));
  process.exit(0);
}

const slug = getSlug();
const role = getConfig("role") || "dev";
const projectDir = join(STATE_DIR, "projects", slug);
const user = process.env.USER || "unknown";

const specs = countFiles(join(projectDir, "specs"));
const plans = countFiles(join(projectDir, "plans"));
const reviews = countFiles(join(projectDir, "reviews"));
const decisions = countFiles(join(projectDir, "decisions"));

// Diff detection
const lastSeen = getLastSeen(user);
const now = Date.now();
let diffSummary = "";

if (lastSeen) {
  const elapsed = Math.round((now - lastSeen.timestamp) / 60000);
  const elapsedStr = elapsed < 60 ? `${elapsed}m ago` : `${Math.round(elapsed / 60)}h ago`;

  const newSpecs = getNewFilesSince(join(projectDir, "specs"), lastSeen.timestamp);
  const newPlans = getNewFilesSince(join(projectDir, "plans"), lastSeen.timestamp);
  const newDecisions = getNewFilesSince(join(projectDir, "decisions"), lastSeen.timestamp);
  const newReviews = getNewFilesSince(join(projectDir, "reviews"), lastSeen.timestamp);

  const changes = [];
  if (newSpecs.length) changes.push(`${newSpecs.length} new spec(s)`);
  if (newPlans.length) changes.push(`${newPlans.length} new plan(s)`);
  if (newDecisions.length) changes.push(`${newDecisions.length} new decision(s)`);
  if (newReviews.length) changes.push(`${newReviews.length} new review(s)`);

  if (changes.length) {
    diffSummary = `Since your last session (${elapsedStr}): ${changes.join(", ")}.`;
  }
}

saveLastSeen(user, { timestamp: now });

// Build briefing
const lines = [`[hyve] Project: ${slug} | Role: ${role}`];

if (diffSummary) lines.push(diffSummary);

if (specs + plans + reviews + decisions > 0) {
  lines.push(`Shared state: ${specs} specs, ${plans} plans, ${reviews} reviews, ${decisions} decisions.`);
}

lines.push("Skills: /hyve:review, /hyve:spec, /hyve:pickup, /hyve:decision, /hyve:search, /hyve:status, /hyve:handoff");

console.log(JSON.stringify({
  result: "additionalContext",
  content: lines.join("\n")
}));
