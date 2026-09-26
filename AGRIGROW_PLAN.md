# AgriGrow Product and Implementation Plan

## 1. Product Summary

AgriGrow is an offline-first mobile application for farmers and home growers in Davao del Sur. Its primary feature is a crop calendar that records planted crops, schedules future farming activities, and delivers local reminders for tasks such as fertilizing and harvesting.

The application also provides:

- An offline Gemma 4 agricultural chat assistant
- Local fruit and vegetable market prices for Davao del Sur
- Cached local weather information
- A crop almanac containing crop names and descriptions
- Automatic synchronization whenever internet connectivity becomes available

An authenticated web dashboard will allow administrators to manage dummy market-price and weather records stored in Firebase.

## 2. Initial Scope

### Target platform

- Android first
- React Native with Expo Development Builds
- Portrait phone layout first
- English initially, with Filipino and Cebuano support considered later

### Geographic scope

- Province: Davao del Sur
- Prices organized by city or municipality and public market
- Schema designed so additional Philippine provinces can be added later

### MVP priorities

1. Prove that Gemma 4 can run offline on a target Android phone.
2. Build reliable crop calendar tracking and local notifications.
3. Provide a locally installed crop almanac.
4. Synchronize Davao del Sur market prices from Firebase.
5. Synchronize dummy weather information from Firebase.
6. Connect the AI assistant to local calendar, almanac, price, and weather data.

## 3. Product Principles

### Offline first

Core features must remain usable without Wi-Fi or mobile data:

- View and manage planted crops
- View scheduled activities
- Receive local reminders
- Browse installed almanac content
- Chat with the downloaded on-device model
- View the last downloaded prices and weather

The interface must always show when remote information was last updated.

### Local data is the application source of truth

Screens should read from the local SQLite database. Firebase is a synchronization source, not a runtime requirement for rendering the application.

### AI does not own factual data

Gemma may explain information and propose actions, but exact prices, weather values, calendar dates, and crop records must come from deterministic application functions and the local database.

### User confirmation before mutations

The AI may propose creating or changing a planting or activity, but the user must confirm the proposed change before the application saves it or schedules a notification.

## 4. Confirmed Technology Stack

### Mobile application

- Expo SDK 57.0.23 or the latest compatible SDK 57 patch
- React Native 0.86.3
- React 19.2.3
- TypeScript
- Expo Development Build, not Expo Go
- Expo Router for navigation
- Expo SQLite for application-owned local data
- Expo Notifications for local notifications
- Expo Background Task or platform scheduling where appropriate
- React Native Firebase for Firebase Authentication and Cloud Firestore
- Custom local Expo module written in Kotlin for Gemma inference
- LiteRT-LM or the current supported Google AI Edge runtime for on-device inference

### Admin website

- React and TypeScript
- A lightweight build tool such as Vite
- Firebase Authentication
- Cloud Firestore
- Firebase Hosting

### Firebase services

- Firebase Authentication for administrators
- Cloud Firestore for market prices, weather, and remotely managed almanac updates
- Firebase Storage only if remote crop images or downloadable assets are needed
- Firebase Hosting for the admin website
- Cloud Functions or Cloud Run later for automated weather ingestion

## 5. High-Level Architecture

```text
                           ONLINE SERVICES

  Admin Web Dashboard
      |-- Price management
      |-- Weather management
      |-- Almanac updates
      `-- Admin authentication
                  |
                  v
          Firebase / Firestore
                  |
          synchronize when online
                  |
                  v
  +------------------------------------------------------+
  |                 AgriGrow Android App                  |
  |                                                      |
  |  React Native UI                                     |
  |       |                                              |
  |       +--> Calendar and notifications                |
  |       +--> Prices and weather                        |
  |       +--> Almanac                                   |
  |       `--> AI chat                                   |
  |                    |                                 |
  |                    v                                 |
  |              Local data tools                        |
  |                    |                                 |
  |       +------------+-------------+                   |
  |       v                          v                   |
  |  SQLite database       Kotlin Gemma native module   |
  |                              |                       |
  |                              v                       |
  |                       Local Gemma model              |
  +------------------------------------------------------+
```

