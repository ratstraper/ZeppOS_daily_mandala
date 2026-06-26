import {
    openSync,
    closeSync,
    readSync,
    writeSync,
    readFileSync,
    writeFileSync,
    statSync,
    O_RDONLY,
    O_WRONLY,
    O_CREAT,
    O_TRUNC,
} from "@zos/fs";

/**
 * Быстрое создание миниатюры из индексированного ZeppOS TGA.
 *
 * Поддерживаемый формат:
 * - TGA image type 1, без RLE;
 * - 8 бит на пиксель: каждый байт — индекс палитры;
 * - палитра 256 × BGRA32;
 * - Image ID длиной 46 байт, начинается с SOMH;
 * - начало пиксельных индексов — смещение 1088.
 *
 * Алгоритм:
 * - копирует заголовок, Image ID и палитру без изменений;
 * - обновляет ширину и высоту;
 * - берёт каждый scale-й пиксель;
 * - берёт каждую scale-ю строку.
 */
export class IndexedTgaThumbnail {
    constructor({
        scale = 8,
    } = {}) {
        this._validateScale(scale);

        this.scale = scale;
    }

    /**
     * Создать миниатюру из файла.
     *
     * Файлы находятся в каталоге /data приложения.
     *
     * @param {string} sourcePath
     * Путь к исходному TGA.
     *
     * @param {string} targetPath
     * Путь для сохранения миниатюры.
     *
     * @param {{scale?: number}} options
     *
     * @returns {{
     *   sourceWidth: number,
     *   sourceHeight: number,
     *   targetWidth: number,
     *   targetHeight: number,
     *   scale: number,
     *   sourcePixelOffset: number,
     *   targetFileSize: number
     * }}
     */
    create(
        sourcePath,
        targetPath,
        options = {}
    ) {
        if (
            !sourcePath ||
            typeof sourcePath !== "string"
        ) {
            throw new Error(
                "Не указан sourcePath"
            );
        }

        if (
            !targetPath ||
            typeof targetPath !== "string"
        ) {
            throw new Error(
                "Не указан targetPath"
            );
        }

        if (
            sourcePath === targetPath
        ) {
            throw new Error(
                "Исходный файл и миниатюра должны иметь разные пути"
            );
        }

        const scale =
            options.scale === undefined
                ? this.scale
                : options.scale;

        this._validateScale(scale);

        const sourceBuffer =
            readFileSync({
                path: sourcePath,
            });

        if (!sourceBuffer) {
            throw new Error(
                `Не удалось прочитать TGA: ${sourcePath}`
            );
        }

        const result =
            this.resizeBuffer(
                sourceBuffer,
                scale
            );

        writeFileSync({
            path: targetPath,
            data: result.buffer,
        });

        return {
            sourceWidth:
                result.sourceWidth,

            sourceHeight:
                result.sourceHeight,

            targetWidth:
                result.targetWidth,

            targetHeight:
                result.targetHeight,

            scale,

            sourcePixelOffset:
                result.pixelOffset,

            targetFileSize:
                result.buffer.byteLength,
        };
    }

