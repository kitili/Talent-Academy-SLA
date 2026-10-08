/**
 * Sends mail when RESEND_API_KEY is set. Otherwise notifications stay in-app only.
 */
export async function sendTransactionalEmail(to: string | null | undefined, subject: string, text: string) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !to) return { skipped: true as const };
  const from = process.env.MAIL_FROM || "Talent Academy <noreply@talent-academy.local>";
  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ from, to, subject, text }),
  });
  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Resend ${response.status}: ${body.slice(0, 200)}`);
  }
  return { skipped: false as const };
}
