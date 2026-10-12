export function fromMins(n) {
  const h = Math.floor(n / 60), mi = n % 60;
  const ap = h < 12 ? 'AM' : 'PM';
  let hh = h % 12; if (hh === 0) hh = 12;
  return hh + ':' + String(mi).padStart(2, '0') + ' ' + ap;
}