    /**
     * Создать миниатюру из ArrayBuffer.
     *
     * @param {ArrayBuffer} sourceBuffer
     * @param {number} scale
     *
     * @returns {{
     *   buffer: ArrayBuffer,
     *   sourceWidth: number,
     *   sourceHeight: number,
     *   targetWidth: number,
     *   targetHeight: number,
     *   pixelOffset: number
     * }}
     */
    resizeBuffer(
        sourceBuffer,
        scale = this.scale
    ) {
        this._validateScale(scale);

        if (
            !sourceBuffer ||
            typeof sourceBuffer.byteLength !==
            "number"
        ) {
            throw new Error(
                "sourceBuffer должен быть ArrayBuffer"
            );
        }

        const source =
            new Uint8Array(
                sourceBuffer
            );

        const sourceInfo =
            this._readAndValidateHeader(
                source
            );

        /*
         * При последовательности:
         *
         * 0, scale, scale * 2...
         *
         * итоговый размер равен:
         *
         * ceil(sourceSize / scale)
         */
        const targetWidth =
            Math.ceil(
                sourceInfo.width /
                scale
            );

        const targetHeight =
            Math.ceil(
                sourceInfo.height /
                scale
            );

        const targetPixelCount =
            targetWidth *
            targetHeight;

        /*
         * В результате сохраняются:
         *
         * 0–17:
         * стандартный заголовок TGA;
         *
         * 18–63:
         * Image ID ZeppOS;
         *
         * 64–1087:
         * палитра 256 × 4 байта;
         *
         * 1088 и далее:
         * уменьшенный массив индексов.
         */
        const targetBuffer =
            new ArrayBuffer(
                sourceInfo.pixelOffset +
                targetPixelCount
            );

        const target =
            new Uint8Array(
                targetBuffer
            );

        /*
         * Копируем заголовок,
         * Image ID и палитру.
         */
        target.set(
            source.subarray(
                0,
                sourceInfo.pixelOffset
            ),
            0
        );

        /*
         * Стандартный TGA:
         *
         * байты 12–13 — ширина;
         * байты 14–15 — высота.
         */
        this._writeUint16LE(
            target,
            12,
            targetWidth
        );

        this._writeUint16LE(
            target,
            14,
            targetHeight
        );

        /*
         * ZeppOS SOMH:
         *
         * в байтах 22–23
         * повторяется ширина изображения.
         */
        this._writeUint16LE(
            target,
            22,
            targetWidth
        );

        /*
         * Каждый байт пиксельных данных —
         * индекс цвета в палитре.
         *
         * Для исходного изображения 480 × 480
         * и scale = 8 берутся:
         *
         * строки:
         * 0, 8, 16, 24 ... 472;
         *
         * пиксели в каждой строке:
         * 0, 8, 16, 24 ... 472.
         *
         * Результат:
         * 60 × 60.
         */
        let targetPosition =
            sourceInfo.pixelOffset;

        for (
            let sourceY = 0;
            sourceY < sourceInfo.height;
            sourceY += scale
        ) {
            /*
             * Позиция начала нужной строки
             * в исходном файле.
             *
             * Каждый исходный пиксель
             * занимает один байт.
             */
            const sourceRowPosition =
                sourceInfo.pixelOffset +
                sourceY *
                sourceInfo.width;

            for (
                let sourceX = 0;
                sourceX < sourceInfo.width;
                sourceX += scale
            ) {
                /*
                 * Копируем индекс цвета
                 * из исходной палитры.
                 */
                target[targetPosition] =
                    source[
                    sourceRowPosition +
                    sourceX
                    ];

                targetPosition++;
            }
        }

        if (
            targetPosition !==
            target.byteLength
        ) {
            throw new Error(
                "Внутренняя ошибка расчёта размера миниатюры"
            );
        }

        return {
            buffer:
                targetBuffer,

            sourceWidth:
                sourceInfo.width,

            sourceHeight:
                sourceInfo.height,

            targetWidth,

            targetHeight,

            pixelOffset:
                sourceInfo.pixelOffset,
        };
    }

