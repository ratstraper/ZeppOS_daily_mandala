import { LocalStorage } from '@zos/storage';
import { Time } from "@zos/sensor";
import { STORAGE_KEYS, WEBSITE_URL } from './constants';

const storage = new LocalStorage();

export default class AppStorage {

  static getInstallationId() {
    let installId = storage.getItem(STORAGE_KEYS.INSTALL_ID);

    if (!installId) {
      installId = 'ZeppOS_usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
      storage.setItem(STORAGE_KEYS.INSTALL_ID, installId);
    }
    return installId;
  }

  static getLinkUrl() {
    return `${WEBSITE_URL}/link/add/${encodeURIComponent(this.getInstallationId())}`;
  }

  static getRecord(key) { return storage.getItem(key); }
  static setRecord(key, value) { storage.setItem(key, value); }

  static getMandalaDayString() {
    const time = new Time();
    return (
      `${time.getDate()}`.padStart(2, "0") +
      `${time.getMonth()}`.padStart(2, "0") +
      `${time.getFullYear()}`
    );
  }

  static addPracticeDays() {
    let time = new Time();
    const { streak, best, isNextDay, isSameDay } = this.getPracticeDays(time);
    if (!isSameDay) {
      const newStreak = streak + 1;
      this.setStreakData(newStreak, Math.max(best, newStreak));
    }
  }

  static getPracticeDays(time = new Time()) {
    // ZeppOS Time.Month возвращает месяц в диапазоне 1-12, а JavaScript Date - в диапазоне 0-11. Учитываем это при парсинге.
    let lastMandalaDate = storage.getItem(STORAGE_KEYS.MANDALA_DAY) || null;
    let streakDays = storage.getItem(STORAGE_KEYS.STREAK_DAYS) || 0;
    let bestStreak = storage.getItem(STORAGE_KEYS.BEST_STREAK) || 0;

    if (lastMandalaDate == null) {
      return {
        streak: 0,
        best: 0,
        isNextDay: false,
        isSameDay: false
      };
    }

    const day = parseInt(lastMandalaDate.substring(0, 2), 10);
    const zeppMonth = parseInt(lastMandalaDate.substring(2, 4), 10);
    const year = parseInt(lastMandalaDate.substring(4, 8), 10);

    const jsDate = new Date(year, zeppMonth - 1, day);
    jsDate.setDate(jsDate.getDate() + 1);

    const afterStreakeDay =
      `${jsDate.getDate()}`.padStart(2, "0") +
      `${jsDate.getMonth() + 1}`.padStart(2, "0") +
      `${jsDate.getFullYear()}`;

    const todayString =
      `${time.getDate()}`.padStart(2, "0") +
      `${time.getMonth()}`.padStart(2, "0") +
      `${time.getFullYear()}`;

    return {
      streak: ((afterStreakeDay === todayString) || (lastMandalaDate === todayString)) ? streakDays : 0,
      best: bestStreak,
      isNextDay: afterStreakeDay === todayString,
      isSameDay: lastMandalaDate === todayString
    };
  }

  static setMandalaData(day, path) {
    this.addPracticeDays();
    storage.setItem(STORAGE_KEYS.MANDALA_DAY, day);
    storage.setItem(STORAGE_KEYS.MANDALA_PATH, path);
  }

  static setStreakData(streak, best) {
    storage.setItem(STORAGE_KEYS.STREAK_DAYS, streak);
    storage.setItem(STORAGE_KEYS.BEST_STREAK, best);
  }
}