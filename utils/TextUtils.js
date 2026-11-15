import { getText as i18n } from "@zos/i18n"

/**
 * 
 * @param {"A {0} b {1} c {2} d"} msgid 
 * @param  {...any} args 
 * @returns string
 * @usage t('id', "Lee", 10000, 30)
 */
export function t(msgid, ...args) {
  let text = i18n(msgid)
  if (!text) return msgid 

  args.forEach((arg, index) => {
    // new RegExp с флагом 'g' заменит все вхождения, даже если {0} используется дважды
    text = text.replace(new RegExp(`\\{${index}\\}`, 'g'), String(arg))
  })

  return text
}

/**
 * "{name} {steps}, {name}!"
 * t('msgid', { name: "Lee", steps: 10000 })
 */
// export function t(msgid, params = {}) {
//   let text = getText(msgid)

//   if (!text) return msgid

//   // Перебираем ключи переданного объекта
//   for (const [key, value] of Object.entries(params)) {
//     text = text.replace(new RegExp(`\\{${key}\\}`, 'g'), String(value))
//   }

//   return text
// }

// getTextLayout.height и .rows упираются в потолок после ~2 строк (известный баг
// ZeppOS SDK, zepp-health/discussions#347) — считаем перенос строк сами: бьём
// явные \n на абзацы, внутри абзаца переносим по словам (на месте пробела),
// используя оценку средней ширины символа.
export function measureText(text, size, textWidth) {
  const avgCharWidth = size * 0.55;
  const charsPerLine = Math.max(1, Math.floor(textWidth / avgCharWidth));
  let lines = 0;
  text.split('\n').forEach((paragraph) => {
    if (paragraph.length === 0) {
      lines += 1;
      return;
    }
    let lineLen = 0;
    paragraph.split(' ').forEach((word) => {
      const wordLen = word.length + 1;
      if (lineLen === 0) {
        lines += 1;
        lineLen = wordLen;
      } else if (lineLen + wordLen > charsPerLine) {
        lines += 1;
        lineLen = wordLen;
      } else {
        lineLen += wordLen;
      }
    });
  });
  return { height: Math.ceil(lines * size * 1.3), rows: lines, width: textWidth };
}