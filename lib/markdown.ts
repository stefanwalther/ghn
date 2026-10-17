export function unwrapDetails(md: string): string {
  const pattern = /<details\b[^>]*>\s*<summary\b[^>]*>([\s\S]*?)<\/summary\b[^>]*>([\s\S]*?)<\/details\b[^>]*>/gi;
  return md.replace(pattern, (_match, summary: string, body: string) => {
    const label = summary.replace(/<[^>]*>/g, "").trim();
    return `**${label}**\n\n${body.trim()}`;
  });
}
