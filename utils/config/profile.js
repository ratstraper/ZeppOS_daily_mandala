import { getPackageInfo } from '@zos/app';
import { getProfile, GENDER_MALE, GENDER_FEMALE } from "@zos/user";
import AppStorage from "./storage.js";
import { width, height, screenShape, platform } from "./device.js";

const squareSize = Math.min(width, height) * 1.0;
const profile = getProfile() || {};
const { age, gender, region } = profile;
const userId = `ZeppOS_${AppStorage.getInstallationId()}`;
const appInfo = getPackageInfo();


export default class Profile {

    static createRequestData() {
        return {
            info: platform,
            size: squareSize,
            age,
            gender: gender === GENDER_MALE ? "M" : gender === GENDER_FEMALE ? "F" : "U",
            region,
            version: appInfo.versionCode,
            usr: userId,
        }
    }
}




