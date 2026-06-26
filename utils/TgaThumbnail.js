import {
    openSync,
    closeSync,
    readSync,
    writeSync,
    statSync,
    O_RDONLY,
    O_WRONLY,
    O_CREAT,
    O_TRUNC,
} from "@zos/fs";

/**
 * Создание миниатюр из ZeppOS TGA без RLE.
 *
 * Поддерживаемые входные и выходные форматы:
 * 1. Indexed TGA Type 1:
 *    - 8 бит на пиксель;
 *    - палитра BGR24 или BGRA32;
 *    - прозрачность сохраняется.
 *
 * 2. True-color TGA Type 2:
 *    - 16 бит на пиксель;
 *    - ZeppOS RGB565 little-endian.
 *
 * Выходной файл сохраняет формат исходного файла.
 * Класс работает с файлами из каталога /data приложения.
 */
export class TgaThumbnail {
    /**
     * @param {Object} options
     * @param {number} options.scale Во сколько раз уменьшать по умолчанию.
     * @param {"nearest"|"box"} options.filter Фильтр по умолчанию.
     */
    constructor(options = {}) {
        const scale =
            typeof options.scale === "number"
                ? options.scale
                : 4;

        const filter = options.filter || "box";

        this._validateScale(scale);
        this._validateFilter(filter);

        this.scale = scale;
        this.filter = filter;
    }

    /**
     * Создать миниатюру.
     *
     * @param {string} sourcePath Путь к исходному TGA в /data.
     * @param {string} targetPath Путь к создаваемому TGA в /data.
     * @param {Object} options
     * @param {number} options.scale Коэффициент уменьшения.
     * @param {number} options.width Точная ширина результата.
     * @param {number} options.height Точная высота результата.
     * @param {"nearest"|"box"} options.filter Фильтр.
     *
     * Если передана только width или только height,
     * вторая сторона вычисляется с сохранением пропорций.
     * Если width и height не переданы, используется scale.
     *
     * @returns {Object} Информация о созданном файле.
     */
    create(sourcePath, targetPath, options = {}) {
        this._validatePaths(sourcePath, targetPath);

        const sourceStat = statSync({
            path: sourcePath,
        });

        if (!sourceStat) {
            throw new Error(
                "Исходный файл не найден: " + sourcePath
            );
        }

        const filter = options.filter || this.filter;
        this._validateFilter(filter);

        let sourceFd = -1;
        let targetFd = -1;

        try {
            sourceFd = openSync({
                path: sourcePath,
                flag: O_RDONLY,
            });

            if (sourceFd < 0) {
                throw new Error(
                    "Не удалось открыть исходный файл: " + sourcePath
                );
            }

            const sourceInfo = this._readSourceInfo(sourceFd);

            this._validateSourceSize(
                sourceStat.size,
                sourceInfo
            );

            const targetInfo = this._calculateTargetInfo(
                sourceInfo,
                options
            );

            const targetPrefix = this._createTargetPrefix(
                sourceInfo,
                targetInfo
            );

            targetFd = openSync({
                path: targetPath,
                flag: O_WRONLY | O_CREAT | O_TRUNC,
            });

            if (targetFd < 0) {
                throw new Error(
                    "Не удалось создать файл: " + targetPath
                );
            }

            this._writeExact(
                targetFd,
                targetPrefix,
                0,
                targetPrefix.byteLength
            );

            if (sourceInfo.format === "indexed8") {
                const palette = this._readPalette(sourceInfo);

                if (filter === "nearest") {
                    this._resizeIndexedNearest({
                        sourceFd,
                        targetFd,
                        sourceInfo,
                        targetInfo,
                    });
                } else {
                    this._resizeIndexedBox({
                        sourceFd,
                        targetFd,
                        sourceInfo,
                        targetInfo,
                        palette,
                    });
                }
            } else if (sourceInfo.format === "rgb565") {
                if (filter === "nearest") {
                    this._resizeRgb565Nearest({
                        sourceFd,
                        targetFd,
                        sourceInfo,
                        targetInfo,
                    });
                } else {
                    this._resizeRgb565Box({
                        sourceFd,
                        targetFd,
                        sourceInfo,
                        targetInfo,
                    });
                }
            } else {
                throw new Error(
                    "Неизвестный внутренний формат: " +
                    sourceInfo.format
                );
            }

            const targetPixelBytes =
                targetInfo.width *
                targetInfo.height *
                sourceInfo.bytesPerPixel;

            return {
                format: sourceInfo.format,
                filter,

                sourceWidth: sourceInfo.width,
                sourceHeight: sourceInfo.height,
                sourcePixelOffset: sourceInfo.pixelOffset,
                sourceFileSize: sourceStat.size,

                targetWidth: targetInfo.width,
                targetHeight: targetInfo.height,
                targetPixelOffset: sourceInfo.pixelOffset,
                targetFileSize:
                    sourceInfo.pixelOffset + targetPixelBytes,

                ignoredTrailingBytes:
                    sourceStat.size - sourceInfo.requiredFileSize,
            };
        } finally {
            if (sourceFd >= 0) {
                closeSync({ fd: sourceFd });
            }

            if (targetFd >= 0) {
                closeSync({ fd: targetFd });
            }
        }
    }

