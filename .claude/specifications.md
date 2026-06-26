# Project Specification: ZeppOS Daily Mandala

This document specifies the architecture and behavior of the `ZeppOS_daily_mandala` application.

## 1. High-Level Overview

- **Core Functionality**: The app displays a unique mandala for each day, generated from the current date, to provide a brief, daily practice for focus and calm.
- **Ecosystem**: It is part of a larger ecosystem that encourages users to visit the Soul Mandala website to mint a personal "Birth Mandala" as an NFT.

---

## 2. Architecture

The application follows a standard ZeppOS architecture, consisting of a device-side app and a companion app-side service.

- **Device App (`/`):** The code that runs on the smartwatch. It manages the UI, user interactions, and local data.
- **Companion Service (`app-side/`):** The code that runs on the connected mobile phone. It is responsible for network requests and communicating data back to the device app.

---

## 3. Modules & Pages (Application Contracts)

The application's UI is divided into several pages (screens), as defined in `app.json`. These define the primary features and user flows.

- **`page/index`**: The main entry screen of the application, likely serving as a home screen or menu.
- **`page/mandala/index`**: The core screen for displaying the daily mandala.
- **`page/practice/index`**: A screen for the "practice" feature, which likely involves interacting with the mandala and may track user statistics like practice streaks.
- **`page/collection/index`**: A screen to view a user's personal collection of mandalas, likely tied to the NFT minting feature.
- **`page/help/index`**: An information screen explaining the app's features.
- **`page/help_qr/index`**: A screen displaying a QR code that links to the Soul Mandala website.

---

## 4. System Rules & Contracts

These are the system-level rules and constraints defined in `app.json`.

### 4.1. Permissions
The application requires the following permissions to function:
- `data:os.device.info`: To get basic device information.
- `device:os.local_storage`: To save data persistently on the watch (e.g., practice history, settings).
- `device:os.network`: To make network requests via the companion service.
- `data:user.info`: To access user-profile information.

### 4.2. Supported Devices
The UI is adaptive and supports multiple screen types:
- **Round (st: "r")**: e.g., 480x480px.
- **Square (st: "s")**: e.g., 390x450px.
This indicates the presence of device-specific layout files (e.g., `*.r.layout.js`, `*.s.layout.js`).

### 4.3. Internationalization (i18n)
The app has extensive language support, with `en-US` as the default. Supported locales include:
- `pt-BR`, `vi-VN`, `id-ID`, `ru-RU`, `tr-TR`, `es-ES`, `uk-UA`, `de-DE`, `it-IT`, `zh-CN`.

---

## 5. Core Logic, Rules, and Data Contracts

The core business logic, constants, and data storage contracts are defined within the `utils/config/` directory.

### 5.1. Constants (`utils/config/constants.js`)
This file defines global, hardcoded values for the application.
- **Colors**: Defines the main color palette for the UI (e.g., `DEFAULT_COLOR: 0xfc6950`).
- **Endpoint**: The URL for the companion website is defined as `WEBSITE_URL: "https://mandala.garageno9.site"`.
- **Storage Keys**: Defines the exact keys used for persistent data storage. This is a critical contract. See the Data Storage Contract section for more details.

### 5.2. Device & Environment (`utils/config/device.js`)
This module acts as a hardware and software abstraction layer.
- **Device Info**: It retrieves and exports device properties like `width`, `height`, and `screenShape`.
- **Locale Mapping**: It implements the i18n contract by mapping ZeppOS integer language codes to standard locale strings (e.g., `2` -> `"en-US"`).
- **Date Formatting**: It provides utilities to format dates according to the user's device settings.

### 5.3. Data Storage Contract (`utils/config/storage.js`)
This module defines the schema and logic for all data stored persistently on the device.
- **Storage Keys**:
    - `INSTALL_ID`: A unique ID generated upon first app launch.
    - `MANDALA_DAY`: The date string of the last mandala the user practiced with.
    - `MANDALA_PATH`: The file path to the last generated mandala image.
    - `STREAK_DAYS`: The user's current practice streak count.
    - `BEST_STREAK`: The user's highest-ever practice streak.
