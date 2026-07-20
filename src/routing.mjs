import { readFile } from "node:fs/promises";

function compareStrings(left, right) {
  return left.localeCompare(right);
}

function escapeTableCell(value) {
  return value.replaceAll("|", "\\|").replaceAll("\n", " ");
}

function formatList(values) {
  return values.map(escapeTableCell).join("；");
}

export async function readDomainsManifest(manifestPath) {
  return JSON.parse(await readFile(manifestPath, "utf8"));
}

export function validateDomainsManifest(manifest, expectedDomains = null) {
  if (manifest?.schemaVersion !== 1 || !Array.isArray(manifest.domains)) {
    throw new Error("Expected domains manifest schema version 1");
  }

  const names = new Set();
  for (const domain of manifest.domains) {
    if (!domain?.name?.startsWith("lark-") || !Array.isArray(domain.intents) || domain.intents.length === 0) {
      throw new Error(`Invalid domain entry: ${JSON.stringify(domain)}`);
    }
    if (names.has(domain.name)) {
      throw new Error(`Duplicate domain entry: ${domain.name}`);
    }
    names.add(domain.name);

    for (const field of ["intents", "notFor", "requires"]) {
      if (domain[field] !== undefined && (!Array.isArray(domain[field]) || domain[field].some((value) => typeof value !== "string" || value.length === 0))) {
        throw new Error(`Invalid ${field} for ${domain.name}`);
      }
    }
    if (domain.internal !== undefined && typeof domain.internal !== "boolean") {
      throw new Error(`Invalid internal flag for ${domain.name}`);
    }
  }

  for (const domain of manifest.domains) {
    for (const dependency of domain.requires ?? []) {
      if (!names.has(dependency)) {
        throw new Error(`Unknown dependency ${dependency} for ${domain.name}`);
      }
    }
  }

  if (expectedDomains) {
    const actual = [...names].sort(compareStrings);
    const expected = [...expectedDomains].sort(compareStrings);
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      const missing = expected.filter((name) => !names.has(name));
      const unexpected = actual.filter((name) => !expected.includes(name));
      throw new Error(`Domain coverage mismatch; missing: ${missing.join(", ") || "none"}; unexpected: ${unexpected.join(", ") || "none"}`);
    }
  }

  return manifest;
}

export function renderRouting(manifest) {
  validateDomainsManifest(manifest);
  const routable = manifest.domains.filter(({ internal }) => !internal).sort((left, right) => compareStrings(left.name, right.name));
  const internal = manifest.domains.filter(({ internal }) => internal).sort((left, right) => compareStrings(left.name, right.name));
  const rows = routable.map((domain) => {
    const guide = `subskills/${domain.name}/GUIDE.md`;
    return `| [\`${domain.name}\`](${guide}) | ${formatList(domain.intents)} | ${formatList(domain.notFor ?? ["—"])} | ${formatList(domain.requires ?? ["—"])} |`;
  });
  const internalRows = internal.map((domain) => `| [\`${domain.name}\`](subskills/${domain.name}/GUIDE.md) | ${formatList(domain.intents)} |`);

  return `# Lark domain routing\n\n此文件由 \`config/domains.json\` 生成。先选择覆盖当前执行步骤的最小 domain 集合，再读取对应 \`GUIDE.md\`；不要预读其他 domain。\n\n## User-facing domains\n\n| Domain | Use for | Do not use for | Required domains |\n| --- | --- | --- | --- |\n${rows.join("\n")}\n\n## Internal support domains\n\n仅在当前步骤确实涉及对应支持能力时加载。\n\n| Domain | Use for |\n| --- | --- |\n${internalRows.join("\n")}\n`;
}
