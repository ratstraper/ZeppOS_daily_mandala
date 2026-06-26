import { openSync, readSync, writeSync, closeSync, rmSync, statSync, O_RDONLY, O_WRONLY, O_CREAT } from '@zos/fs';

export class HardcoreResizer {
    static createThumb(sourcePath, destPath, scale = 8) {
        try { rmSync({ path: destPath }); } catch (e) { }

        const fdSrc = openSync({ path: sourcePath, flag: O_RDONLY });
        const fdDst = openSync({ path: destPath, flag: O_WRONLY | O_CREAT });

        if (fdSrc === undefined || fdDst === undefined) return false;

        try {
            // ==========================================
            // 1. ЧТЕНИЕ И ЗАПИСЬ TGA ЗАГОЛОВОКА (18 байт)
            // ==========================================

            // 1. ЧИТАЕМ ЗАГОЛОВОК TGA (18 байт)
            const headerBuf = new ArrayBuffer(18);
            readSync({ fd: fdSrc, buffer: headerBuf });
            const headerView = new Uint8Array(headerBuf);
            const dataView = new DataView(headerBuf);

            const idLength = headerView[0];         // Длина блока SOMH
            const colorMapType = headerView[1];
            const imageType = headerView[2];        // 1 = Indexed, 2 = RGB
            const colorMapFirstIndex = headerView[3] | (headerView[4] << 8);
            const cmLength = headerView[5] | (headerView[6] << 8);
            const cmEntrySize = headerView[7];      // Бит на цвет (32)
            const header8 = headerView[8];
            const header9 = headerView[9];
            const header10 = headerView[10];
            const header11 = headerView[11];

            const width = dataView.getUint16(12, true);  // Оригинальная ширина
            const height = dataView.getUint16(14, true); // Оригинальная высота
            const bpp = headerView[16];                  // Бит на пиксель
            const bytesPerPixel = Math.floor(bpp / 8) || 1;

            const destWidth = Math.floor(width / scale);
            const destHeight = Math.floor(height / scale);

            const paletteOffset = 18 + idLength;
            const paletteSize = (colorMapType === 1) ? cmLength * (cmEntrySize / 8) : 0;
            const pixelDataOffset = paletteOffset + paletteSize;

            let sourceStride = width * bytesPerPixel; // Фолбэк по умолчанию (960)

            // Модифицируем заголовок для миниатюры
            dataView.setUint16(12, destWidth, true);
            dataView.setUint16(14, destHeight, true);
            // Записываем первые 18 байт в новый файл
            writeSync({ fd: fdDst, buffer: headerBuf });

            // ==========================================
            // 2. ЧТЕНИЕ И ПАТЧИНГ БЛОКА SOMH
            // ==========================================
            console.log(`idLength: ${idLength}, 
                colorMapType: ${colorMapType}, 
                imageType: ${imageType},
                colorMapFirstIndex: ${colorMapFirstIndex}, 
                cmLength: ${cmLength}, 
                cmEntrySize: ${cmEntrySize},
                header8: ${header8}, 
                header9: ${header9}, 
                header10: ${header10}, 
                header11: ${header11},
                width: ${width}, height: ${height}, 
                sourceStride: ${sourceStride},
                bpp: ${bpp},
                paletteOffset: ${paletteOffset}, 
                paletteSize: ${paletteSize}, 
                pixelDataOffset: ${pixelDataOffset},
                destWidth: ${destWidth}, destHeight: ${destHeight},
                scale: ${scale}
                `);

            if (idLength > 0) {
                const idBuf = new ArrayBuffer(idLength);
                readSync({ fd: fdSrc, buffer: idBuf }); // Читаем SOMH
                const idDataView = new DataView(idBuf);
                const idUint8 = new Uint8Array(idBuf);

                // Проверяем подпись SOMH ('S' = 0x53, 'O' = 0x4F)
                if (idUint8[0] === 0x53 && idUint8[1] === 0x4F) {
                    const somhStride = idDataView.getUint16(8, true);
                    if (somhStride > sourceStride) {
                        sourceStride = somhStride; // Берем Stride с учетом полей!
                    }

                    // Патчим новые размеры внутри SOMH
                    const destStride = destWidth * bytesPerPixel;
                    const origSize = width * height * bytesPerPixel;
                    const destSize = destWidth * destHeight * bytesPerPixel;

                    if (idDataView.getUint16(4, true) === width) idDataView.setUint16(4, destWidth, true);
                    if (idDataView.getUint16(6, true) === height) idDataView.setUint16(6, destHeight, true);
                    if (idDataView.getUint16(8, true) === width) idDataView.setUint16(8, destStride, true);

                    for (let i = 4; i <= idLength - 4; i++) {
                        if (idDataView.getUint32(i, true) === origSize) {
                            idDataView.setUint32(i, destSize, true);
                        }
                    }
                }
                // Записываем исправленный SOMH в новый файл
                writeSync({ fd: fdDst, buffer: idBuf });
            }

            // ==========================================
            // 3. КОПИРОВАНИЕ ПАЛИТРЫ (Жестко 1024 байта)
            // ==========================================
            // const palBuf = new ArrayBuffer(paletteSize);
            // readSync({ fd: fdSrc, buffer: palBuf });
            // writeSync({ fd: fdDst, buffer: palBuf });
            // for (i = 0; i < 32; i++) {
            //     const pos = i * (1024 / 32);
            //     let pallete = new Uint8Array(palBuf, pos, 1024 / 32);
            //     console.log("Палитра:", Array.from(pallete));
            // }

            // ==========================================
            // 4. ОПТИМИЗИРОВАННОЕ КОПИРОВАНИЕ ПИКСЕЛЕЙ
            // ==========================================
            const stat = statSync({ path: sourcePath }); // Используем импортированный statSync
            const fullSrcSize = stat.size - pixelDataOffset;
            const fullDstSize = destWidth * destHeight * bytesPerPixel;
            sourceStride = (fullSrcSize / height);
            console.log(`fullSrcSize: ${fullSrcSize}, 
                fullDstSize: ${fullDstSize},
                sourceStride: ${sourceStride}`);

            const fullSrcBuf = new ArrayBuffer(fullSrcSize);
            const fullSrcArr = new Uint8Array(fullSrcBuf);

            const fullDstBuf = new ArrayBuffer(fullDstSize);
            const fullDstArr = new Uint8Array(fullDstBuf);

            // Читаем матрицу пикселей 
            readSync({ fd: fdSrc, buffer: fullSrcBuf });

            let targetPosition = 0;

            for (let destY = 0; destY < destHeight; destY++) {
                const sourceY = destY * scale;
                // Смещение начала строки с учетом Padding-полей
                const sourceRowByteOffset = sourceY * (sourceStride);

                for (let destX = 0; destX < destWidth; destX++) {
                    const sourceX = (destX + 1) * scale;
                    const sourcePixelByteOffset = sourceRowByteOffset + (sourceX * bytesPerPixel);

                    // Копируем байты пикселя
                    let a = fullSrcArr[sourcePixelByteOffset];
                    let b = fullSrcArr[sourcePixelByteOffset + 1];
                    // if (((a & 0x0F) < 4) && ((a & 0xF0) < 4) && ((b & 0x0F) < 4) .) {
                    //     a = 0;
                    //     b = 0;
                    // }
                    fullDstArr[targetPosition] = a;
                    targetPosition++;
                    fullDstArr[targetPosition] = b;
                    targetPosition++;
                    // for (let b = 0; b < bytesPerPixel; b++) {
                    //     fullDstArr[targetPosition] = fullSrcArr[sourcePixelByteOffset + b];
                    //     targetPosition++;
                    // }
                }
            }

            // Записываем матрицу пикселей в конец файла
            writeSync({ fd: fdDst, buffer: fullDstBuf });

            console.log(`Успех! Оригинал: ${width}x${height}, Миниатюра: ${destWidth}x${destHeight}`);
            return true;

        } catch (err) {
            console.log("Ошибка обработки бинарника:", err);
            return false;
        } finally {
            closeSync({ fd: fdSrc });
            closeSync({ fd: fdDst });
        }
    }
}