    /**
     * Прочитать заголовок, Image ID и палитру.
     */
    _readSourceInfo(fd) {
        const headerBuffer = new ArrayBuffer(18);

        this._readExact(fd, headerBuffer, 0, 18);

        const header = new Uint8Array(headerBuffer);

        const idLength = header[0];
        const colorMapType = header[1];
        const imageType = header[2];

        const colorMapFirstIndex =
            this._readUint16LE(header, 3);

        const colorMapLength =
            this._readUint16LE(header, 5);

        const colorMapEntryBits = header[7];

        const width =
            this._readUint16LE(header, 12);

        const height =
            this._readUint16LE(header, 14);

        const pixelDepth = header[16];
        const descriptor = header[17];

        if (width <= 0 || height <= 0) {
            throw new Error(
                "Некорректный размер TGA: " +
                width +
                "x" +
                height
            );
        }

        // Биты 6 и 7 означают чередование строк.
        if ((descriptor & 0xc0) !== 0) {
            throw new Error(
                "TGA с чередованием строк не поддерживается"
            );
        }

        let format;
        let bytesPerPixel;
        let colorMapEntryBytes = 0;

        if (
            colorMapType === 1 &&
            imageType === 1 &&
            pixelDepth === 8 &&
            (colorMapEntryBits === 24 ||
                colorMapEntryBits === 32)
        ) {
            format = "indexed8";
            bytesPerPixel = 1;
            colorMapEntryBytes = colorMapEntryBits / 8;

            if (colorMapLength <= 0) {
                throw new Error("В TGA отсутствует палитра");
            }

            if (
                colorMapFirstIndex + colorMapLength >
                256
            ) {
                throw new Error(
                    "Палитра не помещается в 8-битный индекс"
                );
            }
        } else if (
            colorMapType === 0 &&
            imageType === 2 &&
            pixelDepth === 16
        ) {
            format = "rgb565";
            bytesPerPixel = 2;
        } else {
            throw new Error(
                "Неподдерживаемый TGA: " +
                "colorMapType=" +
                colorMapType +
                ", imageType=" +
                imageType +
                ", pixelDepth=" +
                pixelDepth +
                ", colorMapEntryBits=" +
                colorMapEntryBits
            );
        }

        const colorMapOffset = 18 + idLength;

        const colorMapByteLength =
            colorMapType === 1
                ? colorMapLength * colorMapEntryBytes
                : 0;

        const pixelOffset =
            colorMapOffset + colorMapByteLength;

        const prefix = new ArrayBuffer(pixelOffset);

        this._readExact(
            fd,
            prefix,
            0,
            pixelOffset
        );

        const prefixBytes = new Uint8Array(prefix);
        const somhOffset = this._findSOMHOffset(
            prefixBytes,
            idLength
        );

        const pixelByteLength =
            width * height * bytesPerPixel;

        return {
            format,
            prefix,
            prefixBytes,

            idLength,
            colorMapType,
            imageType,
            colorMapOffset,
            colorMapFirstIndex,
            colorMapLength,
            colorMapEntryBits,
            colorMapEntryBytes,
            colorMapByteLength,

            width,
            height,
            pixelDepth,
            bytesPerPixel,
            descriptor,

            somhOffset,
            pixelOffset,
            pixelByteLength,
            requiredFileSize: pixelOffset + pixelByteLength,
        };
    }

