import { BaseSideService } from "@zeppos/zml/base-side";

const logger = Logger.getLogger('test-image-convert')


/**
 * for emulator testing, you can use a direct URL to an image, for example:
 */
async function fetchEmulatorData(day, info, size, res) {
  logger.log('Starting file download...', day);
  try {
    const response = await fetch(`https://mandala.garageno9.site/api/watch/${day}/${size}`, {
      method: 'GET',
      headers: {
        'User-Agent': `${info}`,
        'Accept': 'image/png,image/jpeg,*/*'
      }
    });

    if (!response.ok) {
      logger.log('Error downloading in Side Service:', response.status, response.statusText);
      res(null, { result: `Error: Download failed ${response.status}, ${response.statusText}` });
      return;
    }

    // Если сервер возвращает текст (SVG строку)
    const arrayBuffer = await response.arrayBuffer();
    console.log(`Download success! Buffer size: ${arrayBuffer.byteLength} bytes`);

    // 3. Отправляем массив байт напрямую на часы
    // В реальной жизни FileTransfer передает файлы, а здесь мы передаем "начинку" файла
    res(null, {
      result: "Ok",
      isEmulatorMode: true, // Флаг, чтобы часы поняли, что пришел буфер
      filePath: 'mandaladay.png',
      fileData: arrayBuffer // Сам буфер картинки
    });

  } catch (err) {
    logger.log('Error during fetch:', err);
    res(null, { result: `Error: Fetch failed ${err}`, });
  }
}

/**
 * For smartphone
 */
function getMandala(day, info, size, age, gender, region, usr, res) {
  logger.log('Starting file download...', day);

  const downloadTask = network.downloader.downloadFile({
    url: `https://mandala.garageno9.site/api/watch/${day}/${size}`,
    timeout: 60000,
    filePath: `${day}.png`,
    headers: {
      'User-Agent': `${info}`,
      'Accept': 'image/png,image/jpeg,*/*',
      "X-User": `${age}/${gender}/${region}/${usr}`
    }
  });

  downloadTask.onSuccess = (event) => {
    logger.log('The file has been successfully downloaded by the phone');

    image.convert({
      filePath: event.filePath,
      // targetFilePath: 'logo_watch.png'
    }).then((result) => {
      // Передаем файл по Bluetooth
      const outbox = transferFile.getOutbox();
      const fileObject = outbox.enqueueFile(result.targetFilePath, {
        name: 'mandaladay.png',
        type: 'image'
      });

      // Возвращаем ответ в ZML
      // ВАЖНО: Слушаем статус отправки файла!
      fileObject.on('change', (transferEvent) => {
        if (transferEvent.data.readyState === 'transferred') {
          logger.log('Success: The file is physically on the watch disk');
          logger.log(transferEvent);

          // Возвращаем ответ в ZML ТОЛЬКО после успешной доставки файла
          res(null, { result: "Ok", filePath: result.targetFilePath });

        } else if (transferEvent.data.readyState === 'error') {
          logger.log('Error during Bluetooth transfer');
          res(null, { result: `Error: Bluetooth transfer failed` });
        }
      });

    }).catch((err) => {
      logger.log('Error during conversion:', err);
      res(null, { result: `Error: Conversion failed ${err}`, });
    });
  };

  downloadTask.onFail = (event) => {
    logger.log('Error downloading in Side Service:', event.code, event.message);
    res(null, { result: `Error: Download failed ${event.code}, ${event.message}` });
  };
}

function getCollection(info, size, usr, res) {
  res(null, { result: "Ok", collection: [{ "day": "15011939", "name": "Ivan", "id": 15011939 }, { "day": "11111111", "name": "Thering", "id": 11111111 }, { "day": "31052000", "name": "End of spring", "id": 31052000 }, { "day": "26081910", "name": "Mary Teresa Bojaxhiu", "id": 26081910 }] });
}

AppSideService(
  BaseSideService({
    onInit() {
      logger.log('Side Service successfully started!');
    },
    onDestroy() { },
    onRequest(req, res) {
      logger.log("=====> Received method:", req.method);
      if (req.method === "GET_MANDALA") {
        getMandala(req.day, req.info, req.size, req.age, req.gender, req.region, req.usr, res);
        // fetchEmulatorData(req.day, req.info, req.size, res);
      } else if (req.method === "OPEN_MANDALA") {
        //Отправить запрос чтобы зафиксировать открытие мандалы (для аналитики)
      } else if (req.method === "GET_COLLECTION") {
        getCollection(req.info, req.size, req.usr, res)
      }
    }
  })
);