## 6. Mobile Navigation and User Experience

Because crop tracking is the main feature, the recommended navigation is:

1. Home / Calendar
2. Market Prices
3. AI Chat
4. Weather
5. Almanac

The AI chat can remain visually prominent through a floating assistant button or a central navigation action.

### Home screen

The home screen should show:

- Crops currently growing
- Activities due today
- Upcoming activities
- Overdue activities
- Expected harvests
- Latest cached weather summary
- Last synchronization time
- Online or offline state

### Offline state presentation

Remote information should include explicit freshness information, for example:

```text
Offline - showing downloaded prices
Last synchronized: September 18, 2026 at 8:30 AM
```

The absence of cached data must be distinguished from an empty server result.

## 7. Calendar Tracking

### Planting record

Each planted crop creates a planting record.

| Field | Purpose |
| --- | --- |
| `id` | Local UUID |
| `cropId` | Link to the almanac crop |
| `displayName` | User-defined planting name |
| `plantedDate` | Date planted |
| `locationName` | Garden, farm, plot, or optional free text |
| `quantity` | Optional number of plants |
| `area` | Optional planted area |
| `notes` | Optional user notes |
| `status` | Planned, growing, harvested, failed, or archived |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last modification timestamp |

### Activity record

Each planting can have multiple scheduled or completed activities.

| Field | Purpose |
| --- | --- |
| `id` | Local UUID |
| `plantingId` | Parent planting |
| `type` | Planting, watering, fertilizing, transplanting, pest inspection, harvesting, or custom |
| `title` | User-visible activity title |
| `scheduledAt` | Scheduled local date and time |
| `reminderOffsetMinutes` | Notification time relative to the activity |
| `repeatRule` | Optional recurrence configuration |
| `status` | Scheduled, completed, skipped, or overdue |
| `completedAt` | Optional completion timestamp |
| `notes` | Optional notes |
| `notificationId` | Platform notification identifier |
| `createdAt` | Creation timestamp |
| `updatedAt` | Last modification timestamp |

### Initial activity types

- Planting
- Watering
- Fertilizing
- Transplanting
- Pest inspection
- Harvesting
- Custom activity

### Notification behavior

- Notifications are scheduled locally and must not require internet access.
- Editing or deleting an activity must cancel and replace its existing notification.
- Completing an activity must cancel any future notification for that occurrence.
- Notifications must be reconstructed when necessary after application changes or device events.
- The app should avoid exact alarms unless exact-to-the-minute delivery is essential.
- Notification permission denial must not prevent calendar usage.
- The app must provide an in-app list of upcoming activities even when system notifications are disabled.

### Future enhancement

The almanac may later provide suggested schedules such as expected fertilizing or harvesting offsets. Suggestions must be presented for confirmation and never silently scheduled.

## 8. Almanac

### MVP content

The almanac is initially a locally installed catalog of crops with descriptions.

Required fields:

| Field | Purpose |
| --- | --- |
| `id` | Stable crop identifier such as `tomato` |
| `name` | English crop name |
| `localName` | Optional Filipino or Cebuano name |
| `scientificName` | Optional scientific name |
| `category` | Fruit or vegetable |
| `description` | Reviewed crop description |
| `imageAsset` | Optional bundled or cached image |
| `contentVersion` | Almanac content version |
| `source` | Reference for the information |

Optional future fields:

- Typical growth duration
- Preferred planting season
- Sunlight and watering needs
- Suitable soil
- Common pests and diseases
- Harvest indicators
- Suggested activity templates

### Distribution

- A baseline almanac is bundled with the application.
- Firebase may supply reviewed revisions and additional crops.
- Downloaded updates are stored in SQLite.
- The bundled content remains available on a first launch with no internet.

### Content quality

Descriptions and farming guidance should be reviewed against reliable Philippine agricultural sources. AI-generated text must not be published as authoritative almanac content without review.

## 9. Market Prices

### MVP coverage

- Fruits and vegetables
- Davao del Sur
- Selected cities or municipalities
- Selected public markets
- Manually entered dummy data through the admin website

