import { openSync, readSync, writeSync, closeSync, rmSync, statSync, O_RDONLY, O_WRONLY, O_CREAT } from '@zos/fs';

export class ImageResizer {

    /**
     * Уменьшает TGA изображение ровно в scale раз (например, в 10 раз)
     * @param {string} sourcePath - Путь к исходному TGA файлу
     * @param {string} destPath - Путь для сохранения миниатюры
     * @param {number} scale - Во сколько раз уменьшить (по умолчанию 10)
     */
    static createThumb(sourcePath, destPath, scale = 10) {
        // 1. Удаляем старый файл миниатюры, если он уже существует
        try {
            if (statSync({ path: destPath })) {
                rmSync({ path: destPath });
            }
        } catch (e) { } // Игнорируем ошибку, если файла еще нет

        // 2. Открываем файлы для чтения и записи
        const fdSrc = openSync({ path: sourcePath, flag: O_RDONLY });
        const fdDst = openSync({ path: destPath, flag: O_WRONLY | O_CREAT });

        if (fdSrc === undefined || fdDst === undefined) {
            console.log("Ошибка: Не удалось открыть файлы для ресайза.");
            return false;
        }

        try {
            // 3. Читаем заголовок TGA (18 байт)
            const headerBuf = new ArrayBuffer(18);
            readSync({ fd: fdSrc, buffer: headerBuf });
            const headerView = new DataView(headerBuf);

            // В структуре TGA нулевой байт хранит длину идентификатора (обычно 0)
            const idLength = headerView.getUint8(0);

            // Разбираем размеры (Little Endian)
            const width = headerView.getUint16(12, true);
            const height = headerView.getUint16(14, true);
            const bpp = headerView.getUint8(16); // Bits Per Pixel (24 или 32)
            console.log(`bpp: ${bpp}, width: ${width}, height: ${height}`);
            const bytesPerPixel = Math.floor(bpp / 8);
            if (bytesPerPixel !== 2 && bytesPerPixel !== 3 && bytesPerPixel !== 4) {
                console.log(`Ошибка: Неподдерживаемый формат TGA (${bpp} bpp)`);
                return false;
            }

            // Вычисляем новые размеры
            const newWidth = Math.floor(width / scale);
            const newHeight = Math.floor(height / scale);
            console.log(`newWidth: ${newWidth}, newHeight: ${newHeight}`);
            // 4. Модифицируем заголовок для миниатюры и записываем его
            headerView.setUint16(12, newWidth, true);
            headerView.setUint16(14, newHeight, true);
            writeSync({ fd: fdDst, buffer: headerBuf });

            // Если есть дополнительный блок идентификатора, нам нужно его пропустить (крайне редко, но бывает)
            const dataOffset = 18 + idLength;

            // 5. Выделяем память только для ОДНОЙ исходной строки и ОДНОЙ уменьшенной
            const rowBytesSrc = width * bytesPerPixel;
            const rowBufSrc = new ArrayBuffer(rowBytesSrc);
            const rowBytesSrcUint8 = new Uint8Array(rowBufSrc);

            const rowBytesDst = newWidth * bytesPerPixel;
            const rowBufDst = new ArrayBuffer(rowBytesDst);
            const rowBytesDstUint8 = new Uint8Array(rowBufDst);

            // 6. Основной цикл ресайза (читаем только каждую 10-ю строку)
            for (let y = 0; y < newHeight; y++) {
                // Вычисляем позицию байта, где начинается нужная нам строка в исходном файле
                const filePos = dataOffset + ((y * scale * bytesPerPixel) * rowBytesSrc);

                // Читаем ОДНУ нужную строку целиком (игнорируя предыдущие 9)
                readSync({
                    fd: fdSrc,
                    buffer: rowBufSrc,
                    position: filePos
                });

                // Пробегаемся по пикселям этой строки и забираем каждый 10-й
                for (let x = 0; x < newWidth; x++) {
                    const srcPixelOffset = (x * scale) * bytesPerPixel;
                    const dstPixelOffset = x * bytesPerPixel;

                    // Копируем байты одного пикселя (R, G, B и A если есть)
                    for (let b = 0; b < bytesPerPixel; b++) {
                        rowBytesDstUint8[dstPixelOffset + b] = rowBytesSrcUint8[srcPixelOffset + b];
                    }
                }

                // Записываем сформированную уменьшенную строку в новый файл
                // (position не указываем, запись идет последовательно)
                writeSync({
                    fd: fdDst,
                    buffer: rowBufDst
                });
            }

            console.log(`Ресайз успешен! Новый размер: ${newWidth}x${newHeight}`);
            return true;

        } catch (error) {
            console.log("Ошибка во время масштабирования:", error);
            return false;
        } finally {
            // 7. Обязательно закрываем файловые дескрипторы, иначе будет утечка памяти
            closeSync({ fd: fdSrc });
            closeSync({ fd: fdDst });
        }
    }
}