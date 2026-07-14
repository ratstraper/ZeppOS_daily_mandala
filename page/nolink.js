import * as hmUI from "@zos/ui";
import { getText as i18n } from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { getDeviceInfo } from "@zos/device";
import { push } from '@zos/router';
import AppStorage from "../utils/config/storage.js";
import { NORMAL_COLOR, PRESSED_COLOR, SELECTED_COLOR, TITLE } from "zosLoader:./index.[pf].layout.js";
import { WEBSITE_URL, PRACTICE_SHOW, STORAGE_KEYS } from "../utils/config/constants.js";

const logger = Logger.getLogger("practice_screen");
const { width, height } = getDeviceInfo();

const SLIDES_PRACTICE = [
    {
        titleKey: "help_practice_slide1_title",
        textKey: "help_practice_slide1_text",
    },
    {
        titleKey: "help_practice_slide2_title",
        textKey: "help_practice_slide2_text",
    },
    {
        titleKey: "help_practice_slide3_title",
        textKey: "help_practice_slide3_text",
        action: {
            labelKey: "help_practice_slide3_action",
            url: WEBSITE_URL,
        },
    },
];

Page(
    BasePage({
        state: {
            selectedIndex: 0,
            progress: {
                streak: 0,
                best: 0,
                doneToday: false,
                isNextDay: false,
            },
        },

        widgets: {
            title: null,
            idleGroup: null,
            bgRect: null,
            progressText: null,
            statusText: null,
            helpImg: null,
        },

        build() {
            this.layout = this.createLayout();
            this.buildTitle();
            this.buildIdleGroup();
            this.refreshProgress();
            this.initKeyNavigation();
        },


        createLayout() {
            const progressY = px(150) + px(160) + px(26);
            const statusY = progressY + px(42);
            const helpY = statusY + px(54);
            return { progressY, statusY, helpY };
        },

        buildTitle() {
            this.widgets.title = hmUI.createWidget(hmUI.widget.TEXT, {
                ...TITLE(this.layout, i18n("collection") || "Collection"),
            });
        },

        buildIdleGroup() {

            // const clickArea = this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
            //     x: btnX, y: btnY, w: btnWidth, h: btnHeight, src: ''
            // });


            this.widgets.helpImg = this.widgets.idleGroup.createWidget(hmUI.widget.IMG, {
                x: (width - px(64)) / 2, y: this.layout.helpY, w: px(64), h: px(104), src: "icons/question_64bw.png",
            });

            this.widgets.helpImg.addEventListener(hmUI.event.CLICK_DOWN, () => {
                this.setHelpSelected(true); this.state.selectedIndex = -1; this.syncFocus();
            });
            this.widgets.helpImg.addEventListener(hmUI.event.MOVE, () => { this.setHelpSelected(false); });
            this.widgets.helpImg.addEventListener(hmUI.event.CLICK_UP, () => {
                this.setHelpSelected(false); this.openHelp();
            });
        },

        setHelpSelected(selected) {
            this.widgets.helpImg.setProperty(hmUI.prop.SRC, selected ? "icons/question_64.png" : "icons/question_64bw.png");
        },

        setButtonSelected(selected) {
            this.widgets.bgRect.setProperty(hmUI.prop.COLOR, selected ? SELECTED_COLOR : NORMAL_COLOR);
        },


        handleOpenClick() {
            logger.log("Open clicked, navigating to show screen");
            const mandalaDay = AppStorage.getMandalaDayString();
            const local = AppStorage.getRecord(STORAGE_KEYS.MANDALA_DAY) == mandalaDay;
            push({
                url: "page/show",
                params: JSON.stringify({
                    day: mandalaDay,
                    title: i18n("practice"),
                    fromLocalStorage: local,
                    type: PRACTICE_SHOW,
                }),
            });
        },

        openHelp() {
            logger.log("Open practice help");
            push({
                url: "page/help",
                params: JSON.stringify({ slides: SLIDES_PRACTICE }),
            });
        },

        initKeyNavigation() {
            onKey({
                callback: (key, keyEvent) => {
                    if (keyEvent !== KEY_EVENT_CLICK) return false;
                    if (key === KEY_DOWN || key === KEY_UP) {
                        this.state.selectedIndex = this.state.selectedIndex === 0 ? 1 : 0;
                        this.syncFocus();
                        return true;
                    }
                    if (key === KEY_SELECT) {
                        this.state.selectedIndex === 1 ? this.openHelp() : this.handleOpenClick();
                        return true;
                    }
                    return false;
                },
            });
            this.syncFocus();
        },

        syncFocus() {
            this.setButtonSelected(this.state.selectedIndex === 0);
            this.setHelpSelected(this.state.selectedIndex === 1);
        },

        onDestroy() {
            offKey();
        },
    })
);