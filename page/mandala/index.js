import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { getDeviceInfo } from "@zos/device";
import { push } from '@zos/router';
import { getProfile, GENDER_MALE, GENDER_FEMALE } from "@zos/user";
import AppStorage from "../../utils/config/storage.js";
import LoadingAnimationComponent from "../../utils/components/LoadingAnimationComponent.js";
import * as fs from "@zos/fs";
import {
    setPageBrightTime,
    resetPageBrightTime,
    pauseDropWristScreenOff,
    resetDropWristScreenOff,
} from "@zos/display";

import { WEBSITE_URL, STORAGE_KEYS } from "../../utils/config/constants.js";

const logger = Logger.getLogger("practice_screen");

const SCREEN_IDLE = "SCREEN_IDLE";
const SCREEN_LOADING = "SCREEN_LOADING";
const SCREEN_RESULT = "SCREEN_RESULT";
const SCREEN_ERROR = "SCREEN_ERROR";

import { width, height, screenShape, platform } from "../../utils/config/device";
const profile = getProfile() || {};
const { age, gender, region } = profile;
const squareSize = Math.min(width, height) * 1.0;

Page(
    BasePage({
        state: {
            screenState: SCREEN_IDLE,
        },
        widgets: {
            loadingAnim: null,
        },

        onInit() {
        },

        build() {
            this.layout = this.createLayout();

            this.widgets.loadingAnim = new LoadingAnimationComponent(hmUI);

            // this.buildTitle();
            // this.buildIdleGroup();
            // this.buildLoadingGroup();
            // this.buildResultGroup();

            // this.refreshProgress();
            // this.setScreenState(SCREEN_IDLE);
            // this.initKeyNavigation();
        },

        createLayout() {
            const heroX = px(40);
            const heroY = px(138);
            const heroW = width - px(80);
            const heroH = px(160);

            const progressY = heroY + heroH + px(26);
            const statusY = progressY + px(42);
            const helpY = statusY + px(54);

            const loadingAnimSize = px(48);
            const loadingAnimX = (width - loadingAnimSize) / 2;
            const loadingAnimY =
                screenShape === 1 ? (height - loadingAnimSize) / 2 - px(36) : px(140);

            const loadingTextY = loadingAnimY + loadingAnimSize + px(22);

            const resultX = (width - squareSize) / 2;
            const resultY =
                screenShape === 1 ? (height - squareSize) / 2 : px(40);

            return {
                heroX,
                heroY,
                heroW,
                heroH,
                progressY,
                statusY,
                helpY,
                loadingAnimX,
                loadingAnimY,
                loadingAnimSize,
                loadingTextY,
                resultX,
                resultY,
            };
        },

        fetchData() {
            logger.log("Sending GET_MANDALA request");

            const mandalaDay = AppStorage.getMandalaDayString();
            const userId = `ZeppOS_${AppStorage.getInstallationId()}`;

            this.request({
                method: "GET_MANDALA",
                day: mandalaDay,
                info: platform,
                size: squareSize,
                age,
                gender:
                    gender === GENDER_MALE
                        ? "M"
                        : gender === GENDER_FEMALE
                            ? "F"
                            : "U",
                region,
                usr: userId,
            }).then((data) => {
                const { result = {}, isEmulatorMode, filePath, fileData } = data;

                if (result !== "Ok") {
                    logger.log("Phone returned error:", result);
                    this.setScreenState(SCREEN_ERROR, {
                        message: i18n("err_connection_to_the_phone"),
                    });
                    return;
                }

                // if (isEmulatorMode) {
                //   logger.log("Saving file in emulator mode");
                //   const fd = fs.openSync({
                //     path: filePath,
                //     flag: fs.O_RDWR | fs.O_CREAT | fs.O_TRUNC,
                //   });
                //   fs.writeSync({ fd, buffer: fileData });
                //   fs.closeSync({ fd });
                // } else {

                AppStorage.setMandalaData(mandalaDay, filePath);
                // }

                const { streak, best, isNextDay, isSameDay } = AppStorage.getPracticeDays();
                this.state.progress = {
                    streak: streak,
                    best: best,
                    doneToday: isSameDay,
                    isNextDay: isNextDay,
                };
                this.refreshProgress();

                this.setScreenState(SCREEN_RESULT, { filePath });
                logger.log(`Storage: ${this.state.progress.streak} days, best: ${this.state.progress.best}, isNextDay: ${this.state.progress.isNextDay}, doneToday: ${this.state.progress.doneToday}`);
            })
                .catch((err) => {
                    logger.log("Network/BLE error:", err);
                    this.setScreenState(SCREEN_ERROR, {
                        message: i18n("err_connection_to_the_phone"),
                    });
                });
        },

        keepScreenAwake(isAwake) {
            if (isAwake) {
                setPageBrightTime({ brightTime: 0 });
                pauseDropWristScreenOff({ duration: 0 });
            } else {
                resetPageBrightTime();
                resetDropWristScreenOff();
            }
        },

        onDestroy() {
            this.keepScreenAwake(false);
            if (this.widgets.loadingAnim) {
                this.widgets.loadingAnim.delete();
            }
        },
    })
);
