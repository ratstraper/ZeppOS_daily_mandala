import * as hmUI from "@zos/ui";
import { getText as i18n} from "@zos/i18n";
import { log as Logger, px } from "@zos/utils";
import { BasePage } from "@zeppos/zml/base-page";
import { onKey, offKey, KEY_UP, KEY_DOWN, KEY_SELECT, KEY_EVENT_CLICK } from '@zos/interaction';
import { scrollTo } from '@zos/page';
import { push } from '@zos/router';
import { LocalStorage } from '@zos/storage';
import { DEVICE_WIDTH, DEVICE_HEIGHT } from '../utils/config/device'

import {
  FETCH_BUTTON,
  FETCH_RESULT_TEXT,
} from "zosLoader:./index.[pf].layout.js";

const logger = Logger.getLogger("mandala_day");


Page(
  BasePage({
    state: {
      storage: null,
      selectedIndex: -1, // -1 означает, что курсор ни на чем не стоит
      bgRects: [],       // Сюда сложим все фоны кнопок для управления цветом
      menuItems: []      // Данные меню
    },
    widgets: {
      text: null,
      btn: null,
      questionImg: null
    },
    onInit() {
      this.state.storage = new LocalStorage();
    },
    build() {
      hmUI.createWidget(hmUI.widget.TEXT, {
        x: 0,
        y: px(40),
        w: DEVICE_WIDTH,
        h: px(60),
        color: 0xffffff,
        text_size: px(40),
        text_style: hmUI.text_style.NONE,
        align_h: hmUI.align.CENTER_H,
        align_v: hmUI.align.CENTER_V,
        text: i18n("app_name"),
      });

      this.state.menuItems = [
        { id: 'practice/index', title: i18n("practice"), icon: 'icons/ic_daily.png' },
        { id: 'mandala/index', title: i18n("collection"), icon: 'icons/ic_collection.png' },      
      ];

      // 3. Настройки геометрии и отступов
      const startY = px(175);           // Отступ сверху (под заголовком)
      const buttonHeight = px(126);      // Высота одной плашки
      const spacing = px(25);           // Расстояние между плашками
      const startX = px(40);            // Центрирование (40 пикселей от каждого края)
      const buttonWidth = DEVICE_WIDTH - (2 * startX); // Ширина плашки (экран минус отступы по бокам)

      const normalColor = 0x2C2C2C; 
      const pressedColor = 0x4A4A4A;

      const questionIndex = this.state.menuItems.length;


      // 3. Функция, которая красит нужную кнопку и сбрасывает остальные
      const updateSelection = () => {
        this.state.bgRects.forEach((rect, idx) => {
          rect.setProperty(hmUI.prop.COLOR, idx === this.state.selectedIndex ? pressedColor : normalColor);
        });

        if (this.widgets.questionImg) {
          const isQuestionSelected = this.state.selectedIndex === questionIndex;
          this.widgets.questionImg.setProperty(
            hmUI.prop.SRC, 
            isQuestionSelected ? 'icons/question_64.png' : 'icons/question_64bw.png'
          );
        }
      };

      // 3. Умная функция центрирования камеры на нужной кнопке
      const scrollToItem = (index) => {
        if (index === -1) return;
        
        let itemY, itemH;

        if (index < questionIndex) {
          // Это стандартная кнопка меню
          itemY = startY + index * (buttonHeight + spacing);
          itemH = buttonHeight;
        } else {
          // Это наша круглая кнопка с вопросом (вычисляем ее координаты)
          itemY = startY + questionIndex * (buttonHeight + spacing) + spacing;
          itemH = px(64); 
        }
        
        let targetY = itemY + (itemH / 2) - (DEVICE_HEIGHT / 2);
        if (targetY < 0) targetY = 0;
        
        scrollTo({ 
          y: -targetY, 
          animConfig: { anim_duration: 250 }
        }); 
      };

      // 4. Отрисовываем кнопки в цикле
      this.state.menuItems.forEach((item, index) => {
        const yPos = startY + index * (buttonHeight + spacing);

        const btnGroup = hmUI.createWidget(hmUI.widget.GROUP, {
          x: startX, y: yPos, w: buttonWidth, h: buttonHeight
        });

        const bgRect = btnGroup.createWidget(hmUI.widget.FILL_RECT, {
          x: 0, y: 0, w: buttonWidth, h: buttonHeight,
          color: normalColor, radius: px(63)       
        });
        
        this.state.bgRects.push(bgRect);

        btnGroup.createWidget(hmUI.widget.IMG, {
          x: px(24), y: (buttonHeight - px(60)) / 2, w: px(60), h: px(60), src: item.icon
        });

        btnGroup.createWidget(hmUI.widget.TEXT, {
          x: px(104), y: 0, w: buttonWidth - px(140), h: buttonHeight,
          color: 0xffffff, text_size: px(36), align_h: hmUI.align.LEFT, align_v: hmUI.align.CENTER_V,
          text: item.title
        });

        btnGroup.createWidget(hmUI.widget.IMG, {
          x: buttonWidth - px(84), y: (buttonHeight - px(64)) / 2, w: px(64), h: px(64), src: 'icons/arrow_right.tga' 
        });

        // --- Сенсорная логика синхронизируется с индексом ---
        btnGroup.addEventListener(hmUI.event.CLICK_DOWN, () => {
          this.state.selectedIndex = index;
          updateSelection();
        });
        btnGroup.addEventListener(hmUI.event.MOVE, () => {
          this.state.selectedIndex = -1;
          updateSelection();
        });
        btnGroup.addEventListener(hmUI.event.CLICK_UP, () => {
          if (this.state.selectedIndex === index) {
            this.state.selectedIndex = -1;
            updateSelection();
            this.executeAction(item); 
          }
        });
      });

      const questionY = startY + questionIndex * (buttonHeight + spacing) + spacing;
      
      this.widgets.questionImg = hmUI.createWidget(hmUI.widget.IMG, {
        x: (DEVICE_WIDTH - px(64)) / 2,
        y: questionY,
        w: px(64),
        h: px(104),
        src: 'icons/question_64bw.png' 
      });

      this.widgets.questionImg.addEventListener(hmUI.event.CLICK_DOWN, () => {
        this.state.selectedIndex = questionIndex;
        updateSelection();
      });

      this.widgets.questionImg.addEventListener(hmUI.event.MOVE, () => {
        this.state.selectedIndex = -1;
        updateSelection();
      });

      this.widgets.questionImg.addEventListener(hmUI.event.CLICK_UP, () => {
        if (this.state.selectedIndex === questionIndex) {
          this.state.selectedIndex = -1;
          updateSelection();
          // Передаем фейковый объект item для выполнения действия "Помощь"
          this.executeAction({ id: 'help/index', title: 'Справка/Помощь' }); 
        }
      });

      // 4. Логика физических кнопок
      onKey({
        callback: (key, keyEvent) => {
          if (keyEvent !== KEY_EVENT_CLICK) return false;

          // ВАЖНО: Увеличили общее количество элементов на 1
          const totalElements = this.state.menuItems.length + 1; 

          if (key === KEY_DOWN) {
            this.state.selectedIndex = this.state.selectedIndex === -1 ? 0 : (this.state.selectedIndex + 1) % totalElements;
            updateSelection();
            scrollToItem(this.state.selectedIndex); 
            return true; 
          } 
          else if (key === KEY_UP) {
            this.state.selectedIndex = this.state.selectedIndex <= 0 ? (totalElements - 1) : (this.state.selectedIndex - 1);
            updateSelection();
            scrollToItem(this.state.selectedIndex); 
            return true; 
          } 
          else if (key === KEY_SELECT) {
            if (this.state.selectedIndex !== -1) {
              
              // Определяем, какую кнопку мы сейчас активируем
              let itemToActivate;
              if (this.state.selectedIndex < questionIndex) {
                itemToActivate = this.state.menuItems[this.state.selectedIndex];
              } else {
                itemToActivate = { id: 'help/index', title: 'Справка/Помощь' };
              }

              this.state.selectedIndex = -1;
              updateSelection();
              this.executeAction(itemToActivate);
            }
            return true; 
          }

          return false; 
        }
      });
    },
    
    // 5. Выделяем логику активации пункта в отдельный метод
    executeAction(item) {
      logger.log(`Активирован пункт: ${item.title}`);
      
      push({
        // url: "page/mandala"
        url: `page/${item.id}`, 
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

    
    onDestroy() {
      offKey();
    }
  })
);