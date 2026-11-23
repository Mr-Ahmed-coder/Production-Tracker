const escape = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
function html(title, body, footer) {
  return `<!doctype html><html lang="en"><body style="margin:0;background:#f4f5eb;color:#20271e;font-family:Arial,sans-serif"><main style="max-width:560px;margin:32px auto;padding:32px;background:#fffef8;border:1px solid #e5e9d8;border-radius:24px"><p style="font-weight:bold;color:#527222">StudyMomentum</p><h1 style="font-size:24px">${escape(title)}</h1>${body}<hr style="border:0;border-top:1px solid #e5e9d8;margin:28px 0"><p style="font-size:13px;color:#626a5d">${footer}</p></main></body></html>`;
}
export function reminderEmail({
  from,
  to,
  date,
  tasks,
  calendarUrl,
  unsubscribeUrl,
}) {
  const visible = tasks.slice(0, 50),
    more = tasks.length - visible.length;
  return {
    from,
    to: [to],
    subject: "A gentle reminder for your day · StudyMomentum",
    text: `StudyMomentum\nA little progress still counts.\nUnfinished activities planned for ${date}:\n${visible.map((t) => "- " + t.title).join("\n")}${more ? `\nAnd ${more} more in your calendar.` : ""}\n\nOpen your calendar: ${calendarUrl}\n\nUnsubscribe: ${unsubscribeUrl}\nThis reflects your saved checklist when this reminder was prepared.`,
    html: html(
      "A little progress still counts.",
      `<p>Here is your unfinished checklist for ${escape(date)}:</p><ul>${visible.map((t) => `<li style="padding:7px 0">${escape(t.title)}</li>`).join("")}</ul>${more ? `<p>And ${more} more in your calendar.</p>` : ""}<p><a style="display:inline-block;background:#d5fa36;color:#20271e;padding:12px 20px;border-radius:24px;text-decoration:none" href="${escape(calendarUrl)}">Open your calendar</a></p>`,
      `Your saved checklist may have changed since this reminder was prepared. <a href="${escape(unsubscribeUrl)}">Unsubscribe from daily reminders</a>.`,
    ),
    headers: { "List-Unsubscribe": `<${unsubscribeUrl}>` },
  };
}
export function verificationEmail({ from, to, url }) {
  return {
    from,
    to: [to],
    subject: "Verify your email for StudyMomentum reminders",
    text: `StudyMomentum\nYou requested email reminders. Verify your email address: ${url}\nThis link expires in 24 hours. Sign in to the account that requested it and confirm. Reminders remain off until you enable them in Settings. If you did not request this, ignore this email.`,
    html: html(
      "Make room for a little momentum.",
      `<p>You requested email reminders. Confirm ownership of this email address to continue.</p><p><a href="${escape(url)}">Verify my email</a></p><p>This link expires in 24 hours. Sign in to the requesting account and confirm.</p>`,
      "Reminders stay off until you enable them in Settings. If you did not request this, ignore this email.",
    ),
  };
}
