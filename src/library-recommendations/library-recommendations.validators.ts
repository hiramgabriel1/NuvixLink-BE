export const ECOSYSTEM_DOMAINS = {
  npm: ['npmjs.com', 'npm.pkg.github.com'],
  maven: ['mvnrepository.com', 'maven.apache.org', 'repo.maven.apache.org'],
  nuget: ['nuget.org'],
  cargo: ['crates.io'],
};

export const PACKAGE_NAME_REGEX = {
  npm: /^(@[a-z0-9][a-z0-9._-]*\/)?[a-z0-9][a-z0-9._-]*$/,
  maven: /^[a-z0-9]([a-z0-9._]*[a-z0-9])?:[a-z0-9]([a-z0-9._]*[a-z0-9])?$/,
  nuget: /^[a-zA-Z0-9]([a-zA-Z0-9._-]*[a-zA-Z0-9])?$/,
  cargo: /^[a-z0-9]([a-z0-9_-]*[a-z0-9])?$/,
};

export const INSTALL_COMMAND_PREFIXES = {
  npm: ['npm i', 'npm install', 'pnpm add', 'yarn add', 'bun add'],
  maven: ['<dependency>', 'mvn dependency:get'],
  nuget: ['dotnet add package', '<PackageReference'],
  cargo: ['cargo add'],
};