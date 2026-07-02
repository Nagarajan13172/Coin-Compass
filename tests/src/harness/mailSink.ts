import fs from "node:fs";
import path from "node:path";

export interface CapturedMail {
  i: number;
  at: number;
  to: string;
  subject: string;
  text: string;
}

/**
 * Parses the server's console mail output (emitted when SMTP is unconfigured)
 * back into structured messages and appends them as JSONL to `outboxFile`, so
 * test workers in other processes can read the verification/reset tokens and
 * emailed 2FA codes that never leave the app any other way.
 *
 * The server logs each message as:
 *   [mail] SMTP not configured — email not sent. Preview below.
 *     to:      <to>
 *     subject: <subject>
 *     text:
 *         <text, every line indented 4 spaces>
 */
export function createMailSink(outboxFile: string) {
  fs.mkdirSync(path.dirname(outboxFile), { recursive: true });
  fs.writeFileSync(outboxFile, "");

  let count = 0;
  let pending = "";
  let cur: { to?: string; subject?: string; textLines: string[]; inText: boolean } | null = null;

  const flush = () => {
    if (cur && cur.to != null) {
      const mail: CapturedMail = {
        i: count++,
        at: Date.now(),
        to: cur.to,
        subject: cur.subject ?? "",
        text: cur.textLines.join("\n"),
      };
      fs.appendFileSync(outboxFile, JSON.stringify(mail) + "\n");
    }
    cur = null;
  };

  const startBlock = () => {
    flush();
    cur = { textLines: [], inText: false };
  };

  const handleLine = (line: string) => {
    if (/\[mail\] SMTP not configured/.test(line)) {
      startBlock();
      return;
    }
    if (!cur) return;

    if (cur.inText) {
      if (/^ {4}/.test(line)) {
        cur.textLines.push(line.slice(4));
      } else {
        flush(); // a non-indented line ends the message body
      }
      return;
    }

    let m: RegExpExecArray | null;
    if ((m = /^\s*to:\s*(.*)$/.exec(line))) cur.to = m[1].trim();
    else if ((m = /^\s*subject:\s*(.*)$/.exec(line))) cur.subject = m[1].trim();
    else if (/^\s*text:\s*$/.test(line)) cur.inText = true;
  };

  return {
    write(chunk: string) {
      pending += chunk;
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) handleLine(line);
    },
    close() {
      if (pending) {
        handleLine(pending);
        pending = "";
      }
      flush();
    },
  };
}
