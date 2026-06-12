import { LocalStorage } from '@zos/storage';
import { log as Logger, px } from "@zos/utils";

const logger = Logger.getLogger("practice_screen");

export default class Analytics {

  static getInstallationId() {
  // export function getInstallationId() {
    const storage = new LocalStorage();
    let installId = storage.getItem('app_install_id');

    if (!installId) {
      installId = 'usr_' + Date.now().toString(36) + '_' + Math.random().toString(36).substr(2, 9);
      storage.setItem('app_install_id', installId);
    }

    return installId;
  }

  static getPracticeDays(time) {
    // ZeppOS Time.Month возвращает месяц в диапазоне 1-12, а JavaScript Date - в диапазоне 0-11. Учитываем это при парсинге.
    
    const storage = new LocalStorage();
    let lastMandalaDate = storage.getItem('mandalaDay') || null;
    let streakDays = storage.getItem('streakDays') || 0;
    let bestStreak = storage.getItem('bestStreak') || 0;
    if(lastMandalaDate == null) {
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

    const expectedNextDayString =
      `${jsDate.getDate()}`.padStart(2, "0") +
      `${jsDate.getMonth() + 1}`.padStart(2, "0") + 
      `${jsDate.getFullYear()}`;

    const todayString =
      `${time.getDate()}`.padStart(2, "0") +
      `${time.getMonth()}`.padStart(2, "0") + 
      `${time.getFullYear()}`;

    logger.log(`Last mandala date: ${lastMandalaDate}, expected next day: ${expectedNextDayString}, today: ${todayString}, streak: ${streakDays}, best: ${bestStreak}, isNextDay: ${expectedNextDayString === todayString}, isSameDay: ${lastMandalaDate === todayString}`);
    return {
      streak: streakDays,
      best: bestStreak,
      isNextDay: expectedNextDayString === todayString,
      isSameDay: lastMandalaDate === todayString
    };
  }
}