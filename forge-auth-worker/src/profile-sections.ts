// Hash each returned Bungie component independently; a missing component is not
// interpreted as zero progress. Revisions are bound to the authenticated account.
export async function profileSections(profile: Record<string, unknown>, membership: string, since: Record<string,string> = {}) {
  const entries = Object.entries(profile);
  const sections = await Promise.all(entries.map(async ([name, value]) => {
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`${membership}:${name}:${JSON.stringify(value)}`));
    const revision = Array.from(new Uint8Array(digest)).map(x=>x.toString(16).padStart(2,"0")).join("");
    return { name, value, revision };
  }));
  const revisions: Record<string,string> = {};
  const changed: Record<string,unknown> = {};
  for (const { name, value, revision } of sections) {
    revisions[name] = revision;
    if (since[name] !== revision) changed[name] = value;
  }
  return { revisions, changed };
}
