import { BadRequestException } from '@nestjs/common';

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

export function validateEcosystemDomain(ecosystem: string, url: string) {
  const validDomains = ECOSYSTEM_DOMAINS[ecosystem];
  if (!validDomains) {
    throw new BadRequestException(`Invalid ecosystem: ${ecosystem}`);
  }

  const isValid = validDomains.some((domain) => url.includes(domain));
  if (!isValid) {
    throw new BadRequestException(`URL does not match valid domains for ecosystem: ${ecosystem}`);
  }
}

export function validatePackageName(ecosystem: string, packageName: string) {
  const regex = PACKAGE_NAME_REGEX[ecosystem];
  if (!regex) {
    throw new BadRequestException(`Invalid ecosystem: ${ecosystem}`);
  }

  if (!regex.test(packageName)) {
    throw new BadRequestException(`Invalid package name for ecosystem: ${ecosystem}`);
  }
}

export function validateInstallCommand(ecosystem: string, command: string) {
  const validPrefixes = INSTALL_COMMAND_PREFIXES[ecosystem];
  if (!validPrefixes) {
    throw new BadRequestException(`Invalid ecosystem: ${ecosystem}`);
  }

  const isValid = validPrefixes.some((prefix) => command.startsWith(prefix));
  if (!isValid) {
    throw new BadRequestException(`Install command does not match valid prefixes for ecosystem: ${ecosystem}`);
  }
}