    _validateSourceSize(fileSize, sourceInfo) {
        if (fileSize < sourceInfo.requiredFileSize) {
            throw new Error(
                "Повреждённый TGA: ожидалось минимум " +
                sourceInfo.requiredFileSize +
                " байт, получено " +
                fileSize
            );
        }
    }

    _calculateTargetInfo(sourceInfo, options) {
        const widthOption = options.width;
        const heightOption = options.height;

        let width;
        let height;

        const hasWidth =
            typeof widthOption === "number";

        const hasHeight =
            typeof heightOption === "number";

        if (hasWidth || hasHeight) {
            if (hasWidth) {
                this._validateDimension(widthOption, "width");
            }

            if (hasHeight) {
                this._validateDimension(heightOption, "height");
            }

            if (hasWidth && hasHeight) {
                width = widthOption;
                height = heightOption;
            } else if (hasWidth) {
                width = widthOption;
                height = Math.max(
                    1,
                    Math.round(
                        sourceInfo.height *
                        width /
                        sourceInfo.width
                    )
                );
            } else {
                height = heightOption;
                width = Math.max(
                    1,
                    Math.round(
                        sourceInfo.width *
                        height /
                        sourceInfo.height
                    )
                );
            }
        } else {
            const scale =
                typeof options.scale === "number"
                    ? options.scale
                    : this.scale;

            this._validateScale(scale);

            width = Math.max(
                1,
                Math.ceil(sourceInfo.width / scale)
            );

            height = Math.max(
                1,
                Math.ceil(sourceInfo.height / scale)
            );
        }

        this._validateDimension(width, "targetWidth");
        this._validateDimension(height, "targetHeight");

        if (width > sourceInfo.width || height > sourceInfo.height) {
            throw new Error(
                "Размер миниатюры не должен превышать исходный размер " +
                sourceInfo.width +
                "x" +
                sourceInfo.height
            );
        }

        return {
            width,
            height,
        };
    }

    /**
     * Копируем исходный префикс полностью:
     * заголовок + Image ID + палитра.
     */
    _createTargetPrefix(sourceInfo, targetInfo) {
        const result = new ArrayBuffer(
            sourceInfo.pixelOffset
        );

        const bytes = new Uint8Array(result);
        bytes.set(sourceInfo.prefixBytes);

        this._writeUint16LE(bytes, 12, targetInfo.width);
        this._writeUint16LE(bytes, 14, targetInfo.height);

        // В ZeppOS Image ID после SOMH обычно продублирована ширина.
        if (sourceInfo.somhOffset >= 0) {
            const somhWidthOffset =
                sourceInfo.somhOffset + 4;

            if (somhWidthOffset + 1 < bytes.length) {
                this._writeUint16LE(
                    bytes,
                    somhWidthOffset,
                    targetInfo.width
                );
            }
        }

        return result;
    }

