import { getDeviceInfo } from "@zos/device";
import { getSystemInfo } from "@zos/settings";

const deviceInfo = getDeviceInfo(); 
const systemInfo = getSystemInfo() || {};

const {
  osVersion = "?",
  firmwareVersion = "?",
  sdkVersion = "?",
  minAPI = "?"
} = systemInfo;

export const {
  width,
  height,
  screenShape,
  deviceName = "?",
  productId = 0,
  productVer = 0,
  deviceSource = 0,
} = deviceInfo;
export const platform = `${deviceName}/${osVersion}/${minAPI}, FV:${firmwareVersion}, SDK:${sdkVersion}, ${productId}.${productVer}.${deviceSource}, SCREEN:${width},${height},${screenShape}`;

export const { width: DEVICE_WIDTH, height: DEVICE_HEIGHT} = getDeviceInfo();