### Price record

| Field | Purpose |
| --- | --- |
| `id` | Firestore document identifier |
| `cropId` | Shared crop identifier |
| `commodityName` | Display name captured with the observation |
| `variety` | Optional variety |
| `category` | Fruit or vegetable |
| `provinceCode` | Stable code for Davao del Sur |
| `provinceName` | Davao del Sur |
| `localityCode` | City or municipality code |
| `localityName` | City or municipality name |
| `marketId` | Market identifier |
| `marketName` | Public market name |
| `priceType` | Retail or wholesale |
| `amount` | Numeric PHP value |
| `unit` | Kilogram, piece, bundle, sack, or another defined unit |
| `observedAt` | Date the price was collected |
| `publishedAt` | Server publication timestamp |
| `source` | Manual survey or source label |
| `notes` | Optional remarks |
| `isActive` | Whether the record should be visible |

### Rules

- Price observations are append-only historical records.
- Corrected records should retain an audit trail where practical.
- Do not overwrite the previous day's value with the latest price.
- The app calculates latest price and trends from dated observations.
- Currency and units must always be displayed.
- Every price screen must show market and observation date.

### Mobile views

- Latest prices
- Search and filter by crop
- Filter by locality and market
- Price detail
- Historical list
- Simple price trend chart after enough data exists

## 10. Weather

### MVP

Weather data is manually created in the admin website and stored in Firestore.

Suggested fields:

- Location code and name
- Condition
- Temperature
- Minimum and maximum temperature
- Humidity
- Rain probability
- Wind speed
- Agricultural advisory
- Forecast date
- Observation or publication timestamp
- Data source

### Rules

- Weather values must show their valid date and last update time.
- Cached forecasts remain viewable offline.
- Stale data must be labeled clearly.
- The schema must support replacing manual data with a real weather provider later.

### Future integration

A scheduled backend job may retrieve forecasts from a weather provider and write normalized records into the existing Firestore schema. The mobile application should not need a major redesign when this happens.

## 11. Offline Data and Synchronization

### Local database responsibilities

SQLite stores:

- Plantings
- Activities
- Almanac crops
- Cached market observations
- Cached weather records
- Synchronization metadata
- AI conversation metadata if chat history is retained
- Pending local operations if cloud backup is added

### Firestore responsibilities

Firestore stores:

- Administrator-managed price observations
- Administrator-managed weather records
- Reviewed almanac updates
- Admin profiles and roles
- Optional future user backup data

### Synchronization strategy

1. The app renders existing SQLite data immediately.
2. When online, it requests records newer than the last successful synchronization cursor.
3. New records are validated and written to SQLite in a transaction.
4. The synchronization cursor advances only after the transaction succeeds.
5. UI queries react to the local database change.
6. Failed synchronization retains the prior cache and schedules a later retry.

### Connectivity behavior

- Synchronize at application start when online.
- Synchronize when the application returns to the foreground if data is stale.
- Schedule constrained background work that requires network connectivity.
- Respond to restored connectivity without repeatedly polling.
- Use retry with exponential backoff for transient failures.
- Do not erase valid cached data because a refresh failed.

### Conflict policy

For the MVP, price, weather, and almanac remote data are administrator-owned and read-only on mobile, so there is no client conflict.

Plantings and activities are local-only initially. If cloud backup is later introduced, each record will need version metadata, deletion tombstones, and a documented conflict-resolution policy.

## 12. Gemma 4 Offline Assistant

### Recommended initial model

- Gemma 4 E2B instruction-tuned variant
- Mobile-optimized and quantized format supported by the chosen LiteRT-LM runtime
- E4B considered only after measuring E2B performance and quality

### Hugging Face usage

- A developer Hugging Face read token may be used during development to download an approved model.
- Required model terms must be accepted before download.
- The token must never be committed to Git.
- The token must never be embedded in the APK or exposed to end users.
- Calling a Hugging Face inference API is not offline inference and is not the production architecture.

### Model delivery options

Preferred approach:

