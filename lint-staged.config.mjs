function shellQuote(value) {
  if (/^[A-Za-z0-9_@%+=:,./-]+$/.test(value)) {
    return value;
  }

  return `'${value.replaceAll("'", "'\\''")}'`;
}

function quoteFiles(files) {
  return files.map(shellQuote).join(" ");
}

function biomeTasks(files) {
  const paths = quoteFiles(files);

  return [`biome format --write ${paths}`, `biome lint ${paths}`];
}

export default {
  "app/**/*.{ts,tsx,js,jsx,json,css}": () => "pnpm --filter @workspace/app check",
  "services/!(src)/**/*.{ts,tsx,js,jsx,json}": biomeTasks,
  "shared/**/*.{ts,tsx,js,jsx,json}": biomeTasks,
  "packages/api/**/*.{ts,tsx,js,jsx,json}": biomeTasks,
  "{package.json,package-lock.json,pnpm-lock.yaml,pnpm-workspace.yaml,turbo.json,biome.json,tsconfig.base.json}":
    () => "pnpm check",
};
