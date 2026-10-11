/* ---------- transient notices ---------- */

let noticeTimer = null;
function notice(msg, ms = 4500) {
  $('live').textContent = msg;
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => ($('live').textContent = ''), ms);
}

