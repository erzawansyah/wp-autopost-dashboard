/**
 * @file normalize-windows-commands.js
 * @description Hook PreToolUse Antigravity untuk menormalisasi pemanggilan npx/npm di Windows PowerShell.
 * Mengubah `npx ...` -> `npx.cmd ...` dan `npm ...` -> `npm.cmd ...` untuk mencegah PSSecurityException.
 */

const fs = require('fs');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf-8');
  } catch (err) {
    return '';
  }
}

function main() {
  const input = readStdin();
  if (!input) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  let data;
  try {
    data = JSON.parse(input);
  } catch (e) {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const toolName = data.toolCall?.name;
  const args = data.toolCall?.args;

  if (toolName !== 'run_command' || !args || typeof args.CommandLine !== 'string') {
    console.log(JSON.stringify({ decision: 'allow' }));
    return;
  }

  const originalCmd = args.CommandLine;

  // Cek apakah perintah mengandung npx atau npm yang tidak berakhiran .cmd
  // Regex mencari: awal baris atau setelah pemisah (; | && \n) diikuti npx/npm dan spasi
  const npxRegex = /(^|[;&|\n]\s*)npx(?!\.cmd)(?=\s)/g;
  const npmRegex = /(^|[;&|\n]\s*)npm(?!\.cmd)(?=\s)/g;

  let rewrittenCmd = originalCmd;
  if (npxRegex.test(rewrittenCmd)) {
    rewrittenCmd = rewrittenCmd.replace(/(^|[;&|\n]\s*)npx(?!\.cmd)(?=\s)/g, '$1npx.cmd');
  }
  if (npmRegex.test(rewrittenCmd)) {
    rewrittenCmd = rewrittenCmd.replace(/(^|[;&|\n]\s*)npm(?!\.cmd)(?=\s)/g, '$1npm.cmd');
  }

  if (rewrittenCmd !== originalCmd) {
    console.log(
      JSON.stringify({
        decision: 'allow',
        reason: 'Normalisasi otomatis npx/npm -> npx.cmd/npm.cmd untuk kompatibilitas Windows PowerShell',
        overwrite: {
          CommandLine: rewrittenCmd,
        },
      })
    );
  } else {
    console.log(JSON.stringify({ decision: 'allow' }));
  }
}

main();
