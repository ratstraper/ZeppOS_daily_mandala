// Лёгкий (не крипто) хэш FNV-1a, 64 бита из двух независимых 32-битных прогонов.
// Криптостойкость тут не нужна: исходный uuid устройства — уже 32 байта случайных
// данных, перебирать нечего. 64 бита достаточно, чтобы коллизии между разными
// установками были практически исключены на любых реалистичных объёмах пользователей.
function fnv1a(str) {
  let hash = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

export function hashId(input) {
  const a = fnv1a('a#' + input);
  const b = fnv1a('b#' + input);
  return a.toString(36) + b.toString(36);
}
