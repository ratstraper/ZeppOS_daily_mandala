import { BaseSideService } from "@zeppos/zml/base-side";

const logger = Logger.getLogger('mandala-day')
const WEBSITE_URL = "https://mandala.garageno9.site"
const PRACTICE_SHOW = 1;

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
async function openMandala(request, res) {
  logger.log('openMandala:', request);
  const response = await fetch({
    url: `${WEBSITE_URL}/api/watch/repeat/${request.day}/${request.size}`,
    method: 'GET',
    headers: {
      'User-Agent': `${request.info}`,
      'X-App-Version': `${request.version}`,
      "X-User": `${request.age}/${request.gender}/${request.region}/${request.usr}`,
    }
  });
  res(null, response.body);
}

function getMandala(request, res) {

  const filename = request.type === PRACTICE_SHOW ? 'mandaladay.png' : `${request.day}.png`;
  logger.log('Starting file download...', filename);
  const downloadTask = network.downloader.downloadFile({
    url: `${WEBSITE_URL}/api/watch/${request.day}/${request.size}`,
    timeout: 60000,
    filePath: filename,
    headers: {
      'User-Agent': `${request.info}`,
      'Accept': 'image/png,image/jpeg,*/*',
      'X-App-Version': `${request.version}`,
      "X-User": `${request.age}/${request.gender}/${request.region}/${request.usr}`
    }
  });

  downloadTask.onSuccess = (event) => {
    logger.log('The file has been successfully downloaded by the phone');

    image.convert({
      filePath: event.filePath,
      //сделать для практики файл с одним и тем же именем, чтобы не забить память прошлыми днями,
      //для коллекции оставить как есть - имя файла - день/id_token
      // targetFilePath: 'mandala.png'
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

async function getNews(request, res) {
  logger.log('getNews:', request);

  const response = await fetch({
    url: `${WEBSITE_URL}/api/watch/zepp/news/${request.time}/${request.region}`,
    method: 'GET',
    headers: {
      'User-Agent': `${request.info}`,
      'X-App-Version': `${request.version}`,
      "X-User": `${request.age}/${request.gender}/${request.region}/${request.usr}`,
    }
  });
  const data = typeof response.body === 'string' ? JSON.parse(response.body) : response.body
  res(null, data);
}

// ── Привязка часов к кошельку ─────────────────────────────────────
async function linkApi(path, request, extraBody) {
  logger.log('linkApi:', path, request, extraBody);

  const response = await fetch({
    url: `${WEBSITE_URL}${path}`,
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'User-Agent': `${request.info}`,
      'X-App-Version': `${request.version}`,
      'X-User': `${request.age}/${request.gender}/${request.region}/${request.usr}`
    },
    // deviceId = usr: только в теле POST, в URL — никогда
    body: JSON.stringify({ deviceId: request.usr, ...extraBody })
  });
  return typeof response.body === 'string' ? JSON.parse(response.body) : response.body;
}

async function getCollection(request, res) {
  // res(null, {result: "NO_LINK"});
  // res(null, { result: "Ok", collection: [{ "day": "15011939", "name": "Ivan", "id": 15011939 }, { "day": "11111111", "name": "Thering", "id": 11111111 }, { "day": "31052000", "name": "End of spring", "id": 31052000 }, { "day": "26081910", "name": "Mary Teresa Bojaxhiu", "id": 26081910 }] });
  try { 
    logger.log('getCollection:', request,);
    res(null, await linkApi('/api/watch/collection', request, {})); 
  }
  catch (err) { logger.log('linkStatus error:', err); res(null, { status: 'ERROR', error: 'network' }); }
}

async function linkStart(request, res) {
  try {
    const data = await linkApi('/device/link-start', request, {});
    if (data && data.token) data.qr = `${WEBSITE_URL}/link/add/${data.token}`;
    res(null, data);
  } catch (err) {
    logger.log('linkStart error:', err);
    res(null, { status: 'ERROR', error: 'network' });
  }
}

async function linkStatus(request, res) {
  try { 
    logger.log('linkStatus:', request,);
    res(null, await linkApi('/device/link-status', request, {})); 
  }
  catch (err) { logger.log('linkStatus error:', err); res(null, { status: 'ERROR', error: 'network' }); }
}


async function linkConfirm(request, res) {
  try { res(null, await linkApi('/device/link-confirm', request, { wallet: request.wallet })); }
  catch (err) { logger.log('linkConfirm error:', err); res(null, { status: 'ERROR', error: 'network' }); }
}

async function linkReject(request, res) {
  try { res(null, await linkApi('/device/link-reject', request, {})); }
  catch (err) { logger.log('linkReject error:', err); res(null, { status: 'ERROR', error: 'network' }); }
}


AppSideService(
  BaseSideService({
    onInit() {
      logger.log('Side Service successfully started!');
    },
    onDestroy() { },
    onRequest(req, res) {
      logger.log("===============> Received method:", req.method);
      if (req.method === "GET_MANDALA") {
        getMandala(req.request, res);
        // fetchEmulatorData(req.day, req.info, req.size, res);
      } else if (req.method === "OPEN_MANDALA") {
        openMandala(req.request, res)
      } else if (req.method === "GET_COLLECTION") {
        getCollection(req.request, res);
      } else if (req.method === "GET_NEWS") {
        getNews(req.request, res);
      } else if (req.method === "LINK_START") {
        linkStart(req.request, res);
      } else if (req.method === "LINK_STATUS") {
        linkStatus(req.request, res);
      } else if (req.method === "LINK_CONFIRM") {
        linkConfirm(req.request, res);
      } else if (req.method === "LINK_REJECT") {
        linkReject(req.request, res);
      }
    }
  })
);