1. Ship the application without the large model.
2. Offer an optional first-time model download over Wi-Fi.
3. Verify file integrity after download.
4. Store the model in application-private storage.
5. Allow the user to remove and re-download the model.
6. Show download size and required free storage before starting.

Bundling the model in the APK is a fallback because it substantially increases installation size.

### Native bridge

A local Expo module written in Kotlin will expose a small TypeScript API, for example:

```ts
type GenerateOptions = {
  temperature?: number;
  maxTokens?: number;
};

type GemmaModule = {
  loadModel(modelPath: string): Promise<void>;
  generate(prompt: string, options?: GenerateOptions): Promise<string>;
  cancelGeneration(): Promise<void>;
  unloadModel(): Promise<void>;
};
```

Generation must run away from the UI thread and support cancellation.

### Grounding and application tools

The assistant should eventually use deterministic local tools:

- `search_almanac`
- `get_crop_description`
- `get_latest_cached_price`
- `get_cached_weather`
- `get_active_plantings`
- `get_upcoming_activities`
- `propose_planting`
- `propose_activity`

Read operations can return data directly. Write proposals must display a confirmation screen before database mutation.

### Safety and transparency

- Label the assistant as AI-generated guidance.
- Show the source and date for price and weather facts.
- State when no cached information is available.
- Avoid presenting generated pesticide, dosage, or food-safety advice as authoritative.
- Do not allow the model to fabricate a calendar save confirmation.
- Record the exact structured action separately from generated conversational text.

## 13. Gemma Technical Go/No-Go Spike

This spike must happen before the full chat feature is considered committed.

### Spike steps

1. Configure an Expo development build for Android.
2. Create a minimal local Kotlin Expo module.
3. Add the chosen Google AI Edge or LiteRT-LM dependency.
4. Download and prepare the Gemma 4 E2B mobile model.
5. Copy or download the model to application-private storage.
6. Load the model on a physical Android phone.
7. Send a prompt from React Native to Kotlin.
8. Stream or return the generated response to React Native.
9. Repeat while airplane mode is enabled.
10. Test cancellation and clean model unloading.

### Measurements

- Model download size
- Installed storage usage
- Peak application RAM
- Model load time
- Time to first token
- Tokens per second
- Device temperature during repeated prompts
- Crash behavior under low memory
- Minimum usable device specification

### Acceptance criteria

- Inference works with all network connections disabled.
- The application does not freeze while generating.
- A user can cancel generation.
- Memory use does not consistently terminate the application on the target device.
- Response latency is acceptable for a chat interaction.
- The license and distribution method are documented.

If the spike fails, evaluate a smaller compatible model or bare React Native/native Android integration before building the complete assistant.

## 14. Admin Web Dashboard

### Authentication

- No public write access
- Firebase Authentication for administrators
- Role or allowlist check before displaying management features
- Firestore Security Rules enforce authorization independently of the UI

### Main sections

- Dashboard summary
- Crops/almanac management
- Markets and locations
- Price observations
- Weather records
- Administrator management, if needed

### Price workflow

1. Select crop.
2. Select locality and market.
3. Select retail or wholesale.
4. Enter price and unit.
5. Enter observation date and source.
6. Validate and publish.

### Weather workflow

1. Select location.
2. Enter forecast values.
3. Enter valid date and time.
4. Enter advisory and source.
5. Validate and publish.

### Validation requirements

- Positive numeric prices
- Defined unit selection
- Required market and observation date
- Server timestamps for publication
- No arbitrary client-controlled admin role assignment
- Clear draft, published, or inactive state where appropriate

## 15. Firebase Collection Outline

An initial Firestore structure may be:

```text
admins/{uid}
provinces/{provinceId}
localities/{localityId}
markets/{marketId}
crops/{cropId}
priceObservations/{observationId}
weatherLocations/{locationId}
weatherRecords/{recordId}
contentVersions/{contentType}
```

### Index considerations

Likely composite queries include:

- Active price observations by market, crop, and observation date
- Latest prices by locality and observation date
- Weather records by location and forecast date
- Active crops by category and name

Indexes should be added based on actual application queries rather than speculative combinations.

