import * as hmUI from "@zos/ui";
import { getText as i18n} from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { getDeviceInfo } from '@zos/device';
import { Time } from '@zos/sensor';
import { getSystemInfo } from '@zos/settings';
import { LocalStorage } from '@zos/storage'
import { getProfile, GENDER_MALE, GENDER_FEMALE } from '@zos/user'
import LoadingAnimationComponent from '../../utils/components/LoadingAnimationComponent.js';

import * as fs from '@zos/fs';  //for test into emulator
import { 
  setPageBrightTime, 
  resetPageBrightTime, 
  pauseDropWristScreenOff, 
  resetDropWristScreenOff,
  pausePalmScreenOff,
  resetPalmScreenOff
} from '@zos/display';

import {
  FETCH_BUTTON,
  FETCH_RESULT_TEXT,
} from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");

const deviceInfo = getDeviceInfo();
const systemInfo = getSystemInfo() || {};
const profile = getProfile() || {};

const { width, height, screenShape, deviceName = '?', productId = 0, productVer = 0, deviceSource = 0 } = deviceInfo;
const { osVersion = '?', firmwareVersion = '?', sdkVersion = '?' } = systemInfo;
const { age, gender, region } = profile;

const platform = `${deviceName}/${osVersion}, FV:${firmwareVersion}, SDK:${sdkVersion}, ${productId}.${productVer}.${deviceSource}`;
const squireSize = Math.min(width, height) * 1.0; 

logger.log(`Screen size: ${width} x ${height}, shape: ${screenShape}`);


/**
 * + сбор данных о пользователях: пол, возраст, регион
 * + локальное хранение для даты последней заказанной мандалы
 * + анимация при получении мандалы https://docs.zepp.com/docs/reference/device-app-api/newAPI/ui/widget/IMG_ANIM/
 * несколько экранов: dashboard, мандала дня, описание, ссылки на минт и сайт
 * описание и контент всего
 * QR на сайт и минт https://docs.zepp.com/docs/reference/device-app-api/newAPI/ui/widget/QRCODE/
 * механизм для уведомлений о новостях в проекте
 */
Page(
  BasePage({
    state: {
      storage: null,
    },
    widgets: {
      text: null,
      img: null,
      btn: null,
      loading: null,
    },
    onInit() {
      this.state.storage = new LocalStorage();
    },
    build() {

    // if (hmBle.connectStatus() !== true) {
    //   this.drawNoBLEConnect();
      
    // } else {
    //   logger.log("BLE is connected");

      this.widgets.loading = new LoadingAnimationComponent(hmUI);

      this.widgets.img = hmUI.createWidget(hmUI.widget.IMG, {
        x: (width - squireSize) / 2,
        y: (screenShape === 1 ? (height - squireSize) / 2 : px(50)),
        w: squireSize,
        h: squireSize,
        src: '' 
      });

      this.widgets.btn = hmUI.createWidget(hmUI.widget.BUTTON, {
        ...FETCH_BUTTON,
        click_func: () => {
          logger.log("click button");
          
          this.widgets.loading.show( 
            x = (width - px(48)) / 2,
            y = (screenShape === 1 ? (height - px(48)) / 2 : px(50)),
            w = px(48),
            h = px(48),
          );
          
          this.keepScreenAwake(true);
          this.updateStatusText(i18n("loading_mandala"));
          this.fetchData();
        },
      });
    },

    fetchData() {
      console.log('Sending GET_DATA request to the phone...');
      
      const time = new Time();
      const mandalaDay = `${time.getDate()}`.padStart(2, '0') +
                         `${time.getMonth()}`.padStart(2, '0') + 
                         `${time.getFullYear()}`;

      const localMandalaDay = this.state.storage.getItem('mandalaDay');
      
      // if (localMandalaDay === mandalaDay) {
      //   logger.log('Mandala for today has already been fetched');
      //   const savedPath = this.state.storage.getItem('mandalaPath', 'mandaladay.png');
      //   this.drawMandala(savedPath); 
      //   return;
      // }

      this.request({
        method: "GET_MANDALA",
        day: mandalaDay,
        info: platform,
        size: squireSize,
        age,
        gender: gender === GENDER_MALE ? 'M' : gender === GENDER_FEMALE ? 'F' : 'U',
        region
      })
      .then((data) => {
        const { result = {}, isEmulatorMode, filePath, fileData } = data;
        
        if (result === "Ok") {
          if (isEmulatorMode) {
            console.log('Saving file in emulator mode...');
            const fd = fs.openSync({path: filePath, flag: fs.O_RDWR | fs.O_CREAT | fs.O_TRUNC});
            fs.writeSync({fd, buffer: fileData});
            fs.closeSync({ fd });
          } else {
            this.state.storage.setItem('mandalaDay', mandalaDay);
            this.state.storage.setItem('mandalaPath', filePath);
          }

          this.drawMandala(filePath);
        } else {
          logger.log("Error from phone:", result);
          this.updateStatusText("Error connecting\nto the phone");
        }
      })
      .catch((err) => {
        logger.log("Network/BLE error:", err);
        this.updateStatusText(`Error connecting\nto the phone`);
        this.keepScreenAwake(false);
      })
      .finally(() => {
        this.widgets.loading.delete();
      });
    },

    updateStatusText(message) {
      if (!this.widgets.text) {
        this.widgets.text = hmUI.createWidget(hmUI.widget.TEXT, {
          ...FETCH_RESULT_TEXT,
          text: message,
        });
      } else {
        this.widgets.text.setProperty(hmUI.prop.TEXT, message);
      }
    },

    drawMandala(filePath) {
      console.log('Drawing mandala:', filePath);
      
      if (filePath && this.widgets.img) {
        this.widgets.img.setProperty(hmUI.prop.MORE, { src: filePath});
      }

      // удаление виджетов и зачистка ссылок
      if (this.widgets.text) {
        hmUI.deleteWidget(this.widgets.text);
        this.widgets.text = null; 
      }
      if (this.widgets.btn) {
        hmUI.deleteWidget(this.widgets.btn);
        this.widgets.btn = null; 
      }
    },

    keepScreenAwake(isAwake) {
      if (isAwake) {
        setPageBrightTime({ brightTime: 0 });
        pauseDropWristScreenOff({ duration: 0 });
        // pausePalmScreenOff({ duration: 0 });
      } else {
        resetPageBrightTime();
        resetDropWristScreenOff();
        // resetPalmScreenOff();
      }
    },

    onDestroy() {
      this.keepScreenAwake(false);
    }
  })
);