    _readPalette(sourceInfo) {
        const length = sourceInfo.colorMapLength;
        const firstIndex = sourceInfo.colorMapFirstIndex;
        const entryBytes = sourceInfo.colorMapEntryBytes;
        const offset = sourceInfo.colorMapOffset;
        const bytes = sourceInfo.prefixBytes;

        const red = new Uint8Array(length);
        const green = new Uint8Array(length);
        const blue = new Uint8Array(length);
        const alpha = new Uint8Array(length);

        // Предумноженные компоненты для корректной работы с прозрачностью.
        const premulRed = new Uint8Array(length);
        const premulGreen = new Uint8Array(length);
        const premulBlue = new Uint8Array(length);

        for (let i = 0; i < length; i++) {
            const entryOffset = offset + i * entryBytes;

            const b = bytes[entryOffset];
            const g = bytes[entryOffset + 1];
            const r = bytes[entryOffset + 2];
            const a =
                entryBytes === 4
                    ? bytes[entryOffset + 3]
                    : 255;

            red[i] = r;
            green[i] = g;
            blue[i] = b;
            alpha[i] = a;

            premulRed[i] = Math.round((r * a) / 255);
            premulGreen[i] = Math.round((g * a) / 255);
            premulBlue[i] = Math.round((b * a) / 255);
        }

        return {
            firstIndex,
            length,
            red,
            green,
            blue,
            alpha,
            premulRed,
            premulGreen,
            premulBlue,
            nearestCache: Object.create(null),
        };
    }

    _resizeIndexedNearest(context) {
        const sourceFd = context.sourceFd;
        const targetFd = context.targetFd;
        const sourceInfo = context.sourceInfo;
        const targetInfo = context.targetInfo;

        const sourceRowBytes = sourceInfo.width;
        const targetRowBytes = targetInfo.width;

        const sourceRow = new ArrayBuffer(sourceRowBytes);
        const sourceBytes = new Uint8Array(sourceRow);

        const targetRow = new ArrayBuffer(targetRowBytes);
        const targetBytes = new Uint8Array(targetRow);

        let loadedSourceY = -1;

        for (let targetY = 0; targetY < targetInfo.height; targetY++) {
            const sourceY = Math.min(
                sourceInfo.height - 1,
                Math.floor(
                    ((targetY + 0.5) * sourceInfo.height) /
                    targetInfo.height
                )
            );

            if (sourceY !== loadedSourceY) {
                this._readExact(
                    sourceFd,
                    sourceRow,
                    sourceInfo.pixelOffset +
                    sourceY * sourceRowBytes,
                    sourceRowBytes
                );

                loadedSourceY = sourceY;
            }

            for (let targetX = 0; targetX < targetInfo.width; targetX++) {
                const sourceX = Math.min(
                    sourceInfo.width - 1,
                    Math.floor(
                        ((targetX + 0.5) * sourceInfo.width) /
                        targetInfo.width
                    )
                );

                targetBytes[targetX] = sourceBytes[sourceX];
            }

            this._writeExact(
                targetFd,
                targetRow,
                sourceInfo.pixelOffset +
                targetY * targetRowBytes,
                targetRowBytes
            );
        }
    }

