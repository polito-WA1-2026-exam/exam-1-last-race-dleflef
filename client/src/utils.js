export function segKey(a, b) {
  return a < b ? `${a}-${b}` : `${b}-${a}`;
}
