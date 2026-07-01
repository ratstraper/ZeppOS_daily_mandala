import { set as setAlarm } from "@zos/alarm";

const HALF_HOUR_SECONDS = 1 * 60;

/**
 * Запланировать показ уведомления через 30 минут.
 */
export function scheduleNotification(item) {
    const title = item && item.title ? String(item.title) : "Новое событие";

    const content = item && item.content ? String(item.content) : "Тестовый текст";

    /*
     * param должен быть строкой.
     * JSON.stringify корректно сохраняет русский текст.
     */
    const param = JSON.stringify({
        title,
        content,
    });

    const alarmId = setAlarm({
        url: "app-service/delayedNewsService",
        delay: HALF_HOUR_SECONDS,
        param,
        store: true, //сохранится даже после перезагрузки часов
    });

    console.log(`[alarm] created id=${alarmId}`);

    if (alarmId === 0) {
        console.log("[alarm] alarm creation failed");
    }

    return alarmId;
}