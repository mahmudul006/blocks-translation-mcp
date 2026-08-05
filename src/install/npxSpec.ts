/** Derives the `github:owner/repo` spec (for `npx -y github:owner/repo`) from package.json's
 *  repository url. Accepts https, git+https, git@ ssh, and the github: shorthand. */
export function npxSpecFromRepository(repositoryUrl: string): string {
  const cleaned = repositoryUrl.trim();

  // github:owner/repo shorthand
  let m = cleaned.match(/^github:([^/]+)\/([^/#]+?)(?:\.git)?$/i);
  if (m) return `github:${m[1]}/${m[2]}`;

  // https://github.com/owner/repo(.git), git+https://…, git@github.com:owner/repo(.git)
  m = cleaned.match(/github\.com[:/]+([^/]+)\/([^/#?]+?)(?:\.git)?(?:[#?].*)?$/i);
  if (m) return `github:${m[1]}/${m[2]}`;

  throw new Error(`Cannot derive an npx github spec from repository "${repositoryUrl}".`);
}
