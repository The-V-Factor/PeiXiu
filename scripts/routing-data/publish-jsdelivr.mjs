#!/usr/bin/env node

import { execFileSync } from "node:child_process";
import { cp, mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";

const [sourceDirectory, dataRepository, repositorySlug, ...flags] = process.argv.slice(2);

if (!sourceDirectory || !dataRepository || !repositorySlug || flags.some((flag) => flag !== "--push")) {
  console.error("usage: publish-jsdelivr.mjs <routing-directory> <data-repository> <owner/repo> [--push]");
  process.exit(64);
}

const shouldPush = flags.includes("--push");
const runGit = (...args) => execFileSync("git", ["-C", dataRepository, ...args], { encoding: "utf8" }).trim();

await stat(join(sourceDirectory, "manifest.json"));
const sourceManifest = JSON.parse(await readFile(join(sourceDirectory, "manifest.json"), "utf8"));
if (sourceManifest.region !== "guangzhou" || !sourceManifest.graphVersion || !Array.isArray(sourceManifest.tiles)) {
  throw new Error("source manifest is not a valid Guangzhou routing manifest");
}

if (runGit("status", "--porcelain")) {
  throw new Error("data repository must have a clean working tree");
}

const graphVersion = sourceManifest.graphVersion;
const sourceGraphDirectory = join(sourceDirectory, graphVersion);
const targetDirectory = join(dataRepository, "routing", "guangzhou");
const targetGraphDirectory = join(targetDirectory, graphVersion);
const sourceCoveragePath = join(sourceDirectory, "coverage.geojson");
const sourceBoundaryPath = join(sourceDirectory, "guangzhou-admin.geojson");
const targetBoundaryDirectory = join(dataRepository, "boundaries", "guangzhou");

try {
  await stat(targetGraphDirectory);
  throw new Error(`graph version already exists in data repository: ${graphVersion}`);
} catch (error) {
  if (error.code !== "ENOENT") throw error;
}

await mkdir(targetDirectory, { recursive: true });
await cp(sourceGraphDirectory, targetGraphDirectory, { recursive: true, errorOnExist: true });
if (sourceManifest.coverageUrl) await cp(sourceCoveragePath, join(targetDirectory, "coverage.geojson"));
if (sourceManifest.boundaryUrl) {
  await mkdir(targetBoundaryDirectory, { recursive: true });
  await cp(sourceBoundaryPath, join(targetBoundaryDirectory, "guangzhou-admin.geojson"));
}

const graphCommitMarker = "GRAPH_COMMIT_SHA";
const manifestPath = join(targetDirectory, "manifest.json");
const writeManifest = async (commitSha) => {
  const manifest = {
    ...sourceManifest,
    baseUrl: `https://cdn.jsdelivr.net/gh/${repositorySlug}@${commitSha}/routing/guangzhou/${graphVersion}`,
    ...(sourceManifest.boundaryUrl ? {
      boundaryUrl: `https://cdn.jsdelivr.net/gh/${repositorySlug}@${commitSha}/boundaries/guangzhou/guangzhou-admin.geojson`,
    } : {}),
    ...(sourceManifest.coverageUrl ? {
      coverageUrl: `https://cdn.jsdelivr.net/gh/${repositorySlug}@${commitSha}/routing/guangzhou/coverage.geojson`,
    } : {}),
  };
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
};

await writeManifest(graphCommitMarker);
runGit("add", "routing/guangzhou", "boundaries/guangzhou");
runGit("commit", "-m", `codex(data): publish ${graphVersion} graph`);
const graphCommit = runGit("rev-parse", "HEAD");

await writeManifest(graphCommit);
runGit("add", "routing/guangzhou/manifest.json");
runGit("commit", "-m", `codex(data): pin ${graphVersion} manifest`);
const manifestCommit = runGit("rev-parse", "HEAD");

if (shouldPush) runGit("push", "origin", "HEAD");

console.log(`graph commit: ${graphCommit}`);
console.log(`manifest commit: ${manifestCommit}`);
console.log(`manifest URL: https://cdn.jsdelivr.net/gh/${repositorySlug}@${manifestCommit}/routing/guangzhou/manifest.json`);