    /**
     * Прочитать и проверить
     * заголовок исходного файла.
     *
     * @param {Uint8Array} bytes
     *
     * @returns {{
     *   width: number,
     *   height: number,
     *   pixelOffset: number
     * }}
     */
    _readAndValidateHeader(
        bytes
    ) {
        const TGA_HEADER_SIZE = 18;

        if (
            bytes.byteLength <
            TGA_HEADER_SIZE
        ) {
            throw new Error(
                "Файл слишком мал для TGA"
            );
        }

        /*
         * Стандартный заголовок TGA.
         */
        const imageIdLength =
            bytes[0];

        const colorMapType =
            bytes[1];

        const imageType =
            bytes[2];

        const colorMapFirstIndex =
            this._readUint16LE(
                bytes,
                3
            );

        const colorMapLength =
            this._readUint16LE(
                bytes,
                5
            );

        const colorMapEntryBits =
            bytes[7];

        const width =
            this._readUint16LE(
                bytes,
                12
            );

        const height =
            this._readUint16LE(
                bytes,
                14
            );

        const pixelDepth =
            bytes[16];

        const paletteEntryBytes =
            Math.ceil(
                colorMapEntryBits /
                8
            );

        /*
         * Начало пиксельных данных:
         *
         * 18 байт заголовка
         * + Image ID
         * + палитра.
         */
        const pixelOffset =
            TGA_HEADER_SIZE +
            imageIdLength +
            colorMapLength *
            paletteEntryBytes;

        /*
         * Проверяем Image ID ZeppOS.
         */
        if (
            imageIdLength !== 46
        ) {
            throw new Error(
                `Ожидался Image ID размером 46 байт, получено ${imageIdLength}`
            );
        }

        /*
         * SOMH:
         *
         * 0x53 = S
         * 0x4F = O
         * 0x4D = M
         * 0x48 = H
         */
        if (
            bytes[18] !== 0x53 ||
            bytes[19] !== 0x4f ||
            bytes[20] !== 0x4d ||
            bytes[21] !== 0x48
        ) {
            throw new Error(
                "В Image ID отсутствует сигнатура SOMH"
            );
        }

        /*
         * Нужен индексированный TGA:
         *
         * colorMapType = 1;
         * imageType = 1;
         * без RLE.
         */
        if (
            colorMapType !== 1 ||
            imageType !== 1
        ) {
            throw new Error(
                `Нужен индексированный TGA Type 1 без RLE. ` +
                `Получено: colorMapType=${colorMapType}, ` +
                `imageType=${imageType}`
            );
        }

        /*
         * Проверяем палитру:
         *
         * первый индекс = 0;
         * количество цветов = 256;
         * каждый цвет = 32 бита BGRA.
         */
        if (
            colorMapFirstIndex !== 0 ||
            colorMapLength !== 256 ||
            colorMapEntryBits !== 32
        ) {
            throw new Error(
                `Нужна палитра 256 × BGRA32. ` +
                `Получено: first=${colorMapFirstIndex}, ` +
                `length=${colorMapLength}, ` +
                `bits=${colorMapEntryBits}`
            );
        }

        /*
         * Каждый пиксель должен быть
         * однобайтовым индексом палитры.
         */
        if (
            pixelDepth !== 8
        ) {
            throw new Error(
                `Нужны 8-битные индексы палитры. ` +
                `Получено: ${pixelDepth} бит`
            );
        }

        if (
            width <= 0 ||
            height <= 0
        ) {
            throw new Error(
                `Некорректный размер изображения: ` +
                `${width}×${height}`
            );
        }

        /*
         * Для используемого формата:
         *
         * 18 + 46 + 256 × 4 = 1088.
         */
        if (
            pixelOffset !== 1088
        ) {
            throw new Error(
                `Ожидалось начало пикселей с байта 1088, ` +
                `получено ${pixelOffset}`
            );
        }

        /*
         * Для индексированного изображения
         * размер массива пикселей:
         *
         * width × height байт.
         */
        const requiredFileSize =
            pixelOffset +
            width *
            height;

        if (
            bytes.byteLength <
            requiredFileSize
        ) {
            throw new Error(
                `Файл повреждён: ` +
                `нужно минимум ${requiredFileSize} байт, ` +
                `получено ${bytes.byteLength}`
            );
        }

        return {
            width,
            height,
            pixelOffset,
        };
    }

    /**
     * Проверить коэффициент уменьшения.
     */
    _validateScale(
        scale
    ) {
        if (
            !Number.isInteger(
                scale
            ) ||
            scale < 2
        ) {
            throw new Error(
                "scale должен быть целым числом не меньше 2"
            );
        }
    }

    /**
     * Прочитать беззнаковое
     * 16-битное little-endian число.
     */
    _readUint16LE(
        bytes,
        offset
    ) {
        return (
            bytes[offset] |
            (
                bytes[offset + 1] <<
                8
            )
        );
    }

    /**
     * Записать беззнаковое
     * 16-битное little-endian число.
     */
    _writeUint16LE(
        bytes,
        offset,
        value
    ) {
        bytes[offset] =
            value & 0xff;

        bytes[offset + 1] =
            (
                value >>> 8
            ) & 0xff;
    }
}

export default IndexedTgaThumbnail;