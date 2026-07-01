import * as notificationMgr from "@zos/notification";

AppService({
    onInit(param) {
        console.log(`[delayed-notification] onInit param=${String(param)}`);

        let message = {};

        try {
            if (typeof param === "string" && param.length > 0) {
                message = JSON.parse(param);
            }
        } catch (error) {
            console.log(`[delayed-notification] parse error=${String(error)}`);
        }

        const notifyId = notificationMgr.notify({
            title: message.title,
            content: message.content,
            actions: [
                {
                    text: "Открыть",
                    file: "page/index",
                },
            ],
            vibrate: 2,
        });

        console.log(`[delayed-notification] notifyId=${notifyId}`);

        if (notifyId === 0) {
            console.log("[delayed-notification] notification failed");
        }
    },

    onDestroy() {
        console.log("[delayed-notification] destroyed");
    },
});