## 16. Security and Privacy

- Never commit Hugging Face tokens, Firebase service-account keys, or other secrets.
- Client Firebase configuration is not treated as a secret; Firestore rules provide authorization.
- Only authenticated authorized administrators may write prices, weather, or remote almanac content.
- Mobile users receive read-only access to published public content.
- Calendar data remains on the device during the MVP unless the user explicitly opts into a future backup feature.
- Avoid storing sensitive free-text data unnecessarily.
- Model files must be integrity-checked before loading.
- All remote data must be validated before insertion into the local database.

## 17. Suggested Repository Structure

The mobile project currently occupies the repository root. It can begin with the following structure:

```text
AgriGrow/
|-- app/                         # Expo Router routes
|-- src/
|   |-- components/
|   |-- features/
|   |   |-- ai/
|   |   |-- almanac/
|   |   |-- calendar/
|   |   |-- market/
|   |   `-- weather/
|   |-- database/
|   |-- notifications/
|   |-- sync/
|   |-- firebase/
|   |-- hooks/
|   |-- theme/
|   `-- types/
|-- modules/
|   `-- agrigrow-gemma/          # Local Expo Kotlin module
|-- assets/
|   `-- almanac/                 # Bundled baseline content and images
|-- admin/                       # React admin website
|-- firebase/
|   |-- firestore.rules
|   |-- firestore.indexes.json
|   `-- firebase.json
|-- docs/
|-- app.json
|-- eas.json
|-- package.json
`-- AGRIGROW_PLAN.md
```

If maintaining the admin site inside the same repository creates tooling conflicts, it may be moved into a workspace after the mobile foundation is stable.

## 18. Delivery Phases

### Phase 0: Project foundation

- Confirm SDK 57 dependencies with Expo Doctor.
- Add linting, formatting, and test scripts.
- Establish environment configuration.
- Add Expo Router and initial navigation.
- Configure an Android application identifier.
- Create a development-build profile.
- Establish theme, typography, and reusable UI primitives.

### Phase 1: Gemma feasibility spike

- Implement the technical spike in Section 13.
- Document measurements and supported test devices.
- Decide model format and distribution approach.
- Make the go/no-go decision before expanding chat.

### Phase 2: Local data foundation

- Add SQLite schema and migrations.
- Add repositories for plantings, activities, crops, prices, and weather.
- Bundle initial almanac seed data.
- Add synchronization metadata.
- Add database tests.

### Phase 3: Calendar MVP

- Create planting flow.
- Planting list and detail screens.
- Create, edit, complete, skip, and delete activities.
- Calendar and agenda views.
- Local notifications.
- Permission-denied and reboot recovery behavior.
- Offline acceptance testing.

### Phase 4: Almanac MVP

- Crop list and search.
- Crop detail with description.
- Fruit and vegetable filters.
- Link crop details to planting creation.
- Add reviewed starter content.

### Phase 5: Firebase and admin foundation

- Create Firebase projects or environments.
- Configure Authentication, Firestore, rules, indexes, and Hosting.
- Build admin login and role enforcement.
- Add location, market, and crop management.
- Add emulator-based security rule tests.

### Phase 6: Market prices

- Admin price-entry workflow.
- Mobile synchronization into SQLite.
- Latest-price, filtering, detail, and history views.
- Offline freshness indicators.
- Add trend charts after sufficient records exist.

### Phase 7: Weather

- Admin dummy-weather workflow.
- Mobile synchronization into SQLite.
- Current and forecast presentation.
- Staleness indicators and offline behavior.
- Preserve a provider-neutral schema for future automation.

### Phase 8: Full AI chat

- Production chat UI and local history.
- Model download, verification, removal, and update UX.
- Local almanac retrieval.
- Read-only calendar, price, and weather tools.
- Structured planting and activity proposals.
- Confirmation flows for all writes.
- Safety messages, data dates, and source display.

### Phase 9: Hardening and release

- End-to-end offline and reconnection tests.
- Low-memory and low-storage tests.
- Notification reliability tests.
- Firebase rules and authorization review.
- Accessibility and large-font review.
- Performance and battery testing.
- Crash reporting with privacy review.
- Signed Android test build and staged distribution.

