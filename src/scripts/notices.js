/* ---------- notices: the one-line status note in the room box (read out by screen readers) ---------- */

let noticeTimer = null;
function notice(msg, ms = 4500) {
  $('live').textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('live').textContent = ''), ms);
}

