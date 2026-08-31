/** Obscure an email for the UI: "jo•••@gmail.com". */
export function maskEmail(email: string): string {
  const [local, domain] = email.split("@");
  if (!domain) return email;
  const head = local.slice(0, 2);
  return `${head}${"•".repeat(Math.max(1, local.length - head.length))}@${domain}`;
}