## 19. Testing Strategy

### Unit tests

- Date calculations
- Activity recurrence
- Reminder offsets
- Price normalization
- Data validation
- Synchronization cursor handling
- AI structured-action validation

### Integration tests

- SQLite migrations
- Repository queries
- Firestore-to-SQLite synchronization
- Admin authorization rules
- Notification scheduling and cancellation
- Model download integrity
- Native Gemma bridge lifecycle

### Manual device scenarios

- First launch without internet
- First launch with no AI model downloaded
- Model download interruption and retry
- Chat in airplane mode
- Create planting and reminders offline
- Restart the phone before a reminder
- Deny notification permission
- Lose connectivity during synchronization
- Restore Wi-Fi and mobile data separately
- View stale price and weather information
- Low storage during model download
- Repeated AI prompts under memory pressure

## 20. MVP Definition of Done

The MVP is complete when:

- A user can create and manage a planted crop fully offline.
- A user can schedule fertilizing, harvesting, and custom activities.
- The phone produces local reminders without Firebase connectivity.
- The almanac includes a reviewed starter set of crop descriptions.
- An administrator can publish Davao del Sur dummy price and weather records.
- The mobile app synchronizes and retains those records for offline viewing.
- The app clearly displays data source, observation date, and last sync time.
- Gemma produces responses on-device with all networks disabled.
- Gemma can answer from local almanac data and read cached application data.
- AI-proposed calendar changes require explicit confirmation.
- No private Hugging Face or Firebase administrative credentials are present in the mobile bundle.
- Critical offline, notification, synchronization, and authorization tests pass.

## 21. Risks and Mitigations

| Risk | Mitigation |
| --- | --- |
| Gemma is too slow or memory-heavy | Run the feasibility spike first; start with E2B; define minimum device requirements; evaluate a smaller model if needed. |
| Model download is too large | Make it optional, Wi-Fi-friendly, resumable, removable, and integrity-checked. |
| Expo/native AI incompatibility | Use a custom Kotlin Expo module; validate early; retain the option to move to bare React Native before full feature development. |
| Notifications are delayed by Android battery policies | Use appropriate local scheduling, explain battery restrictions, and always show activities inside the app. |
| Cached price or weather looks current | Display observation time, last sync time, and stale/offline labels everywhere. |
| Firestore cache is incomplete | Maintain a deliberate SQLite cache populated by synchronization rather than relying only on incidental Firestore reads. |
| AI invents facts or actions | Use deterministic local tools, structured outputs, validation, citations/dates, and confirmation before writes. |
| Poor agricultural guidance | Use reviewed sources and clearly separate official content from generated explanation. |
| Admin credentials or model token leaks | Enforce rules, use environment secrets, never embed administrative tokens, and scan commits before release. |

## 22. Immediate Next Actions

1. Run `npx expo-doctor@latest` and resolve any dependency mismatch.
2. Choose the Android package identifier, for example `com.example.agrigrow`, replacing `example` with the actual organization or developer name.
3. Add Expo Router and create placeholder screens for Calendar, Prices, AI Chat, Weather, and Almanac.
4. Configure an Expo development build instead of relying on Expo Go.
5. Create the local Kotlin module skeleton for Gemma.
6. Select and download the Gemma 4 E2B mobile artifact for development without committing the model or token.
7. Complete the offline Gemma feasibility spike.
8. After the spike passes, implement SQLite migrations and the calendar domain model.

## 23. Decisions Still Needed

- Exact initial Davao del Sur city, municipality, and public-market coverage
- Initial crop list and authoritative content sources
- Target minimum Android version and minimum device RAM
- Whether users must sign in or remain fully local for the MVP
- Whether calendar backup and multi-device synchronization belong in the MVP
- Model download hosting and update strategy
- Supported interface languages for the first release
- Branding, logo, colors, and final application name presentation

These decisions should be made before their corresponding phase begins; they do not block the initial Gemma feasibility spike or local calendar foundation.
