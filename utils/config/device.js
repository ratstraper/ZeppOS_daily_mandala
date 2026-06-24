import { getDeviceInfo } from "@zos/device";
import { getSystemInfo, getLanguage, getDateFormat } from "@zos/settings";
import { getText as i18n } from "@zos/i18n";

const deviceInfo = getDeviceInfo();
const systemInfo = getSystemInfo() || {};

const {
  osVersion = "?",
  firmwareVersion = "?",
  sdkVersion = "?",
  minAPI = "?"
} = systemInfo;

export const {
  width,
  height,
  screenShape,
  deviceName = "?",
  productId = 0,
  productVer = 0,
  deviceSource = 0,
} = deviceInfo;
export const platform = `${deviceName}/${osVersion}/${minAPI}, FV:${firmwareVersion}, SDK:${sdkVersion}, ${productId}.${productVer}.${deviceSource}, SCREEN:${width},${height},${screenShape}`;

export const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT } = getDeviceInfo();

export const getLocale = () => {
  switch (getLanguage()) {
    case 0: return "zh-CN";
    case 1: return "zh-TW";
    case 2: return "en-US";
    case 3: return "es-ES";
    case 4: return "ru-RU";
    case 5: return "ko-KR";
    case 6: return "fr-FR";
    case 7: return "de-DE";
    case 8: return "id-ID";
    case 9: return "pl-PL";
    case 10: return "it-IT";
    case 11: return "ja-JP";
    case 12: return "th-TH";
    case 13: return "ar-EG";
    case 14: return "vi-VN";
    case 15: return "pt-PT";
    case 16: return "nl-NL";
    case 17: return "tr-TR";
    case 18: return "uk-UA";
    case 19: return "iw-IL";
    case 20: return "pt-BR";
    case 21: return "ro-RO";
    case 22: return "cs-CZ";
    case 23: return "el-GR";
    case 24: return "sr-RS";
    case 25: return "ca-ES";
    case 26: return "fi-FI";
    case 27: return "nb-NO";
    case 28: return "da-DK";
    case 29: return "sv-SE";
    case 30: return "hu-HU";
    case 31: return "ms-MY";
    case 32: return "sk-SK";
    default: return "en-US";
  }
}

export const getDateFormatString = (date) => {
  const day = parseInt(date.substring(0, 2), 10);
  const zeppMonth = parseInt(date.substring(2, 4), 10);
  const year = parseInt(date.substring(4, 8), 10);
  switch (getDateFormat()) {
    case 0: return `${year} ${getMonthNames(zeppMonth)} ${day}`;
    case 1: return `${day} ${getMonthNames(zeppMonth)} ${year}`; // day-month-year
    default: return `${getMonthNames(zeppMonth)} ${day} ${year}`; // month-day-year
  }
}

export const getMonthNames = (month) => {
  switch (month) {
    case 1: return i18n("month_january");
    case 2: return i18n("month_february");
    case 3: return i18n("month_march");
    case 4: return i18n("month_april");
    case 5: return i18n("month_may");
    case 6: return i18n("month_june");
    case 7: return i18n("month_july");
    case 8: return i18n("month_august");
    case 9: return i18n("month_september");
    case 10: return i18n("month_october");
    case 11: return i18n("month_november");
    case 12: return i18n("month_december");
    default: return i18n("month_invalid");
  }
}