- **Core Business Logic: Practice Streak**
    - The `getPracticeDays()` and `addPracticeDays()` methods contain the rules for the streak feature.
    - A practice session is counted by calling `setMandalaData()`.
    - **Rule**: The streak is incremented by 1 if the user performs a practice on the day immediately following their last practice.
    - **Rule**: The streak is reset to 0 if there is a gap of one or more days between practices.
    - **Rule**: Multiple practices on the same day do not increase the streak further.
    - The `best` streak is updated whenever the current streak surpasses it.

---

## 6. Page Logic & Flow

The `page/` directory contains the logic for each screen of the application.

### 6.1. Main Menu (`page/index.js`)
- **Role**: This is the central navigation hub of the application.
- **UI**: It builds a vertical, scrollable menu with three main interactive elements:
    1.  A button to navigate to the **Practice** screen (`page/practice/index`).
    2.  A button to navigate to the **Collection** screen (`page/collection/index`).
    3.  A help icon to navigate to the **Help** screen (`page/help/index`), passing a specific set of help slides as a parameter.
- **Interaction**:
    - The page is fully navigable using both touch input and the physical up/down/select buttons.
    - A visual "selected" state is applied to the focused menu item.

### 6.2. Practice Screen (`page/practice/index.js`)
- **Role**: This is the core functional screen for the daily practice feature.
- **State Machine**: The screen operates as a state machine, managing the UI based on the current state:
    - `SCREEN_IDLE`: The initial state. It displays the main "Open" button, along with the user's current and best practice streaks (e.g., "Streak 5 · Best 10") and a status ("Done today" or "Not yet today"). This data is loaded from `AppStorage` when the page initializes.
    - `SCREEN_LOADING`: Triggered by tapping "Open". It displays a loading animation while fetching the mandala.
    - `SCREEN_RESULT`: On a successful fetch, it displays the downloaded mandala image. The screen is kept awake while the mandala is visible.
    - `SCREEN_ERROR`: If the fetch fails, it displays a connection error message.
- **Core Action - `fetchData()`**:
    - **Trigger**: Tapping the "Open" button in the `IDLE` state.
    - **Process**: It initiates a `request` to the companion app service with the method `GET_MANDALA`.
    - **Device-to-Companion Contract**: The request sends a payload containing:
        - The current date (`mandalaDay`).
        - A unique user ID.
        - Device information (platform, screen size).
        - User profile data (age, gender, region).
    - **Outcome**:
        - On success, the companion service returns a `filePath` to the generated mandala image.
        - The app calls `AppStorage.setMandalaData()`, which records the practice and updates the user's streak according to the rules in `storage.js`.
        - The UI transitions to `SCREEN_RESULT` to display the image.

---

## 7. Companion Logic (`app-side/index.js`)

The companion service runs on the user's phone and acts as the bridge between the watch and the internet backend.

### 7.1. Request Router
The service listens for requests from the watch and routes them based on the `method` property:
- **`GET_MANDALA`**: The primary method. It triggers the process of fetching the daily mandala image.
- **`GET_COLLECTION`**: A method to retrieve the user's NFT collection. Currently returns a hardcoded list for demonstration.
- **`OPEN_MANDALA`**: A placeholder method, likely intended for future analytics.

### 7.2. Core Flow: `getMandala()`
This function orchestrates the entire backend and file transfer process.
- **API Contract (Companion-to-Backend)**:
    - It calls a backend API endpoint: `https://mandala.garageno9.site/api/watch/${day}/${size}`.
    - It sends the watch's device info as a `User-Agent` header.
    - It sends the user's profile (`age`, `gender`, `region`) and unique ID in a custom `X-User` header.
- **Process**:
    1.  **Download**: It uses the `network.downloader` to download the image file from the API.
    2.  **Convert**: Upon successful download, it uses `image.convert()` to transform the image into a device-specific format that the ZeppOS can render efficiently. This is a mandatory step.
    3.  **Transfer**: It uses `transferFile.getOutbox().enqueueFile()` to send the converted image file over Bluetooth to the watch's local storage.
    4.  **Confirm**: It waits for the `transferred` event from the file transfer. Only after the file is successfully on the watch does it send the final "Ok" response back to the device app, along with the local `filePath` for the new image. This ensures the device app never tries to access a file that doesn't exist yet.

---

## 8. Remaining Minor Components

The primary architecture and logic have been documented. Minor remaining components for a complete line-by-line analysis are:
- **Component Logic (`utils/components/`)**: The specific implementation of the `LoadingAnimationComponent`.
- **Other Pages**: The detailed UI logic for the `collection` and `help` pages.