    _resizeIndexedBox(context) {
        const sourceFd = context.sourceFd;
        const targetFd = context.targetFd;
        const sourceInfo = context.sourceInfo;
        const targetInfo = context.targetInfo;
        const palette = context.palette;

        const sourceRowBytes = sourceInfo.width;
        const targetRowBytes = targetInfo.width;

        const maxRows = Math.min(
            sourceInfo.height,
            Math.ceil(sourceInfo.height / targetInfo.height) + 1
        );

        const sourceBlock = new ArrayBuffer(
            sourceRowBytes * maxRows
        );
        const sourceBytes = new Uint8Array(sourceBlock);

        const targetRow = new ArrayBuffer(targetRowBytes);
        const targetBytes = new Uint8Array(targetRow);

        for (let targetY = 0; targetY < targetInfo.height; targetY++) {
            const sourceYStart = Math.floor(
                (targetY * sourceInfo.height) /
                targetInfo.height
            );

            const sourceYEnd = Math.min(
                sourceInfo.height,
                Math.ceil(
                    ((targetY + 1) * sourceInfo.height) /
                    targetInfo.height
                )
            );

            const rowsInBlock = Math.max(
                1,
                sourceYEnd - sourceYStart
            );

            const blockByteLength =
                rowsInBlock * sourceRowBytes;

            this._readExact(
                sourceFd,
                sourceBlock,
                sourceInfo.pixelOffset +
                sourceYStart * sourceRowBytes,
                blockByteLength
            );

            for (let targetX = 0; targetX < targetInfo.width; targetX++) {
                const sourceXStart = Math.floor(
                    (targetX * sourceInfo.width) /
                    targetInfo.width
                );

                const sourceXEnd = Math.min(
                    sourceInfo.width,
                    Math.ceil(
                        ((targetX + 1) * sourceInfo.width) /
                        targetInfo.width
                    )
                );

                let sumPremulRedTimes255 = 0;
                let sumPremulGreenTimes255 = 0;
                let sumPremulBlueTimes255 = 0;
                let sumAlpha = 0;
                let count = 0;

                for (let blockY = 0; blockY < rowsInBlock; blockY++) {
                    let sourceOffset =
                        blockY * sourceRowBytes + sourceXStart;

                    for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX++) {
                        const colorIndex = sourceBytes[sourceOffset];
                        const paletteIndex =
                            colorIndex - palette.firstIndex;

                        if (
                            paletteIndex < 0 ||
                            paletteIndex >= palette.length
                        ) {
                            throw new Error(
                                "Индекс цвета выходит за границы палитры: " +
                                colorIndex
                            );
                        }

                        const a = palette.alpha[paletteIndex];

                        // r*a, g*a, b*a: диапазон 0..65025.
                        sumPremulRedTimes255 +=
                            palette.red[paletteIndex] * a;
                        sumPremulGreenTimes255 +=
                            palette.green[paletteIndex] * a;
                        sumPremulBlueTimes255 +=
                            palette.blue[paletteIndex] * a;
                        sumAlpha += a;
                        count++;
                        sourceOffset++;
                    }
                }

                const averageAlpha = Math.round(sumAlpha / count);

                const averagePremulRed = Math.round(
                    sumPremulRedTimes255 / (count * 255)
                );

                const averagePremulGreen = Math.round(
                    sumPremulGreenTimes255 / (count * 255)
                );

                const averagePremulBlue = Math.round(
                    sumPremulBlueTimes255 / (count * 255)
                );

                targetBytes[targetX] = this._findNearestPaletteIndex(
                    palette,
                    averagePremulRed,
                    averagePremulGreen,
                    averagePremulBlue,
                    averageAlpha
                );
            }

            this._writeExact(
                targetFd,
                targetRow,
                sourceInfo.pixelOffset +
                targetY * targetRowBytes,
                targetRowBytes
            );
        }
    }

    _findNearestPaletteIndex(
        palette,
        targetPremulRed,
        targetPremulGreen,
        targetPremulBlue,
        targetAlpha
    ) {
        const cacheKey =
            targetPremulRed +
            "," +
            targetPremulGreen +
            "," +
            targetPremulBlue +
            "," +
            targetAlpha;

        const cached = palette.nearestCache[cacheKey];

        if (typeof cached === "number") {
            return cached;
        }

        let bestPaletteIndex = 0;
        let bestDistance = Infinity;

        for (let i = 0; i < palette.length; i++) {
            const redDelta =
                palette.premulRed[i] - targetPremulRed;
            const greenDelta =
                palette.premulGreen[i] - targetPremulGreen;
            const blueDelta =
                palette.premulBlue[i] - targetPremulBlue;
            const alphaDelta =
                palette.alpha[i] - targetAlpha;

            const distance =
                redDelta * redDelta +
                greenDelta * greenDelta +
                blueDelta * blueDelta +
                alphaDelta * alphaDelta * 2;

            if (distance < bestDistance) {
                bestDistance = distance;
                bestPaletteIndex = i;

                if (distance === 0) {
                    break;
                }
            }
        }

        const colorIndex =
            palette.firstIndex + bestPaletteIndex;

        palette.nearestCache[cacheKey] = colorIndex;
        return colorIndex;
    }

    _resizeRgb565Nearest(context) {
        const sourceFd = context.sourceFd;
        const targetFd = context.targetFd;
        const sourceInfo = context.sourceInfo;
        const targetInfo = context.targetInfo;

        const sourceRowBytes = sourceInfo.width * 2;
        const targetRowBytes = targetInfo.width * 2;

        const sourceRow = new ArrayBuffer(sourceRowBytes);
        const sourceBytes = new Uint8Array(sourceRow);

        const targetRow = new ArrayBuffer(targetRowBytes);
        const targetBytes = new Uint8Array(targetRow);

        let loadedSourceY = -1;

        for (let targetY = 0; targetY < targetInfo.height; targetY++) {
            const sourceY = Math.min(
                sourceInfo.height - 1,
                Math.floor(
                    ((targetY + 0.5) * sourceInfo.height) /
                    targetInfo.height
                )
            );

            if (sourceY !== loadedSourceY) {
                this._readExact(
                    sourceFd,
                    sourceRow,
                    sourceInfo.pixelOffset +
                    sourceY * sourceRowBytes,
                    sourceRowBytes
                );

                loadedSourceY = sourceY;
            }

            for (let targetX = 0; targetX < targetInfo.width; targetX++) {
                const sourceX = Math.min(
                    sourceInfo.width - 1,
                    Math.floor(
                        ((targetX + 0.5) * sourceInfo.width) /
                        targetInfo.width
                    )
                );

                const sourceOffset = sourceX * 2;
                const targetOffset = targetX * 2;

                targetBytes[targetOffset] = sourceBytes[sourceOffset];
                targetBytes[targetOffset + 1] =
                    sourceBytes[sourceOffset + 1];
            }

            this._writeExact(
                targetFd,
                targetRow,
                sourceInfo.pixelOffset +
                targetY * targetRowBytes,
                targetRowBytes
            );
        }
    }

    _resizeRgb565Box(context) {
        const sourceFd = context.sourceFd;
        const targetFd = context.targetFd;
        const sourceInfo = context.sourceInfo;
        const targetInfo = context.targetInfo;

        const sourceRowBytes = sourceInfo.width * 2;
        const targetRowBytes = targetInfo.width * 2;

        const maxRows = Math.min(
            sourceInfo.height,
            Math.ceil(sourceInfo.height / targetInfo.height) + 1
        );

        const sourceBlock = new ArrayBuffer(
            sourceRowBytes * maxRows
        );
        const sourceBytes = new Uint8Array(sourceBlock);

        const targetRow = new ArrayBuffer(targetRowBytes);
        const targetBytes = new Uint8Array(targetRow);

        for (let targetY = 0; targetY < targetInfo.height; targetY++) {
            const sourceYStart = Math.floor(
                (targetY * sourceInfo.height) /
                targetInfo.height
            );

            const sourceYEnd = Math.min(
                sourceInfo.height,
                Math.ceil(
                    ((targetY + 1) * sourceInfo.height) /
                    targetInfo.height
                )
            );

            const rowsInBlock = Math.max(
                1,
                sourceYEnd - sourceYStart
            );

            const blockByteLength =
                rowsInBlock * sourceRowBytes;

            this._readExact(
                sourceFd,
                sourceBlock,
                sourceInfo.pixelOffset +
                sourceYStart * sourceRowBytes,
                blockByteLength
            );

            for (let targetX = 0; targetX < targetInfo.width; targetX++) {
                const sourceXStart = Math.floor(
                    (targetX * sourceInfo.width) /
                    targetInfo.width
                );

                const sourceXEnd = Math.min(
                    sourceInfo.width,
                    Math.ceil(
                        ((targetX + 1) * sourceInfo.width) /
                        targetInfo.width
                    )
                );

                let redSum = 0;
                let greenSum = 0;
                let blueSum = 0;
                let count = 0;

                for (let blockY = 0; blockY < rowsInBlock; blockY++) {
                    let sourceOffset =
                        blockY * sourceRowBytes +
                        sourceXStart * 2;

                    for (let sourceX = sourceXStart; sourceX < sourceXEnd; sourceX++) {
                        const pixel =
                            sourceBytes[sourceOffset] |
                            (sourceBytes[sourceOffset + 1] << 8);

                        redSum += (pixel >>> 11) & 0x1f;
                        greenSum += (pixel >>> 5) & 0x3f;
                        blueSum += pixel & 0x1f;
                        count++;
                        sourceOffset += 2;
                    }
                }

                const red = Math.round(redSum / count);
                const green = Math.round(greenSum / count);
                const blue = Math.round(blueSum / count);

                const pixel =
                    (red << 11) |
                    (green << 5) |
                    blue;

                const targetOffset = targetX * 2;
                targetBytes[targetOffset] = pixel & 0xff;
                targetBytes[targetOffset + 1] = pixel >>> 8;
            }

            this._writeExact(
                targetFd,
                targetRow,
                sourceInfo.pixelOffset +
                targetY * targetRowBytes,
                targetRowBytes
            );
        }
    }

    _findSOMHOffset(prefixBytes, idLength) {
        const start = 18;
        const end = Math.min(
            prefixBytes.length - 4,
            18 + idLength - 4
        );

        for (let i = start; i <= end; i++) {
            if (
                prefixBytes[i] === 0x53 &&
                prefixBytes[i + 1] === 0x4f &&
                prefixBytes[i + 2] === 0x4d &&
                prefixBytes[i + 3] === 0x48
            ) {
                return i;
            }
        }

        return -1;
    }

    _readExact(fd, buffer, filePosition, length) {
        if (length === 0) {
            return;
        }

        if (length > buffer.byteLength) {
            throw new Error(
                "Буфер меньше запрошенного количества данных"
            );
        }

        let totalRead = 0;

        while (totalRead < length) {
            const readResult = readSync({
                fd,
                buffer,
                options: {
                    offset: totalRead,
                    length: length - totalRead,
                    position: filePosition + totalRead,
                },
            });

            if (readResult <= 0) {
                throw new Error(
                    "Не удалось прочитать TGA с позиции " +
                    (filePosition + totalRead)
                );
            }

            totalRead += readResult;
        }
    }

    _writeExact(fd, buffer, filePosition, length) {
        if (length === 0) {
            return;
        }

        if (length > buffer.byteLength) {
            throw new Error(
                "Буфер меньше записываемого количества данных"
            );
        }

        let totalWritten = 0;

        while (totalWritten < length) {
            const writeResult = writeSync({
                fd,
                buffer,
                options: {
                    offset: totalWritten,
                    length: length - totalWritten,
                    position: filePosition + totalWritten,
                },
            });

            /*
             * В разных версиях документации ZeppOS встречаются
             * две трактовки результата writeSync:
             * - количество записанных байт;
             * - 0 как успешное завершение.
             *
             * При 0 считаем, что весь запрошенный участок записан.
             */
            if (writeResult === 0) {
                return;
            }

            if (writeResult < 0) {
                throw new Error(
                    "Не удалось записать TGA с позиции " +
                    (filePosition + totalWritten)
                );
            }

            totalWritten += writeResult;
        }
    }

    _readUint16LE(bytes, offset) {
        return bytes[offset] | (bytes[offset + 1] << 8);
    }

    _writeUint16LE(bytes, offset, value) {
        bytes[offset] = value & 0xff;
        bytes[offset + 1] = (value >>> 8) & 0xff;
    }

    _validatePaths(sourcePath, targetPath) {
        if (
            typeof sourcePath !== "string" ||
            sourcePath.length === 0
        ) {
            throw new Error("Не указан sourcePath");
        }

        if (
            typeof targetPath !== "string" ||
            targetPath.length === 0
        ) {
            throw new Error("Не указан targetPath");
        }

        if (sourcePath === targetPath) {
            throw new Error(
                "sourcePath и targetPath должны отличаться"
            );
        }
    }

    _validateScale(scale) {
        if (
            !Number.isInteger(scale) ||
            scale < 2
        ) {
            throw new Error(
                "scale должен быть целым числом не меньше 2"
            );
        }
    }

    _validateDimension(value, name) {
        if (
            !Number.isInteger(value) ||
            value < 1 ||
            value > 0xffff
        ) {
            throw new Error(
                name +
                " должен быть целым числом от 1 до 65535"
            );
        }
    }

    _validateFilter(filter) {
        if (filter !== "nearest" && filter !== "box") {
            throw new Error(
                "filter должен быть nearest или box"
            );
        }
    }
}

export default TgaThumbnail;
